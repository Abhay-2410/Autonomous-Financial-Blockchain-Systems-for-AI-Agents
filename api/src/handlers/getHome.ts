import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DEMO_CHAIN, explorerAddressUrl } from "../lib/chain";
import {
  docClient,
  getTableName,
  listPendingApprovalTransactions,
} from "../lib/dynamo";
import { json } from "../lib/http";
import type { AgentWallet, ParentWallet } from "../lib/schema";

/**
 * GET /home — payments-app summary: treasury, agents, pending count.
 */
export const handler: APIGatewayProxyHandlerV2 = async () => {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getTableName(),
      FilterExpression: "entityType = :parent OR entityType = :agent",
      ExpressionAttributeValues: {
        ":parent": "ParentWallet",
        ":agent": "AgentWallet",
      },
    })
  );

  const items = result.Items ?? [];
  const parent = items.find(
    (i) => (i as ParentWallet).entityType === "ParentWallet"
  ) as ParentWallet | undefined;

  const agents = (items as AgentWallet[])
    .filter((i) => i.entityType === "AgentWallet")
    .map(({ apiKey: _k, ...rest }) => rest)
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  const pending = await listPendingApprovalTransactions();

  const totalAllocated = agents.reduce(
    (sum, a) => sum + (a.allocatedBalance ?? a.dailyLimit),
    0
  );
  const totalSpentToday = agents.reduce((sum, a) => sum + a.spentToday, 0);

  const treasuryAddress =
    parent?.address ??
    `0x${"0".repeat(40)}`;

  return json(200, {
    orgName: parent?.orgName ?? "LimitX",
    walletId: parent?.walletId ?? process.env.WALLET_ID ?? "org-limitx",
    treasury: {
      balance: parent?.balance ?? totalAllocated,
      address: treasuryAddress,
      explorerUrl: explorerAddressUrl(treasuryAddress),
      chainId: parent?.chainId ?? DEMO_CHAIN.chainId,
      chainName: parent?.chainName ?? DEMO_CHAIN.name,
      tokenSymbol: parent?.tokenSymbol ?? DEMO_CHAIN.tokenSymbol,
      settlementMode: DEMO_CHAIN.settlementMode,
    },
    totals: {
      agentCount: agents.length,
      activeAgents: agents.filter((a) => a.status === "ACTIVE").length,
      allocated: totalAllocated,
      spentToday: totalSpentToday,
      pendingApprovals: pending.length,
    },
    agents: agents.map((a) => ({
      agentId: a.agentId,
      name: a.name,
      status: a.status,
      spentToday: a.spentToday,
      dailyLimit: a.dailyLimit,
      address: a.address,
      tokenSymbol: a.tokenSymbol ?? DEMO_CHAIN.tokenSymbol,
    })),
  });
};
