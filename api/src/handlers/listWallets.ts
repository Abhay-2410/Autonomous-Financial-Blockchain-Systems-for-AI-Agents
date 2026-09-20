import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, getTableName } from "../lib/dynamo";
import { json } from "../lib/http";
import type { AgentWallet } from "../lib/schema";

function publicWallet(w: AgentWallet) {
  const { apiKey: _secret, ...rest } = w;
  return rest;
}

/**
 * GET /wallets — all AgentWallet rows (apiKey stripped).
 */
export const handler: APIGatewayProxyHandlerV2 = async () => {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getTableName(),
      FilterExpression: "entityType = :et",
      ExpressionAttributeValues: { ":et": "AgentWallet" },
    })
  );

  const wallets = ((result.Items ?? []) as AgentWallet[])
    .filter((i) => i.entityType === "AgentWallet")
    .map(publicWallet)
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  return json(200, { wallets, count: wallets.length });
};
