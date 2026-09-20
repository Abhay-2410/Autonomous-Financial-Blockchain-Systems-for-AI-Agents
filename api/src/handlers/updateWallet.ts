import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getAgentById, updateItem } from "../lib/dynamo";
import { json } from "../lib/http";
import { Keys, type AgentStatus, type AgentWallet } from "../lib/schema";

interface PatchBody {
  status?: AgentStatus;
  dailyLimit?: number;
  perTransactionLimit?: number;
  allowedMerchants?: string[];
}

function parseBody(raw: string | undefined): PatchBody | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: PatchBody = {};

    if (parsed.status === "ACTIVE" || parsed.status === "REVOKED") {
      out.status = parsed.status;
    }
    if (typeof parsed.dailyLimit === "number" && parsed.dailyLimit >= 0) {
      out.dailyLimit = parsed.dailyLimit;
    }
    if (
      typeof parsed.perTransactionLimit === "number" &&
      parsed.perTransactionLimit >= 0
    ) {
      out.perTransactionLimit = parsed.perTransactionLimit;
    }
    if (Array.isArray(parsed.allowedMerchants)) {
      out.allowedMerchants = parsed.allowedMerchants.filter(
        (m): m is string => typeof m === "string" && m.length > 0
      );
    }

    return out;
  } catch {
    return null;
  }
}

/**
 * PATCH /wallets/{agentId}
 * Body: { status?, dailyLimit?, perTransactionLimit?, allowedMerchants? }
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const agentId = event.pathParameters?.agentId;
  if (!agentId) {
    return json(400, { message: "agentId path parameter required" });
  }

  const patch = parseBody(event.body);
  if (!patch || Object.keys(patch).length === 0) {
    return json(400, {
      message:
        "Invalid body. Provide status, dailyLimit, perTransactionLimit, and/or allowedMerchants",
    });
  }

  const agent = await getAgentById(agentId);
  if (!agent) {
    return json(404, { message: `Agent not found: ${agentId}` });
  }

  const set: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  if (patch.status !== undefined) {
    set.push("#status = :status");
    names["#status"] = "status";
    values[":status"] = patch.status;
  }
  if (patch.dailyLimit !== undefined) {
    set.push("dailyLimit = :dailyLimit");
    values[":dailyLimit"] = patch.dailyLimit;
  }
  if (patch.perTransactionLimit !== undefined) {
    set.push("perTransactionLimit = :perTxn");
    values[":perTxn"] = patch.perTransactionLimit;
  }
  if (patch.allowedMerchants !== undefined) {
    set.push("allowedMerchants = :merchants");
    values[":merchants"] = patch.allowedMerchants;
  }

  const updated = await updateItem<AgentWallet>({
    keys: Keys.agentWallet(agent.walletId, agent.agentId),
    set,
    expressionAttributeNames: Object.keys(names).length ? names : undefined,
    expressionAttributeValues: values,
  });

  const wallet = updated ?? { ...agent, ...patch };
  const { apiKey: _secret, ...publicWallet } = wallet;

  return json(200, { wallet: publicWallet });
};
