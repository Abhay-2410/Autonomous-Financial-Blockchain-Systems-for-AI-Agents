//! KMS Sign through the parent vsock-proxy.
//!
//! Parent (outside enclave) must run:
//!   vsock-proxy 8000 kms.<region>.amazonaws.com 443 --config /etc/nitro_enclaves/vsock-proxy.yaml
//!
//! The enclave has no NIC — only vsock to CID 3 (host). We open a TCP-like
//! vsock stream to port 8000, speak TLS (SNI = kms.<region>.amazonaws.com),
//! and call KMS Sign with SigV4 using credentials injected at enclave launch
//! (or from the request's optional awsCredentials field).

use std::env;
use std::sync::Arc;
use std::time::SystemTime;

use aws_credential_types::Credentials;
use aws_sigv4::http_request::{sign, SignableBody, SignableRequest, SigningSettings};
use aws_sigv4::sign::v4;
use bytes::Bytes;
use http::{Method, Request, Uri};
use rustls::pki_types::ServerName;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_rustls::TlsConnector;
use tokio_vsock::VsockStream;

const VMADDR_CID_HOST: u32 = 3;

#[derive(Debug, thiserror::Error)]
pub enum KmsError {
    #[error("vsock connect to host:{port}: {source}")]
    Vsock {
        port: u32,
        source: std::io::Error,
    },
    #[error("tls: {0}")]
    Tls(String),
    #[error("http: {0}")]
    Http(String),
    #[error("kms api: {0}")]
    Api(String),
    #[error("missing AWS credentials (set env or pass awsCredentials)")]
    NoCredentials,
}

#[derive(Clone)]
pub struct AwsCreds {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
}

impl AwsCreds {
    pub fn from_env() -> Option<Self> {
        let access_key_id = env::var("AWS_ACCESS_KEY_ID").ok()?;
        let secret_access_key = env::var("AWS_SECRET_ACCESS_KEY").ok()?;
        if access_key_id.is_empty() || secret_access_key.is_empty() {
            return None;
        }
        Some(Self {
            access_key_id,
            secret_access_key,
            session_token: env::var("AWS_SESSION_TOKEN").ok(),
        })
    }
}

pub fn kms_proxy_port() -> u32 {
    env::var("KMS_PROXY_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8000)
}

pub fn aws_region() -> String {
    env::var("AWS_REGION")
        .or_else(|_| env::var("AWS_DEFAULT_REGION"))
        .unwrap_or_else(|_| "eu-north-1".into())
}

/// ECDSA_SHA_256 over the message bytes (KMS hashes internally when MessageType=RAW).
pub async fn kms_sign(
    key_id: &str,
    message: &[u8],
    creds: &AwsCreds,
) -> Result<String, KmsError> {
    let region = aws_region();
    let proxy_port = kms_proxy_port();
    let host = format!("kms.{region}.amazonaws.com");

    let message_b64 = base64_encode(message);
    let body = serde_json::json!({
        "KeyId": key_id,
        "Message": message_b64,
        "MessageType": "RAW",
        "SigningAlgorithm": "ECDSA_SHA_256"
    })
    .to_string();
    let body_bytes = Bytes::from(body);

    let uri: Uri = format!("https://{host}/")
        .parse()
        .map_err(|e| KmsError::Http(format!("uri: {e}")))?;

    let mut builder = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("content-type", "application/x-amz-json-1.1")
        .header("x-amz-target", "TrentService.Sign")
        .header("host", &host);

    let unsigned = builder
        .body(body_bytes.clone())
        .map_err(|e| KmsError::Http(format!("build: {e}")))?;

    let credentials = Credentials::new(
        &creds.access_key_id,
        &creds.secret_access_key,
        creds.session_token.clone(),
        None,
        "enclave-app",
    );
    let identity = credentials.into();
    let signing_settings = SigningSettings::default();
    let signing_params = v4::SigningParams::builder()
        .identity(&identity)
        .region(&region)
        .name("kms")
        .time(SystemTime::now())
        .settings(signing_settings)
        .build()
        .map_err(|e| KmsError::Http(format!("signing params: {e}")))?;

    let signable = SignableRequest::new(
        unsigned.method().as_str(),
        unsigned.uri().to_string(),
        unsigned
            .headers()
            .iter()
            .map(|(k, v)| (k.as_str(), std::str::from_utf8(v.as_bytes()).unwrap_or(""))),
        SignableBody::Bytes(&body_bytes),
    )
    .map_err(|e| KmsError::Http(format!("signable: {e}")))?;

    let (instructions, _sig) = sign(signable, &signing_params.into())
        .map_err(|e| KmsError::Http(format!("sign: {e}")))?
        .into_parts();

    let mut signed = unsigned;
    instructions
        .apply_to_request_http1x(&mut signed)
        .map_err(|e| KmsError::Http(format!("apply: {e}")))?;

    // --- vsock → TLS to KMS ---
    let vsock = VsockStream::connect(VMADDR_CID_HOST, proxy_port)
        .await
        .map_err(|source| KmsError::Vsock {
            port: proxy_port,
            source,
        })?;

    let mut root_store = rustls::RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let tls_config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(tls_config));
    let server_name = ServerName::try_from(host.clone())
        .map_err(|e| KmsError::Tls(format!("sni: {e}")))?;
    let mut tls = connector
        .connect(server_name, vsock)
        .await
        .map_err(|e| KmsError::Tls(e.to_string()))?;

    let path = signed.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/");
    let mut req_buf = format!("POST {path} HTTP/1.1\r\n");
    for (name, value) in signed.headers().iter() {
        req_buf.push_str(&format!(
            "{}: {}\r\n",
            name,
            value.to_str().unwrap_or("")
        ));
    }
    req_buf.push_str(&format!("content-length: {}\r\n\r\n", body_bytes.len()));
    tls.write_all(req_buf.as_bytes())
        .await
        .map_err(|e| KmsError::Http(e.to_string()))?;
    tls.write_all(&body_bytes)
        .await
        .map_err(|e| KmsError::Http(e.to_string()))?;
    tls.flush()
        .await
        .map_err(|e| KmsError::Http(e.to_string()))?;

    let mut resp = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = tls
            .read(&mut buf)
            .await
            .map_err(|e| KmsError::Http(e.to_string()))?;
        if n == 0 {
            break;
        }
        resp.extend_from_slice(&buf[..n]);
        if resp.windows(4).any(|w| w == b"\r\n\r\n") {
            // wait until we have content-length body or connection end
            if let Some(body_start) = find_body(&resp) {
                if let Some(cl) = content_length(&resp) {
                    if resp.len() >= body_start + cl {
                        break;
                    }
                } else if n < buf.len() {
                    break;
                }
            }
        }
    }

    let body_start = find_body(&resp).unwrap_or(resp.len());
    let header = std::str::from_utf8(&resp[..body_start]).unwrap_or("");
    let status_ok = header.starts_with("HTTP/1.1 200") || header.starts_with("HTTP/1.0 200");
    let json_body = std::str::from_utf8(&resp[body_start..]).unwrap_or("");

    if !status_ok {
        return Err(KmsError::Api(format!(
            "non-200 from KMS: {}",
            &header.lines().next().unwrap_or(header)
        )));
    }

    let parsed: serde_json::Value = serde_json::from_str(json_body)
        .map_err(|e| KmsError::Api(format!("json: {e}; body={json_body}")))?;
    let sig = parsed
        .get("Signature")
        .and_then(|v| v.as_str())
        .ok_or_else(|| KmsError::Api(format!("no Signature field: {json_body}")))?;

    let _digest = hex::encode(Sha256::digest(message));
    tracing::info!(key_id, "kms Sign ok");
    Ok(sig.to_string())
}

fn find_body(resp: &[u8]) -> Option<usize> {
    resp.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

fn content_length(resp: &[u8]) -> Option<usize> {
    let header = std::str::from_utf8(resp).ok()?;
    for line in header.lines() {
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("content-length:") {
            return rest.trim().parse().ok();
        }
    }
    None
}

fn base64_encode(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    for chunk in data.chunks(3) {
        let mut n = (chunk[0] as u32) << 16;
        if chunk.len() > 1 {
            n |= (chunk[1] as u32) << 8;
        }
        if chunk.len() > 2 {
            n |= chunk[2] as u32;
        }
        out.push(T[((n >> 18) & 63) as usize]);
        out.push(T[((n >> 12) & 63) as usize]);
        if chunk.len() > 1 {
            out.push(T[((n >> 6) & 63) as usize]);
        } else {
            out.push(b'=');
        }
        if chunk.len() > 2 {
            out.push(T[(n & 63) as usize]);
        } else {
            out.push(b'=');
        }
    }
    String::from_utf8(out).unwrap_or_default()
}
