import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { json } from "../lib/http";
import { listMerchants } from "../lib/merchants";

/**
 * GET /merchants — payout directory for the Pay screen.
 */
export const handler: APIGatewayProxyHandlerV2 = async () => {
  const merchants = listMerchants();
  return json(200, { merchants, count: merchants.length });
};
