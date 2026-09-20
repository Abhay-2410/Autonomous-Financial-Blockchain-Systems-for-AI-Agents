import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getAgentById, getItem, updateItem } from "../lib/dynamo";
import { json } from "../lib/http";
import { Keys, type AgentWallet, type ParentWallet } from "../lib/schema";

/**
 * POST /wallets/{agentId}/topup
 * Body: { amount: number }
 * Moves demo balance from parent treasury → agent allocatedBalance.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const agentId = event.pathParameters?.agentId;
  if (!agentId) {
    return json(400, { message: "agentId path parameter required" });
  }

  let amount = 0;
  try {
    const body = JSON.parse(event.body ?? "{}") as { amount?: unknown };
    amount = typeof body.amount === "number" ? body.amount : NaN;
  } catch {
    return json(400, { message: "Invalid JSON body" });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return json(400, { message: "amount must be a positive number" });
  }

  const agent = await getAgentById(agentId);
  if (!agent) {
    return json(404, { message: `Agent not found: ${agentId}` });
  }

  const parent = await getItem<ParentWallet>(Keys.parentWallet(agent.walletId));
  if (!parent || parent.entityType !== "ParentWallet") {
    return json(404, { message: "Parent treasury not found" });
  }

  const treasury = parent.balance ?? 0;
  if (treasury < amount) {
    return json(400, {
      message: `Insufficient treasury balance (${treasury})`,
    });
  }

  const updatedParent = await updateItem<ParentWallet>({
    keys: Keys.parentWallet(agent.walletId),
    set: ["balance = :bal"],
    expressionAttributeValues: { ":bal": treasury - amount },
  });

  const nextAllocated = (agent.allocatedBalance ?? 0) + amount;
  const updatedAgent = await updateItem<AgentWallet>({
    keys: Keys.agentWallet(agent.walletId, agent.agentId),
    set: ["allocatedBalance = :alloc"],
    expressionAttributeValues: { ":alloc": nextAllocated },
  });

  const { apiKey: _secret, ...publicWallet } = updatedAgent ?? {
    ...agent,
    allocatedBalance: nextAllocated,
  };

  return json(200, {
    treasuryBalance: updatedParent?.balance ?? treasury - amount,
    wallet: publicWallet,
    toppedUp: amount,
  });
};
