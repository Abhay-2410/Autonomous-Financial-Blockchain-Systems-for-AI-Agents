import type { AgentWallet, Policy, TransactionStatus } from "../lib/schema";
import { emitTransactionDenied } from "../lib/events";
import {
  evaluateTransaction,
  type PolicyAgentInput,
} from "../policy/evaluate";

/** Final authorization decision written onto the Transaction record. */
export type AuthorizeDecision = Extract<
  TransactionStatus,
  "ALLOWED" | "DENIED" | "PENDING_APPROVAL"
>;

export interface AuthorizeTransactionInput {
  agent: AgentWallet;
  /** Presented by the caller (e.g. x-api-key header). */
  apiKey: string | undefined;
  /**
   * Owner-initiated payment from the LimitX Pay UI (x-owner-key).
   * Skips agent API-key check only; all spend policies still apply.
   */
  ownerAuthenticated?: boolean;
  transaction: {
    agentId: string;
    amount: number;
    recipient: string;
    type: string;
    purpose: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  };
  /** Latest Cedar/policy row for the agent; omit / null = no expiry constraint. */
  policy?: Policy | null;
  /**
   * Re-load agent for mid-session revoke check (step 10).
   * Defaults to the in-memory agent snapshot.
   */
  reloadAgent?: () => Promise<AgentWallet | null>;
  /** Clock override for tests (ISO-8601). */
  now?: string;
}

export interface AuthorizeTransactionResult {
  decision: AuthorizeDecision;
  reasons: string[];
  /** First failing check id (1–10), if any. */
  failedCheck?: number;
}

export const AuthReason = {
  authFailed: "auth_failed",
  agentInactive: "agent_inactive",
  walletExpired: "wallet_expired",
  overPerTransactionLimit: "over_per_transaction_limit",
  overDailyLimit: "over_daily_limit",
  disallowedMerchant: "disallowed_merchant",
  typeNotPermitted: "type_not_permitted",
  insufficientBalance: "insufficient_allocated_balance",
  policyExpired: "policy_expired",
  agentRevokedMidSession: "agent_revoked_mid_session",
  cedarAllow: "cedar_allow",
  cedarDeny: "cedar_deny",
} as const;

const DEFAULT_PERMITTED_TYPES = ["purchase", "payment", "transfer", "refund"];

function expectedApiKey(agent: AgentWallet): string | undefined {
  return agent.apiKey ?? process.env[`AGENT_API_KEY_${agent.agentId}`];
}

function permittedTypes(agent: AgentWallet): string[] {
  return agent.permittedTransactionTypes?.length
    ? agent.permittedTransactionTypes
    : DEFAULT_PERMITTED_TYPES;
}

function allocatedBalance(agent: AgentWallet): number {
  return agent.allocatedBalance ?? agent.dailyLimit;
}

async function withDeniedEvent(
  agent: AgentWallet,
  transaction: AuthorizeTransactionInput["transaction"],
  result: AuthorizeTransactionResult
): Promise<AuthorizeTransactionResult> {
  if (result.decision === "DENIED") {
    await emitTransactionDenied(
      agent,
      transaction.amount,
      transaction.recipient,
      result.reasons
    );
  }
  return result;
}

/**
 * Architecture-doc authorization sequence (checks 1–10).
 *
 * Soft ceilings (4 = per-txn, 5 = daily) do not short-circuit the remaining
 * hard checks. Any hard failure → DENIED. Only soft failures → PENDING_APPROVAL.
 * All pass → Cedar evaluateTransaction → ALLOWED / DENIED.
 */
export async function authorizeTransaction(
  input: AuthorizeTransactionInput
): Promise<AuthorizeTransactionResult> {
  const { agent, transaction, apiKey, policy, ownerAuthenticated } = input;
  const nowIso = input.now ?? new Date().toISOString();
  const reasons: string[] = [];
  let softFailedCheck: number | undefined;
  let softReason: string | undefined;

  const failHard = async (
    check: number,
    reason: string
  ): Promise<AuthorizeTransactionResult> =>
    withDeniedEvent(agent, transaction, {
      decision: "DENIED",
      reasons: [reason],
      failedCheck: check,
    });

  // 1. Authenticated? (agent API key — or owner key from Pay UI)
  if (!ownerAuthenticated) {
    const key = expectedApiKey(agent);
    if (
      !transaction.agentId ||
      transaction.agentId !== agent.agentId ||
      !apiKey ||
      !key ||
      apiKey !== key
    ) {
      return failHard(1, AuthReason.authFailed);
    }
  } else if (!transaction.agentId || transaction.agentId !== agent.agentId) {
    return failHard(1, AuthReason.authFailed);
  }

  // 2. Agent currently ACTIVE?
  if (agent.status !== "ACTIVE") {
    return failHard(2, AuthReason.agentInactive);
  }

  // 3. Wallet still valid (not expired)?
  if (agent.walletExpiresAt && nowIso >= agent.walletExpiresAt) {
    return failHard(3, AuthReason.walletExpired);
  }

  // 4. Per-transaction limit (soft ceiling)
  if (transaction.amount > agent.perTransactionLimit) {
    softFailedCheck = 4;
    softReason = AuthReason.overPerTransactionLimit;
    reasons.push(softReason);
  }

  // 5. Daily spending limit (soft ceiling): amount + spentToday <= dailyLimit
  if (transaction.amount + agent.spentToday > agent.dailyLimit) {
    if (!softFailedCheck) {
      softFailedCheck = 5;
      softReason = AuthReason.overDailyLimit;
    }
    if (!reasons.includes(AuthReason.overDailyLimit)) {
      reasons.push(AuthReason.overDailyLimit);
    }
  }

  // 6. Recipient / merchant on allow-list (hard)
  if (!agent.allowedMerchants.includes(transaction.recipient)) {
    return failHard(6, AuthReason.disallowedMerchant);
  }

  // 7. Transaction type permitted (hard)
  if (!permittedTypes(agent).includes(transaction.type)) {
    return failHard(7, AuthReason.typeNotPermitted);
  }

  // 8. Sufficient remaining allocated balance (hard)
  const remainingAllocated = allocatedBalance(agent) - agent.spentToday;
  if (transaction.amount > remainingAllocated) {
    return failHard(8, AuthReason.insufficientBalance);
  }

  // 9. Policy expired? (hard when a policy row is present)
  if (policy?.effectiveTo && nowIso >= policy.effectiveTo) {
    return failHard(9, AuthReason.policyExpired);
  }

  // 10. Mid-session revoke re-check (hard)
  const latest =
    (input.reloadAgent ? await input.reloadAgent() : agent) ?? agent;
  if (latest.status !== "ACTIVE") {
    return failHard(10, AuthReason.agentRevokedMidSession);
  }

  // Soft ceiling only → human escalation path
  if (softFailedCheck !== undefined && softReason) {
    return {
      decision: "PENDING_APPROVAL",
      reasons: reasons.length ? reasons : [softReason],
      failedCheck: softFailedCheck,
    };
  }

  // All hard + soft checks passed → Cedar policy layer
  const policyAgent: PolicyAgentInput = {
    agentId: agent.agentId,
    status: latest.status,
    dailyLimit: agent.dailyLimit,
    perTransactionLimit: agent.perTransactionLimit,
    allowedMerchants: agent.allowedMerchants,
  };
  const remainingDailyBudget = Math.max(0, agent.dailyLimit - agent.spentToday);
  const cedar = evaluateTransaction(policyAgent, transaction, remainingDailyBudget);

  if (cedar.decision === "Allow") {
    return {
      decision: "ALLOWED",
      reasons: [AuthReason.cedarAllow, ...cedar.reasons],
    };
  }

  return withDeniedEvent(agent, transaction, {
    decision: "DENIED",
    reasons: [AuthReason.cedarDeny, ...cedar.reasons],
  });
}
