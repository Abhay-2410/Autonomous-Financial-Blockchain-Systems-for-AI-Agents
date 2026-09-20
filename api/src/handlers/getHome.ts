import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { resolveOwnerAuth } from "../lib/authContext";
import { DEMO_CHAIN, explorerAddressUrl } from "../lib/chain";
import {
  docClient,
  getTableName,
  listPendingApprovalTransactions,
} from "../lib/dynamo";
import { ensureAgentStellar, ensureParentStellar } from "../lib/ensureStellar";
import { json } from "../lib/http";
import type { AgentWallet, ParentWallet } from "../lib/schema";
import {
  explorerAccountUrl,
  getXlmBalance,
  STELLAR,
} from "../lib/stellar";

/**
 * GET /home — payments-app summary for the signed-in owner's wallet.
 * Authorization: Bearer <session> (or x-owner-key for legacy server proxy).
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = resolveOwnerAuth(event);
  if (!auth) {
    return json(401, { message: "Sign in with your phone number." });
  }

  const walletId = auth.walletId;
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": `WALLET#${walletId}`,
      },
    })
  );

  const items = result.Items ?? [];
  let parent = items.find(
    (i) => (i as ParentWallet).entityType === "ParentWallet"
  ) as ParentWallet | undefined;

  let agents = (items as AgentWallet[])
    .filter((i) => i.entityType === "AgentWallet")
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  // Backfill Stellar Testnet accounts for wallets created before this rail.
  if (parent) {
    parent = await ensureParentStellar(parent);
  }
  agents = await Promise.all(agents.map((a) => ensureAgentStellar(a)));

  const publicAgents = agents.map(({ apiKey: _k, stellarSecretEnc: _s, ...rest }) => rest);

  // Same source as GET /approvals/pending — do not filter by local agent list
  // (that caused Home "Needs approval: 0" while the Approvals inbox had items).
  const pending = await listPendingApprovalTransactions();

  const totalAllocated = agents.reduce(
    (sum, a) => sum + (a.allocatedBalance ?? a.dailyLimit),
    0
  );
  const totalSpentToday = agents.reduce((sum, a) => sum + a.spentToday, 0);

  const treasuryAddress = parent?.address ?? `0x${"0".repeat(40)}`;
  const isStellar = treasuryAddress.startsWith("G");
  const xlmBalance = isStellar ? await getXlmBalance(treasuryAddress) : null;

  return json(200, {
    orgName: parent?.orgName ?? "LimitX",
    walletId,
    phone: auth.phone ?? null,
    treasury: {
      balance: xlmBalance ?? parent?.balance ?? totalAllocated,
      address: treasuryAddress,
      explorerUrl: isStellar
        ? explorerAccountUrl(treasuryAddress)
        : explorerAddressUrl(treasuryAddress),
      chainId: parent?.chainId ?? (isStellar ? STELLAR.chainId : DEMO_CHAIN.chainId),
      chainName:
        parent?.chainName ?? (isStellar ? STELLAR.chainName : DEMO_CHAIN.name),
      tokenSymbol:
        parent?.tokenSymbol ??
        (isStellar ? STELLAR.tokenSymbol : DEMO_CHAIN.tokenSymbol),
      settlementMode: isStellar
        ? STELLAR.settlementMode
        : DEMO_CHAIN.settlementMode,
    },
    totals: {
      agentCount: agents.length,
      activeAgents: agents.filter((a) => a.status === "ACTIVE").length,
      allocated: totalAllocated,
      spentToday: totalSpentToday,
      pendingApprovals: pending.length,
    },
    agents: publicAgents.map((a) => ({
      agentId: a.agentId,
      name: a.name,
      status: a.status,
      spentToday: a.spentToday,
      dailyLimit: a.dailyLimit,
      address: a.address,
      tokenSymbol: a.tokenSymbol ?? STELLAR.tokenSymbol,
    })),
  });
};
