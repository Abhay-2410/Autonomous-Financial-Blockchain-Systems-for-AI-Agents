/**
 * Step Functions waitForTaskToken callback — persists the task token on the
 * Transaction so approve/reject APIs can SendTaskSuccess / SendTaskFailure.
 */
import type { Handler } from "aws-lambda";
import { updateItem } from "../lib/dynamo";
import { Keys, type Transaction } from "../lib/schema";

export interface StoreApprovalTaskTokenEvent {
  token: string;
  agentId: string;
  transactionId: string;
  timestamp: string;
  executionArn?: string;
}

export const handler: Handler<StoreApprovalTaskTokenEvent, { ok: true }> = async (
  event
) => {
  if (!event.token || !event.agentId || !event.transactionId || !event.timestamp) {
    throw new Error("token, agentId, transactionId, and timestamp are required");
  }

  await updateItem<Transaction>({
    keys: Keys.transaction(
      event.agentId,
      event.timestamp,
      event.transactionId
    ),
    set: [
      "approvalTaskToken = :token",
      "approvalExecutionArn = :exec",
      "reason = :reason",
    ],
    expressionAttributeValues: {
      ":token": event.token,
      ":exec": event.executionArn ?? "unknown",
      ":reason": "PENDING_APPROVAL:waiting_for_human",
      ":pending": "PENDING_APPROVAL",
    },
    expressionAttributeNames: { "#status": "status" },
    conditionExpression: "#status = :pending",
  });

  console.log(
    JSON.stringify({
      level: "info",
      msg: "stored Step Functions task token for approval",
      transactionId: event.transactionId,
      agentId: event.agentId,
    })
  );

  return { ok: true };
};
