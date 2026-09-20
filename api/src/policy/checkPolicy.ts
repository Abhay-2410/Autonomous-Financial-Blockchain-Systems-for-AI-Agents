/**
 * Policy & Authorization Engine — thin re-export.
 * Prefer `authorizeTransaction` from handlers/authorizeTransaction.ts.
 */
export {
  authorizeTransaction,
  type AuthorizeDecision,
  type AuthorizeTransactionResult,
} from "../handlers/authorizeTransaction";

/** @deprecated Use authorizeTransaction — kept for earlier stub call sites. */
export type CheckPolicyDecision = "Allow" | "Deny" | "Escalate";

export interface CheckPolicyTransaction {
  agentId: string;
  amount: number;
  recipient: string;
  type: string;
  purpose: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
