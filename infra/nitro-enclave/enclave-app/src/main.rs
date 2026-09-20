mod framing;
mod kms_sign;
mod policy;

use std::env;

use serde::{Deserialize, Serialize};
use tokio_vsock::{VsockAddr, VsockListener};
use tracing::{error, info, warn};

use crate::kms_sign::{kms_sign, AwsCreds};
use crate::policy::{enforce, CanonicalTransaction, PolicySnapshot};

/// Default vsock port the parent connects to.
const DEFAULT_LISTEN_PORT: u32 = 5000;
/// VMADDR_CID_ANY — listen on all context IDs inside the enclave.
const VMADDR_CID_ANY: u32 = u32::MAX;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignRequest {
    transaction_id: String,
    canonical_transaction_json: String,
    kms_key_id: String,
    /// Independent policy snapshot — enclave re-validates; do not trust parent.
    policy_snapshot: PolicySnapshot,
    #[serde(default)]
    aws_credentials: Option<AwsCredsJson>,
    #[serde(default)]
    region: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AwsCredsJson {
    access_key_id: String,
    secret_access_key: String,
    #[serde(default)]
    session_token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SignResponse {
    transaction_id: String,
    decision: String,
    reasons: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    failed_check: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG").unwrap_or_else(|_| "enclave_app=info".into()),
        )
        .json()
        .init();

    let port: u32 = env::var("VSOCK_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_LISTEN_PORT);

    let addr = VsockAddr::new(VMADDR_CID_ANY, port);
    let listener = VsockListener::bind(addr).unwrap_or_else(|e| {
        eprintln!("failed to bind vsock port {port}: {e}");
        std::process::exit(1);
    });

    info!(port, "LimitX enclave-app listening on vsock");

    loop {
        match listener.accept().await {
            Ok((mut stream, peer)) => {
                info!(?peer, "accepted vsock connection");
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(&mut stream).await {
                        error!(error = %e, "connection handler failed");
                    }
                });
            }
            Err(e) => {
                error!(error = %e, "accept failed");
            }
        }
    }
}

async fn handle_connection(stream: &mut tokio_vsock::VsockStream) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let raw = framing::read_message(stream).await?;
    let req: SignRequest = serde_json::from_slice(&raw)?;

    if let Some(ref region) = req.region {
        env::set_var("AWS_REGION", region);
    }

    let txn: CanonicalTransaction = serde_json::from_str(&req.canonical_transaction_json)
        .map_err(|e| format!("canonicalTransactionJson parse: {e}"))?;

    // Defense in depth: re-run Prompt 5 hard checks from the snapshot
    let policy = enforce(&req.policy_snapshot, &txn);
    if policy.decision != "ALLOWED" {
        let resp = SignResponse {
            transaction_id: req.transaction_id,
            decision: policy.decision,
            reasons: policy.reasons,
            signature: None,
            failed_check: policy.failed_check,
            error: None,
        };
        framing::write_message(stream, &serde_json::to_vec(&resp)?).await?;
        return Ok(());
    }

    let creds = resolve_creds(&req);
    let message = req.canonical_transaction_json.as_bytes();

    let resp = match creds {
        None => {
            warn!("no AWS credentials available for KMS Sign");
            SignResponse {
                transaction_id: req.transaction_id,
                decision: "DENIED".into(),
                reasons: vec!["kms_credentials_missing".into()],
                signature: None,
                failed_check: None,
                error: Some("Set AWS_* env at enclave launch or pass awsCredentials".into()),
            }
        }
        Some(c) => match kms_sign(&req.kms_key_id, message, &c).await {
            Ok(signature) => SignResponse {
                transaction_id: req.transaction_id,
                decision: "ALLOWED".into(),
                reasons: policy.reasons,
                signature: Some(signature),
                failed_check: None,
                error: None,
            },
            Err(e) => {
                error!(error = %e, "kms sign failed");
                SignResponse {
                    transaction_id: req.transaction_id,
                    decision: "DENIED".into(),
                    reasons: vec!["kms_sign_failed".into()],
                    signature: None,
                    failed_check: None,
                    error: Some(e.to_string()),
                }
            }
        },
    };

    framing::write_message(stream, &serde_json::to_vec(&resp)?).await?;
    Ok(())
}

fn resolve_creds(req: &SignRequest) -> Option<AwsCreds> {
    if let Some(ref c) = req.aws_credentials {
        return Some(AwsCreds {
            access_key_id: c.access_key_id.clone(),
            secret_access_key: c.secret_access_key.clone(),
            session_token: c.session_token.clone(),
        });
    }
    AwsCreds::from_env()
}
