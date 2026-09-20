/**
 * Step Functions OnReject — mark the transaction DENIED after human rejection.
 */
import type { Handler } from "aws-lambda";
import { updateItem } from "../lib/dynamo";
import { Keys, type Transaction } from "../lib/schema";
import type { ApprovalWorkflowInput } from "../lib/startApprovalWorkflow";

export const handler: Handler<
  ApprovalWorkflowInput,
  { ok: true; status: "DENIED" }
> = async (event) => {
  await updateItem<Transaction>({
    keys: Keys.transaction(
      event.agentId,
      event.timestamp,
      event.transactionId
    ),
    set: [
      "#status = :denied",
      "reason = :reason",
      "reasons = :reasons",
      "approvalTaskToken = :empty",
    ],
    expressionAttributeNames: { "#status": "status" },
    expressionAttributeValues: {
      ":denied": "DENIED",
      ":reason": "REJECTED_BY_HUMAN",
      ":reasons": ["rejected_by_human"],
      ":empty": "",
    },
  });

  return { ok: true, status: "DENIED" };
};
