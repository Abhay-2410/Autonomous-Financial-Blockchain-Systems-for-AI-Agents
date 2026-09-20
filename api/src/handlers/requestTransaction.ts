import { randomUUID } from "node:crypto";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  applyAllowedTransaction,
  DailyLimitRaceError,
} from "../lib/applyAllowedTransaction";
import {
  getAgentById,
  putItem,
  resetSpentTodayIfNeeded,
  updateItem,
} from "../lib/dynamo";
import { json } from "../lib/http";
import {
  buildAuditEvent,
  buildTransaction,
  Keys,
  type Transaction,
} from "../lib/schema";
import { startApprovalWorkflow } from "../lib/startApprovalWorkflow";
import { authorizeTransaction } from "./authorizeTransaction";

interface TransactionRequestBody {
  agentId: string;
  amount: number;
  recipient: string;
  type: string;
  purpose: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

function parseBody(raw: string | undefined): TransactionRequestBody | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TransactionRequestBody>;
    if (
      typeof parsed.agentId !== "string" ||
      typeof parsed.amount !== "number" ||
      typeof parsed.recipient !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.purpose !== "string" ||
      typeof parsed.timestamp !== "string"
    ) {
      return null;
    }
    return {
      agentId: parsed.agentId,
      amount: parsed.amount,
      recipient: parsed.recipient,
      type: parsed.type,
      purpose: parsed.purpose,
      timestamp: parsed.timestamp,
      metadata: parsed.metadata,
    };
  } catch {
    return null;
  }
}

function extractApiKey(event: {
  headers?: Record<string, string | undefined>;
}): string | undefined {
  const headers = event.headers ?? {};
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return lower["x-api-key"] ?? lower["authorization"]?.replace(/^Bearer\s+/i, "");
}

function extractOwnerKey(event: {
  headers?: Record<string, string | undefined>;
}): string | undefined {
  const headers = event.headers ?? {};
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return lower["x-owner-key"];
}

function isOwnerAuthenticated(event: {
  headers?: Record<string, string | undefined>;
}): boolean {
  const expected = process.env.OWNER_API_KEY;
  if (!expected) return false;
  const presented = extractOwnerKey(event);
  return Boolean(presented && presented === expected);
}

async function maybeStartApproval(
  agent: import("../lib/schema").AgentWallet,
  txn: Transaction,
  decision: string
): Promise<string | null> {
  if (decision !== "PENDING_APPROVAL") return null;
  return startApprovalWorkflow(agent, txn);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = parseBody(event.body);
  if (!body) {
    return json(400, {
      message:
        "Invalid body. Required: agentId, amount, recipient, type, purpose, timestamp",
    });
  }

  let agent = await getAgentById(body.agentId);
  if (!agent) {
    return json(404, { message: `Agent not found: ${body.agentId}` });
  }

  agent = await resetSpentTodayIfNeeded(agent);
  const apiKey = extractApiKey(event);
  const ownerAuthenticated = isOwnerAuthenticated(event);

  let auth = await authorizeTransaction({
    agent,
    apiKey,
    ownerAuthenticated,
    transaction: body,
    reloadAgent: () => getAgentById(body.agentId),
  });

  const transactionId = randomUUID();
  let txn = buildTransaction({
    agentId: body.agentId,
    txnId: transactionId,
    amount: body.amount,
    recipient: body.recipient,
    type: body.type,
    purpose: body.purpose,
    timestamp: body.timestamp,
    status: auth.decision,
    reason: auth.reasons.join(","),
    reasons: auth.reasons,
    metadata: body.metadata,
  });

  await putItem(txn);

  if (auth.decision === "DENIED" || auth.decision === "PENDING_APPROVAL") {
    await putItem(
      buildAuditEvent({
        agentId: body.agentId,
        timestamp: body.timestamp,
        eventType:
          auth.decision === "DENIED"
            ? "TRANSACTION_DENIED"
            : "TRANSACTION_PENDING_APPROVAL",
        details: {
          type:
            auth.decision === "DENIED"
              ? "TRANSACTION_DENIED"
              : "TRANSACTION_PENDING_APPROVAL",
          txnId: transactionId,
          amount: body.amount,
          recipient: body.recipient,
          reasons: auth.reasons,
          failedCheck: auth.failedCheck,
        },
      })
    );
  }

  if (auth.decision === "ALLOWED") {
    try {
      const applied = await applyAllowedTransaction({
        agent,
        transaction: txn,
        amount: body.amount,
        recipient: body.recipient,
        timestamp: body.timestamp,
      });
      txn = applied.transaction;
    } catch (err) {
      if (err instanceof DailyLimitRaceError) {
        const fresh = (await getAgentById(body.agentId)) ?? agent;
        auth = await authorizeTransaction({
          agent: fresh,
          apiKey,
          ownerAuthenticated,
          transaction: body,
          reloadAgent: () => getAgentById(body.agentId),
        });

        const updated = await updateItem<Transaction>({
          keys: Keys.transaction(body.agentId, body.timestamp, transactionId),
          set: ["#status = :status", "reason = :reason", "reasons = :reasons"],
          expressionAttributeNames: { "#status": "status" },
          expressionAttributeValues: {
            ":status": auth.decision,
            ":reason": auth.reasons.join(","),
            ":reasons": auth.reasons,
          },
        });
        txn = updated ?? { ...txn, status: auth.decision, reasons: auth.reasons };
        agent = fresh;
      } else {
        throw err;
      }
    }
  }

  const executionArn = await maybeStartApproval(agent, txn, auth.decision);

  return json(200, {
    transactionId,
    decision: auth.decision,
    reasons: auth.reasons,
    failedCheck: auth.failedCheck,
    approvalExecutionArn: executionArn,
  });
};
