import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, getTableName, queryAuditEvents } from "../lib/dynamo";
import { json } from "../lib/http";
import type { AuditEvent } from "../lib/schema";

function mapEvent(e: AuditEvent) {
  return {
    agentId: e.agentId,
    timestamp: e.timestamp,
    eventType: e.eventType,
    details: e.details,
    sk: e.sk,
  };
}

/**
 * GET /audit?agentId=X&limit=50&nextToken=...
 * GET /audit?limit=50 — live feed across all agents (scan, newest first).
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const agentId = event.queryStringParameters?.agentId;
  const rawLimit = event.queryStringParameters?.limit;
  const limit = Math.min(
    100,
    Math.max(1, rawLimit ? Number.parseInt(rawLimit, 10) || 50 : 50)
  );
  const nextToken = event.queryStringParameters?.nextToken;

  if (agentId) {
    try {
      const page = await queryAuditEvents(agentId, { limit, nextToken });
      return json(200, {
        agentId,
        items: page.items.map(mapEvent),
        nextToken: page.nextToken,
        count: page.items.length,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Invalid nextToken") {
        return json(400, { message: "Invalid nextToken" });
      }
      throw err;
    }
  }

  const result = await docClient.send(
    new ScanCommand({
      TableName: getTableName(),
      FilterExpression: "entityType = :et",
      ExpressionAttributeValues: { ":et": "AuditEvent" },
    })
  );

  const items = ((result.Items ?? []) as AuditEvent[])
    .filter((i) => i.entityType === "AuditEvent")
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, limit)
    .map(mapEvent);

  return json(200, { items, count: items.length });
};
