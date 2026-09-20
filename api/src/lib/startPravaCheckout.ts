/**
 * After LimitX policy ALLOW + KMS sign, open a Prava hosted checkout session
 * so the owner can approve a one-time, merchant-scoped card credential.
 */

import { updateItem } from "./dynamo";
import { getMerchantByName } from "./merchants";
import {
  createPravaSession,
  isPravaConfigured,
  PravaError,
  type PravaSession,
} from "./prava";
import { Keys, type Transaction } from "./schema";

export interface PravaCheckoutSummary {
  configured: boolean;
  sessionId?: string;
  orderId?: string | null;
  iframeUrl?: string;
  expiresAt?: string;
  message?: string;
}

export async function startPravaCheckoutForTransaction(
  txn: Transaction
): Promise<PravaCheckoutSummary> {
  if (!isPravaConfigured()) {
    return {
      configured: false,
      message:
        "Prava is not configured. Set PRAVA_SECRET_KEY (sk_test_…) on the API to enable card checkout.",
    };
  }

  const merchant = await getMerchantByName(txn.recipient);
  const merchantName = merchant?.name ?? txn.recipient;
  const merchantUrl =
    merchant?.url ?? `https://www.${txn.recipient.toLowerCase()}.com`;

  let session: PravaSession;
  try {
    session = await createPravaSession({
      userId: `limitx:${txn.agentId}`,
      amount: txn.amount,
      merchantName,
      merchantUrl,
      productDescription: txn.purpose || `${merchantName} purchase`,
      limitxTxnId: txn.txnId,
      countryCode: "US",
    });
  } catch (err) {
    if (err instanceof PravaError) {
      return {
        configured: true,
        message: `Prava session failed: ${err.code} — ${err.message}`,
      };
    }
    throw err;
  }

  const keys = Keys.transaction(txn.agentId, txn.timestamp, txn.txnId);
  await updateItem<Transaction>({
    keys,
    set: [
      "settlementRail = :rail",
      "pravaSessionId = :sid",
      "pravaOrderId = :oid",
      "pravaIframeUrl = :url",
      "pravaStatus = :st",
      "pravaExpiresAt = :exp",
    ],
    expressionAttributeValues: {
      ":rail": "prava",
      ":sid": session.session_id,
      ":oid": session.order_id,
      ":url": session.iframe_url,
      ":st": "SESSION_CREATED",
      ":exp": session.expires_at,
    },
  });

  return {
    configured: true,
    sessionId: session.session_id,
    orderId: session.order_id,
    iframeUrl: session.iframe_url,
    expiresAt: session.expires_at,
  };
}
