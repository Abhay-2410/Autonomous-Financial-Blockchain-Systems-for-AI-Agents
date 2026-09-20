/**
 * Step Functions OnApprove — apply spend, KMS sign, then chain stub or Prava.
 */
import type { Handler } from "aws-lambda";
import { applyAllowedTransaction } from "../lib/applyAllowedTransaction";
import { getAgentById, getItem, updateItem } from "../lib/dynamo";
import { Keys, type AgentWallet, type Transaction } from "../lib/schema";
import { startPravaCheckoutForTransaction } from "../lib/startPravaCheckout";
import type { ApprovalWorkflowInput } from "../lib/startApprovalWorkflow";

export const handler: Handler<
  ApprovalWorkflowInput,
  { ok: true; status: string; pravaSessionId?: string }
> = async (event) => {
  const agent = await getAgentById(event.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${event.agentId}`);
  }

  const txnKeys = Keys.transaction(
    event.agentId,
    event.timestamp,
    event.transactionId
  );
  const txn = await getItem<Transaction>(txnKeys);
  if (!txn || txn.status !== "PENDING_APPROVAL") {
    throw new Error(
      `Transaction ${event.transactionId} is not PENDING_APPROVAL`
    );
  }

  const rail =
    txn.settlementRail === "prava" ||
    (txn.metadata as { settlementRail?: string } | undefined)?.settlementRail ===
      "prava"
      ? "prava"
      : "chain";

  const allowed =
    (await updateItem<Transaction>({
      keys: txnKeys,
      set: ["#status = :allowed", "reason = :reason"],
      expressionAttributeNames: { "#status": "status" },
      expressionAttributeValues: {
        ":allowed": "ALLOWED",
        ":reason": "APPROVED_BY_HUMAN",
        ":pending": "PENDING_APPROVAL",
      },
      conditionExpression: "#status = :pending",
    })) ?? ({ ...txn, status: "ALLOWED", reason: "APPROVED_BY_HUMAN" } as Transaction);

  const applied = await applyAllowedTransaction({
    agent: agent as AgentWallet,
    transaction: allowed,
    amount: event.amount,
    recipient: event.recipient,
    timestamp: event.timestamp,
    settlementRail: rail,
  });

  let pravaSessionId: string | undefined;
  if (rail === "prava") {
    const checkout = await startPravaCheckoutForTransaction(applied.transaction);
    pravaSessionId = checkout.sessionId;
  }

  return {
    ok: true,
    status: applied.transaction.status,
    pravaSessionId,
  };
};
