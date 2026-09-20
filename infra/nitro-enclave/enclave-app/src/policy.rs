//! Independent enforcement layer (Prompt 5 authorizeTransaction hard checks).
//! The enclave does NOT trust that the parent already authorized — it re-validates
//! from the policy snapshot in the request.

use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicySnapshot {
    pub agent_id: String,
    pub status: String,
    pub daily_limit: f64,
    pub per_transaction_limit: f64,
    pub spent_today: f64,
    pub allowed_merchants: Vec<String>,
    #[serde(default)]
    pub allocated_balance: Option<f64>,
    #[serde(default)]
    pub wallet_expires_at: Option<String>,
    #[serde(default)]
    pub permitted_transaction_types: Option<Vec<String>>,
    #[serde(default)]
    pub policy_effective_to: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalTransaction {
    pub agent_id: String,
    pub amount: f64,
    pub recipient: String,
    #[serde(rename = "type")]
    pub txn_type: String,
    pub purpose: String,
    pub timestamp: String,
    #[serde(rename = "txnId")]
    pub txn_id: String,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyResult {
    pub decision: String,
    pub reasons: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_check: Option<u8>,
}

pub mod reason {
    pub const AGENT_INACTIVE: &str = "agent_inactive";
    pub const WALLET_EXPIRED: &str = "wallet_expired";
    pub const OVER_PER_TRANSACTION_LIMIT: &str = "over_per_transaction_limit";
    pub const OVER_DAILY_LIMIT: &str = "over_daily_limit";
    pub const DISALLOWED_MERCHANT: &str = "disallowed_merchant";
    pub const TYPE_NOT_PERMITTED: &str = "type_not_permitted";
    pub const INSUFFICIENT_BALANCE: &str = "insufficient_allocated_balance";
    pub const POLICY_EXPIRED: &str = "policy_expired";
    pub const AGENT_ID_MISMATCH: &str = "agent_id_mismatch";
    pub const ENCLAVE_ALLOW: &str = "enclave_policy_allow";
}

const DEFAULT_TYPES: &[&str] = &["purchase", "payment", "transfer", "refund"];

/// Re-implements Prompt 5 hard checks as DENY (defense in depth).
/// Soft ceilings from the Lambda path (per-txn / daily) are HARD denies here —
/// the enclave will not sign over-limit spend even if the parent asked it to.
pub fn enforce(snapshot: &PolicySnapshot, txn: &CanonicalTransaction) -> PolicyResult {
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    if txn.agent_id != snapshot.agent_id {
        return deny(1, reason::AGENT_ID_MISMATCH);
    }

    // 2. Agent ACTIVE?
    if snapshot.status != "ACTIVE" {
        return deny(2, reason::AGENT_INACTIVE);
    }

    // 3. Wallet not expired?
    if let Some(ref exp) = snapshot.wallet_expires_at {
        if !exp.is_empty() && now.as_str() >= exp.as_str() {
            return deny(3, reason::WALLET_EXPIRED);
        }
    }

    // 4. Per-transaction limit (HARD in enclave)
    if txn.amount > snapshot.per_transaction_limit {
        return deny(4, reason::OVER_PER_TRANSACTION_LIMIT);
    }

    // 5. Daily limit (HARD in enclave)
    if txn.amount + snapshot.spent_today > snapshot.daily_limit {
        return deny(5, reason::OVER_DAILY_LIMIT);
    }

    // 6. Merchant allow-list
    if !snapshot
        .allowed_merchants
        .iter()
        .any(|m| m == &txn.recipient)
    {
        return deny(6, reason::DISALLOWED_MERCHANT);
    }

    // 7. Transaction type
    let permitted: Vec<String> = snapshot
        .permitted_transaction_types
        .clone()
        .unwrap_or_else(|| DEFAULT_TYPES.iter().map(|s| (*s).to_string()).collect());
    if !permitted.iter().any(|t| t == &txn.txn_type) {
        return deny(7, reason::TYPE_NOT_PERMITTED);
    }

    // 8. Allocated balance
    let allocated = snapshot
        .allocated_balance
        .unwrap_or(snapshot.daily_limit);
    let remaining = allocated - snapshot.spent_today;
    if txn.amount > remaining {
        return deny(8, reason::INSUFFICIENT_BALANCE);
    }

    // 9. Policy expiry (optional)
    if let Some(ref to) = snapshot.policy_effective_to {
        if !to.is_empty() && now.as_str() >= to.as_str() {
            return deny(9, reason::POLICY_EXPIRED);
        }
    }

    PolicyResult {
        decision: "ALLOWED".into(),
        reasons: vec![reason::ENCLAVE_ALLOW.into()],
        failed_check: None,
    }
}

fn deny(check: u8, reason: &str) -> PolicyResult {
    PolicyResult {
        decision: "DENIED".into(),
        reasons: vec![reason.into()],
        failed_check: Some(check),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap() -> PolicySnapshot {
        PolicySnapshot {
            agent_id: "shopping-bot".into(),
            status: "ACTIVE".into(),
            daily_limit: 5000.0,
            per_transaction_limit: 2000.0,
            spent_today: 0.0,
            allowed_merchants: vec!["Amazon".into()],
            allocated_balance: Some(100_000.0),
            wallet_expires_at: Some("2099-12-31T23:59:59.000Z".into()),
            permitted_transaction_types: None,
            policy_effective_to: None,
        }
    }

    fn txn(amount: f64, merchant: &str) -> CanonicalTransaction {
        CanonicalTransaction {
            agent_id: "shopping-bot".into(),
            amount,
            recipient: merchant.into(),
            txn_type: "purchase".into(),
            purpose: "test".into(),
            timestamp: "2026-01-01T00:00:00.000Z".into(),
            txn_id: "t1".into(),
            status: Some("ALLOWED".into()),
        }
    }

    #[test]
    fn allows_within_limits() {
        let r = enforce(&snap(), &txn(15.0, "Amazon"));
        assert_eq!(r.decision, "ALLOWED");
    }

    #[test]
    fn denies_bad_merchant() {
        let r = enforce(&snap(), &txn(15.0, "EvilMart"));
        assert_eq!(r.decision, "DENIED");
        assert_eq!(r.reasons[0], reason::DISALLOWED_MERCHANT);
    }

    #[test]
    fn denies_over_per_txn() {
        let r = enforce(&snap(), &txn(2500.0, "Amazon"));
        assert_eq!(r.decision, "DENIED");
        assert_eq!(r.reasons[0], reason::OVER_PER_TRANSACTION_LIMIT);
    }
}
