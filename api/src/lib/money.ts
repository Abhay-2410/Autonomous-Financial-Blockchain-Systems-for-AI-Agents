/**
 * LimitX internal money unit — ONE unit for policy, DynamoDB, and dashboard.
 *
 * All of these are plain USD-equivalent numbers (not cents, not stroops,
 * not milli-units, not XLM):
 *   - Transaction.amount
 *   - AgentWallet.dailyLimit / perTransactionLimit / spentToday / allocatedBalance
 *   - Cedar policy comparisons against those fields
 *   - AuditEvent details.amount
 *
 * Convert to on-chain XLM only at Stellar settlement (submitStellarPayment →
 * submitXlmPayment) using DEMO_USD_EQUIV_TO_XLM. Never multiply elsewhere.
 */

/** Human label for the internal unit (dashboard / copy). */
export const MONEY_UNIT_LABEL = "USD";

/** Currency symbol used across Pay, Approvals, Activity, agent cards. */
export const MONEY_UNIT_SYMBOL = "$";

/**
 * Demo Testnet exchange rate.
 * 1 policy unit (USD-equivalent) = 1 XLM on Stellar Testnet.
 * Labeled and intentional — not a live FX feed.
 */
export const DEMO_USD_EQUIV_TO_XLM = 1;

/** Convert a policy/Dynamo amount to native XLM for Horizon payment. */
export function policyUnitsToXlm(amountUsdEquivalent: number): number {
  return amountUsdEquivalent * DEMO_USD_EQUIV_TO_XLM;
}

/**
 * Horizon expects a decimal string of native XLM (up to 7 fractional digits).
 * Input must already be the USD-equivalent policy amount (no prior scaling).
 */
export function formatXlmForStellar(amountUsdEquivalent: number): string {
  const xlm = policyUnitsToXlm(amountUsdEquivalent);
  if (!(xlm > 0) || !Number.isFinite(xlm)) {
    throw new Error("Stellar payment amount must be a positive finite number");
  }
  return xlm.toFixed(7);
}
