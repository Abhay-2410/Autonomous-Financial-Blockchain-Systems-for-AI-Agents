import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { json } from "../lib/http";
import { DEMO_CHAIN } from "../lib/chain";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  return json(200, {
    ok: true,
    service: "limitx-pay",
    product: "LimitX",
    stage: process.env.ENVIRONMENT ?? process.env.TABLE_NAME ?? "unknown",
    chain: {
      chainId: DEMO_CHAIN.chainId,
      name: DEMO_CHAIN.name,
      tokenSymbol: DEMO_CHAIN.tokenSymbol,
      settlementMode: DEMO_CHAIN.settlementMode,
    },
  });
};
