/**
 * Submit a custodial Stellar Testnet XLM payment and mark the txn CONFIRMED.
 *
 * Transaction.amount stays USD-equivalent in Dynamo/audit. The only XLM
 * conversion is inside submitXlmPayment (DEMO_USD_EQUIV_TO_XLM, 1:1 demo).
 */

import { getItem, putItem, updateItem, getAgentById } from "./dynamo";
import { ensureAgentStellar } from "./ensureStellar";
import { merchantPayoutAddress } from "./merchants";
import { DEMO_USD_EQUIV_TO_XLM } from "./money";
import {
  Keys,
  buildAuditEvent,
  type Transaction,
} from "./schema";
import {
  STELLAR,
  submitXlmPayment,
} from "./stellar";

export interface SubmitStellarPaymentEvent {
  agentId: string;
  timestamp: string;
  txnId: string;
}

export interface SubmitStellarPaymentResult {
  txnId: string;
  status: "CONFIRMED";
  txHash: string;
  confirmedAt: string;
  explorerUrl: string;
  chainId: number;
}

export async function submitStellarPayment(
  event: SubmitStellarPaymentEvent
): Promise<SubmitStellarPaymentResult> {
  const keys = Keys.transaction(event.agentId, event.timestamp, event.txnId);
  const txn = await getItem<Transaction>(keys);

  if (!txn || txn.entityType !== "Transaction") {
    throw new Error("Transaction not found");
  }
  if (txn.status !== "SIGNED" && txn.status !== "ALLOWED") {
    throw new Error(
      `submitStellarPayment expects SIGNED/ALLOWED, got ${txn.status}`
    );
  }

  let agent = await getAgentById(txn.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${txn.agentId}`);
  }
  agent = await ensureAgentStellar(agent);
  if (!agent.stellarSecretEnc) {
    throw new Error(
      `Agent ${txn.agentId} has no Stellar secret — re-provision the account`
    );
  }

  const destination =
    (await merchantPayoutAddress(txn.recipient, "stellar")) ??
    (txn.recipient.startsWith("G") ? txn.recipient : undefined);
  if (!destination) {
    throw new Error(
      `No Stellar destination for merchant/recipient: ${txn.recipient}`
    );
  }

  await updateItem<Transaction>({
    keys,
    set: ["#status = :submitted", "reason = :reason", "settlementRail = :rail"],
    expressionAttributeNames: { "#status": "status" },
    expressionAttributeValues: {
      ":submitted": "SUBMITTED",
      ":reason": "SUBMITTED_STELLAR",
      ":rail": "stellar",
    },
  });

  // Final settlement only: USD-equivalent → XLM (demo rate labeled in money.ts).
  const paid = await submitXlmPayment({
    sealedSecret: agent.stellarSecretEnc,
    destination,
    amount: txn.amount,
    memo: txn.purpose || txn.txnId.slice(0, 8),
  });

  const confirmedAt = new Date().toISOString();

  await updateItem<Transaction>({
    keys,
    set: [
      "#status = :confirmed",
      "txHash = :txHash",
      "confirmedAt = :confirmedAt",
      "reason = :reason",
      "chainId = :chainId",
      "fromAddress = :fromAddress",
      "toAddress = :toAddress",
      "explorerUrl = :explorerUrl",
      "tokenSymbol = :tokenSymbol",
      "settlementRail = :rail",
    ],
    expressionAttributeNames: { "#status": "status" },
    expressionAttributeValues: {
      ":confirmed": "CONFIRMED",
      ":txHash": paid.hash,
      ":confirmedAt": confirmedAt,
      ":reason": "CONFIRMED_STELLAR",
      ":chainId": STELLAR.chainId,
      ":fromAddress": paid.from,
      ":toAddress": paid.to,
      ":explorerUrl": paid.explorerUrl,
      ":tokenSymbol": STELLAR.tokenSymbol,
      ":rail": "stellar",
    },
  });

  await putItem(
    buildAuditEvent({
      agentId: txn.agentId,
      timestamp: confirmedAt,
      eventType: "TRANSACTION_CONFIRMED",
      details: {
        type: "TRANSACTION_CONFIRMED",
        txnId: txn.txnId,
        txHash: paid.hash,
        explorerUrl: paid.explorerUrl,
        chainId: STELLAR.chainId,
        fromAddress: paid.from,
        toAddress: paid.to,
        tokenSymbol: STELLAR.tokenSymbol,
        // Keep audit amount in USD-equivalent (same as Transaction.amount).
        amount: txn.amount,
        recipient: txn.recipient,
        settlementMode: STELLAR.settlementMode,
        settlementRail: "stellar",
        demoUsdEquivToXlm: DEMO_USD_EQUIV_TO_XLM,
      },
    })
  );

  return {
    txnId: txn.txnId,
    status: "CONFIRMED",
    txHash: paid.hash,
    confirmedAt,
    explorerUrl: paid.explorerUrl,
    chainId: STELLAR.chainId,
  };
}
