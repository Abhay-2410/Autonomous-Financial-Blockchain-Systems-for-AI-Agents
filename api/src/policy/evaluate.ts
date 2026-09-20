/**
 * Transaction authorization via Cedar (@cedar-policy/cedar-wasm), with a
 * hand-written fallback that uses the same check order and reason codes.
 *
 * Fallback exists because cedar-wasm ships a .wasm binary that can fail to
 * load or instantiate under AWS Lambda's Node.js runtime (missing wasm file
 * in the SAM package, or WebAssembly instantiate errors). When that happens
 * we still authorize with identical rules below.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentStatus } from "../lib/schema";
import schemaJson from "./schema.cedarschema.json";

export interface PolicyAgentInput {
  agentId: string;
  status: AgentStatus;
  dailyLimit: number;
  perTransactionLimit: number;
  allowedMerchants: string[];
}

export interface PolicyTransactionInput {
  amount: number;
  /** Merchant / payee — matched against allowedMerchants */
  recipient: string;
  txnId?: string;
}

export type PolicyDecision = "Allow" | "Deny";

export interface EvaluateResult {
  decision: PolicyDecision;
  reasons: string[];
}

export const ReasonCode = {
  withinLimits: "within_limits",
  agentRevoked: "agent_revoked",
  overPerTransactionLimit: "over_per_transaction_limit",
  overDailyLimit: "over_daily_limit",
  disallowedMerchant: "disallowed_merchant",
} as const;

type CedarNode = typeof import("@cedar-policy/cedar-wasm/nodejs");

let cedarModule: CedarNode | null | undefined;

function tryLoadCedar(): CedarNode | null {
  if (cedarModule !== undefined) {
    return cedarModule;
  }
  try {
    // Prefer the Node/CommonJS build so SAM/Lambda and Jest can require() it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cedarModule = require("@cedar-policy/cedar-wasm/nodejs") as CedarNode;
    return cedarModule;
  } catch (err) {
    console.warn(
      "[policy] @cedar-policy/cedar-wasm failed to load; using hand-written evaluator.",
      err
    );
    cedarModule = null;
    return null;
  }
}

function policyPathFor(agentId: string): string {
  return join(__dirname, "policies", `${agentId}.cedar`);
}

/**
 * Hand-written rule evaluator — check order MUST stay in sync with the
 * `.cedar` permit `when` clauses and with evaluateWithCedar outcomes:
 *   1. agent status ACTIVE
 *   2. per-transaction limit
 *   3. remaining daily budget
 *   4. allowed merchants
 */
export function evaluateWithRules(
  agent: PolicyAgentInput,
  transaction: PolicyTransactionInput,
  remainingDailyBudget: number
): EvaluateResult {
  if (agent.status !== "ACTIVE") {
    return { decision: "Deny", reasons: [ReasonCode.agentRevoked] };
  }
  if (transaction.amount > agent.perTransactionLimit) {
    return {
      decision: "Deny",
      reasons: [ReasonCode.overPerTransactionLimit],
    };
  }
  // Mirrors Cedar: amount <= remainingDailyBudget && remainingDailyBudget <= dailyLimit
  if (
    transaction.amount > remainingDailyBudget ||
    remainingDailyBudget > agent.dailyLimit
  ) {
    return { decision: "Deny", reasons: [ReasonCode.overDailyLimit] };
  }
  if (!agent.allowedMerchants.includes(transaction.recipient)) {
    return { decision: "Deny", reasons: [ReasonCode.disallowedMerchant] };
  }
  return { decision: "Allow", reasons: [ReasonCode.withinLimits] };
}

function evaluateWithCedar(
  cedar: CedarNode,
  agent: PolicyAgentInput,
  transaction: PolicyTransactionInput,
  remainingDailyBudget: number
): EvaluateResult {
  const path = policyPathFor(agent.agentId);
  if (!existsSync(path)) {
    return evaluateWithRules(agent, transaction, remainingDailyBudget);
  }

  const policyText = readFileSync(path, "utf8");
  const txnId = transaction.txnId ?? "txn";

  const answer = cedar.isAuthorized({
    principal: { type: "Agent", id: agent.agentId },
    action: { type: "Action", id: "authorizeTransaction" },
    resource: { type: "Transaction", id: txnId },
    context: { remainingDailyBudget },
    schema: schemaJson,
    validateRequest: true,
    policies: { staticPolicies: policyText },
    entities: [
      {
        uid: { type: "Agent", id: agent.agentId },
        attrs: {
          status: agent.status,
          dailyLimit: agent.dailyLimit,
          perTransactionLimit: agent.perTransactionLimit,
          allowedMerchants: agent.allowedMerchants,
        },
        parents: [],
      },
      {
        uid: { type: "Transaction", id: txnId },
        attrs: {
          amount: transaction.amount,
          merchant: transaction.recipient,
        },
        parents: [],
      },
    ],
  });

  if (answer.type === "failure") {
    throw new Error(
      answer.errors.map((e) => e.message).join("; ") || "Cedar authorization failed"
    );
  }

  const decision: PolicyDecision =
    answer.response.decision === "allow" ? "Allow" : "Deny";

  // Reasons follow the same ordered checks as the hand-written evaluator so
  // callers (and tests) get stable reason codes regardless of engine.
  const ruled = evaluateWithRules(agent, transaction, remainingDailyBudget);
  if (decision !== ruled.decision) {
    // Prefer Cedar's decision; still surface rule reasons for diagnostics.
    return {
      decision,
      reasons:
        decision === "Allow"
          ? [ReasonCode.withinLimits]
          : ruled.reasons.length
            ? ruled.reasons
            : answer.response.diagnostics.reason,
    };
  }
  return ruled;
}

/**
 * Evaluate whether an agent may authorize a transaction.
 * Tries Cedar WASM first; falls back to evaluateWithRules on load/runtime failure.
 */
export function evaluateTransaction(
  agent: PolicyAgentInput,
  transaction: PolicyTransactionInput,
  remainingDailyBudget: number
): EvaluateResult {
  const cedar = tryLoadCedar();
  if (!cedar) {
    return evaluateWithRules(agent, transaction, remainingDailyBudget);
  }

  try {
    return evaluateWithCedar(
      cedar,
      agent,
      transaction,
      remainingDailyBudget
    );
  } catch (err) {
    // Runtime WASM / schema / policy failures under Lambda → same rules path.
    console.warn(
      "[policy] Cedar evaluation failed at runtime; using hand-written evaluator.",
      err
    );
    return evaluateWithRules(agent, transaction, remainingDailyBudget);
  }
}
