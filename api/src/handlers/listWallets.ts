import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { resolveOwnerAuth } from "../lib/authContext";
import { docClient, getTableName } from "../lib/dynamo";
import { ensureAgentStellar } from "../lib/ensureStellar";
import { json } from "../lib/http";
import type { AgentWallet } from "../lib/schema";

function publicWallet(w: AgentWallet) {
  const { apiKey: _secret, stellarSecretEnc: _enc, ...rest } = w;
  return rest;
}

/**
 * GET /wallets — AgentWallet rows for the signed-in owner's treasury.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = resolveOwnerAuth(event);
  if (!auth) {
    return json(401, { message: "Sign in with your phone number." });
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": `WALLET#${auth.walletId}`,
        ":sk": "AGENT#",
      },
    })
  );

  let wallets = ((result.Items ?? []) as AgentWallet[]).filter(
    (i) => i.entityType === "AgentWallet"
  );
  wallets = await Promise.all(wallets.map((w) => ensureAgentStellar(w)));

  const publicWallets = wallets
    .map(publicWallet)
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  return json(200, {
    wallets: publicWallets,
    count: publicWallets.length,
    walletId: auth.walletId,
  });
};
