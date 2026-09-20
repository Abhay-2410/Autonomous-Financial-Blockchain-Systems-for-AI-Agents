import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getAgentById } from "../lib/dynamo";
import { json } from "../lib/http";

function policyPathFor(agentId: string): string {
  return join(__dirname, "..", "policy", "policies", `${agentId}.cedar`);
}

function readCedarPolicy(agentId: string): string | null {
  const path = policyPathFor(agentId);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/**
 * GET /policies/{agentId} — Cedar source (read-only) + current wallet limits.
 * GET /policies — list agentIds that have a bundled .cedar file.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const agentId = event.pathParameters?.agentId;

  if (!agentId) {
    const dir = join(__dirname, "..", "policy", "policies");
    let agents: string[] = [];
    try {
      agents = readdirSync(dir)
        .filter((f) => f.endsWith(".cedar"))
        .map((f) => f.replace(/\.cedar$/, ""));
    } catch {
      agents = ["shopping-bot", "vendor-agent"];
    }
    return json(200, { agents, count: agents.length });
  }

  const cedarPolicy = readCedarPolicy(agentId);
  if (cedarPolicy === null) {
    return json(404, { message: `No Cedar policy file for agent: ${agentId}` });
  }

  const agent = await getAgentById(agentId);

  return json(200, {
    agentId,
    cedarPolicy,
    source: `policies/${agentId}.cedar`,
    wallet: agent
      ? {
          name: agent.name,
          status: agent.status,
          dailyLimit: agent.dailyLimit,
          perTransactionLimit: agent.perTransactionLimit,
          allowedMerchants: agent.allowedMerchants,
          spentToday: agent.spentToday,
          spentTodayDate: agent.spentTodayDate,
        }
      : null,
  });
};
