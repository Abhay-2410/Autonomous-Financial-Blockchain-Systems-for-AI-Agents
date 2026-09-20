import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { listPendingApprovalTransactions } from "../lib/dynamo";
import { json } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const pending = await listPendingApprovalTransactions();

  const items = pending.map((t) => ({
    transactionId: t.txnId,
    agentId: t.agentId,
    amount: t.amount,
    recipient: t.recipient,
    type: t.type,
    purpose: t.purpose,
    timestamp: t.timestamp,
    status: t.status,
    reasons: t.reasons ?? [],
    hasTaskToken: Boolean(t.approvalTaskToken),
  }));

  return json(200, { pending: items, count: items.length });
};
