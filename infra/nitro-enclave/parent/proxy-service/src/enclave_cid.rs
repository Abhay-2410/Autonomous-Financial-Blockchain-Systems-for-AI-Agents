//! Discover the running enclave CID via `nitro-cli describe-enclaves`.

use serde::Deserialize;
use std::process::Stdio;
use tokio::process::Command;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EnclaveInfo {
    #[serde(default, alias = "EnclaveCID", alias = "enclave_cid")]
    enclave_cid: Option<u32>,
    #[serde(default, alias = "EnclaveName")]
    enclave_name: Option<String>,
    #[serde(default, alias = "State")]
    state: Option<String>,
}

pub async fn discover_enclave_cid() -> Result<u32, String> {
    if let Ok(cid) = std::env::var("ENCLAVE_CID") {
        if let Ok(n) = cid.parse::<u32>() {
            return Ok(n);
        }
    }

    let output = Command::new("nitro-cli")
        .arg("describe-enclaves")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("nitro-cli describe-enclaves failed to spawn: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "nitro-cli describe-enclaves exit {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    parse_cid_from_describe(&raw)
}

fn parse_cid_from_describe(raw: &str) -> Result<u32, String> {
    // nitro-cli may emit a JSON array of enclave objects
    if let Ok(list) = serde_json::from_str::<Vec<serde_json::Value>>(raw) {
        for item in &list {
            if let Some(cid) = extract_cid(item) {
                let state = item
                    .get("State")
                    .or_else(|| item.get("state"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("RUNNING");
                if state.eq_ignore_ascii_case("RUNNING") || state.eq_ignore_ascii_case("running") {
                    return Ok(cid);
                }
            }
        }
        // fallback: first cid present
        for item in &list {
            if let Some(cid) = extract_cid(item) {
                return Ok(cid);
            }
        }
        return Err(format!("no enclaves in describe output: {raw}"));
    }

    // single object
    if let Ok(obj) = serde_json::from_str::<serde_json::Value>(raw) {
        if let Some(cid) = extract_cid(&obj) {
            return Ok(cid);
        }
    }

    // last-resort grep for "EnclaveCID": 16
    for part in raw.split([' ', ',', '{', '}', '\n', '\t', '"']) {
        // no-op
        let _ = part;
    }
    if let Some(cap) = raw
        .split("EnclaveCID")
        .nth(1)
        .and_then(|s| s.chars().skip_while(|c| !c.is_ascii_digit()).collect::<String>().parse::<u32>().ok())
    {
        return Ok(cap);
    }

    let _ = EnclaveInfo {
        enclave_cid: None,
        enclave_name: None,
        state: None,
    };

    Err(format!("could not parse EnclaveCID from: {raw}"))
}

fn extract_cid(v: &serde_json::Value) -> Option<u32> {
    v.get("EnclaveCID")
        .or_else(|| v.get("enclave_cid"))
        .or_else(|| v.get("EnclaveCid"))
        .and_then(|x| {
            x.as_u64()
                .map(|n| n as u32)
                .or_else(|| x.as_str().and_then(|s| s.parse().ok()))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_array() {
        let raw = r#"[{"EnclaveCID":16,"State":"RUNNING","EnclaveName":"limitx"}]"#;
        assert_eq!(parse_cid_from_describe(raw).unwrap(), 16);
    }
}
