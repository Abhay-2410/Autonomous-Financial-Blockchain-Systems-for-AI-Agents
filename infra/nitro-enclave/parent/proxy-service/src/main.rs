mod enclave_cid;
mod framing;

use std::env;
use std::net::SocketAddr;
use std::time::Duration;

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::time::timeout;
use tokio_vsock::{VsockAddr, VsockStream};
use tower_http::trace::TraceLayer;
use tracing::{error, info, warn};

#[derive(Clone)]
struct AppState {
    enclave_port: u32,
    vsock_timeout: Duration,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    service: String,
    enclave_cid: Option<u32>,
    enclave_port: u32,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG").unwrap_or_else(|_| "limitx_parent_proxy=info".into()),
        )
        .json()
        .init();

    let bind = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8443".into());
    let enclave_port: u32 = env::var("ENCLAVE_VSOCK_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5000);
    let vsock_timeout = Duration::from_secs(
        env::var("VSOCK_TIMEOUT_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(30),
    );

    let state = AppState {
        enclave_port,
        vsock_timeout,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/sign", post(sign))
        .route("/sign", post(sign))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = bind.parse().expect("BIND_ADDR");
    info!(%addr, enclave_port, "LimitX parent proxy listening (VPC-internal)");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let cid = enclave_cid::discover_enclave_cid().await.ok();
    Json(HealthResponse {
        ok: true,
        service: "limitx-parent-proxy".into(),
        enclave_cid: cid,
        enclave_port: state.enclave_port,
    })
}

async fn sign(
    State(state): State<AppState>,
    Json(req): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let cid = enclave_cid::discover_enclave_cid().await.map_err(|e| {
        error!(error = %e, "enclave CID discovery failed");
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "decision": "DENIED",
                "reasons": ["enclave_unavailable"],
                "error": e,
            })),
        )
    })?;

    info!(cid, port = state.enclave_port, "forwarding sign request to enclave vsock");

    let payload = serde_json::to_vec(&req).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    let fut = async {
        let addr = VsockAddr::new(cid, state.enclave_port);
        let mut stream = VsockStream::connect(addr)
            .await
            .map_err(|e| format!("vsock connect cid={cid} port={}: {e}", state.enclave_port))?;
        framing::write_message(&mut stream, &payload)
            .await
            .map_err(|e| format!("vsock write: {e}"))?;
        let resp_raw = framing::read_message(&mut stream)
            .await
            .map_err(|e| format!("vsock read: {e}"))?;
        let resp: Value = serde_json::from_slice(&resp_raw)
            .map_err(|e| format!("enclave JSON: {e}"))?;
        Ok::<Value, String>(resp)
    };

    match timeout(state.vsock_timeout, fut).await {
        Ok(Ok(resp)) => Ok(Json(resp)),
        Ok(Err(e)) => {
            error!(error = %e, "vsock round-trip failed");
            Err((
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({
                    "decision": "DENIED",
                    "reasons": ["enclave_vsock_error"],
                    "error": e,
                })),
            ))
        }
        Err(_) => {
            warn!("vsock timeout");
            Err((
                StatusCode::GATEWAY_TIMEOUT,
                Json(serde_json::json!({
                    "decision": "DENIED",
                    "reasons": ["enclave_timeout"],
                    "error": "vsock timeout waiting for enclave",
                })),
            ))
        }
    }
}
