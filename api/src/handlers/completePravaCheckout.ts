/**
 * POST /transactions/{transactionId}/prava/complete
 *
 * After the owner finishes Prava hosted checkout (passkey), poll for
 * credentials and report APPROVED to Prava. Marks the LimitX txn CONFIRMED.
 * Network tokens never leave this Lambda response (stripped).
 */

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getTransactionById, updateItem } from "../lib/dynamo";
import { json } from "../lib/http";
import {
  getPravaPaymentResult,
  isPravaConfigured,
  publicPravaStatus,
  reportPravaStatus,
  PravaError,
} from "../lib/prava";
import { Keys, type Transaction } from "../lib/schema";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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
  if (!txn) {
    return json(404, { message: `Transaction not found: ${txnId}` });
  }

  const sessionId = txn.pravaSessionId;
  if (!sessionId) {
    return json(400, {
      message: "Transaction has no pravaSessionId — pay with settlementRail=prava first",
    });
  }

  try {
    let result = await getPravaPaymentResult(sessionId);
    // Brief poll while the hosted page finishes tokenization
    for (let i = 0; i < 8; i++) {
      if (
        result.status === "awaiting_result" ||
        result.status === "completed" ||
        result.status === "failed"
      ) {
        break;
      }
      await sleep(1500);
      result = await getPravaPaymentResult(sessionId);
    }

    if (result.status === "failed") {
      await updateItem<Transaction>({
        keys: Keys.transaction(txn.agentId, txn.timestamp, txn.txnId),
        set: ["pravaStatus = :st", "reason = :reason"],
        expressionAttributeValues: {
          ":st": "PRAVA_FAILED",
          ":reason": result.error?.message ?? "PRAVA_FAILED",
        },
      });
      return json(402, {
        message: result.error?.message ?? "Prava payment failed",
        prava: publicPravaStatus(result),
      });
    }

    const line = result.transactions[0]?.line_items?.[0];
    const txnRefId = line?.txn_ref_id;

    if (txnRefId && result.status === "awaiting_result") {
      // Demo: LimitX acts as the merchant checkout — report success to Prava.
      // Real production would charge the one-time token at the PSP first.
      await reportPravaStatus(sessionId, txnRefId, "APPROVED");
      result = await getPravaPaymentResult(sessionId);
    }

    const confirmedAt = new Date().toISOString();
    await updateItem<Transaction>({
      keys: Keys.transaction(txn.agentId, txn.timestamp, txn.txnId),
      set: [
        "#status = :confirmed",
        "pravaStatus = :pst",
        "confirmedAt = :ca",
        "reason = :reason",
        "settlementRail = :rail",
      ],
      expressionAttributeNames: { "#status": "status" },
      expressionAttributeValues: {
        ":confirmed": "CONFIRMED",
        ":pst": result.status === "completed" ? "PRAVA_COMPLETED" : "PRAVA_REPORTED",
        ":ca": confirmedAt,
        ":reason": "CONFIRMED_VIA_PRAVA",
        ":rail": "prava",
      },
    });

    return json(200, {
      transactionId: txnId,
      status: "CONFIRMED",
      settlementRail: "prava",
      confirmedAt,
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
