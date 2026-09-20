/**
 * GET /transactions/{transactionId}/prava
 * Public-safe Prava session status (never returns network token / CVV).
 */

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getTransactionById } from "../lib/dynamo";
import { json } from "../lib/http";
import {
  getPravaPaymentResult,
  isPravaConfigured,
  publicPravaStatus,
  PravaError,
} from "../lib/prava";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const txnId = event.pathParameters?.transactionId;
  if (!txnId) {
    return json(400, { message: "transactionId required" });
  }

  if (!isPravaConfigured()) {
    return json(503, {
      message: "Prava is not configured (set PRAVA_SECRET_KEY)",
      configured: false,
    });
  }

  const txn = await getTransactionById(txnId);
  const sessionId =
    event.queryStringParameters?.sessionId ?? txn?.pravaSessionId;

  if (!sessionId) {
    return json(404, {
      message: "No Prava session on this transaction yet",
      transactionId: txnId,
    });
  }

  try {
    const result = await getPravaPaymentResult(sessionId);
    return json(200, {
      configured: true,
      transactionId: txnId,
      agentId: txn?.agentId ?? null,
      limitxStatus: txn?.status ?? null,
      pravaLocalStatus: txn?.pravaStatus ?? null,
      iframeUrl: txn?.pravaIframeUrl ?? null,
      prava: publicPravaStatus(result),
    });
  } catch (err) {
    if (err instanceof PravaError) {
      return json(err.status >= 400 && err.status < 600 ? err.status : 502, {
        message: err.message,
        code: err.code,
      });
    }
    throw err;
  }
};
