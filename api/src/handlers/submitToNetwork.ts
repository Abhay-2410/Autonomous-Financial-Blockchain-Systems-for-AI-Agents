/**
 * Stub settlement for the demo — not a live RPC yet.
 * Produces EVM-looking tx hashes + Basescan explorer URLs so the payments UI
 * can show "View on explorer" like a real chain wallet app.
 */

import type { Handler } from "aws-lambda";
import {
  DEMO_CHAIN,
  explorerTxUrl,
  stubTxHash,
} from "../lib/chain";
import { getItem, putItem, updateItem, getAgentById } from "../lib/dynamo";
import { getMerchantByName } from "../lib/merchants";
import {
  Keys,
  buildAuditEvent,
  type Transaction,
} from "../lib/schema";

export interface SubmitToNetworkEvent {
  agentId: string;
  timestamp: string;
  txnId: string;
}

export interface SubmitToNetworkResult {
  txnId: string;
  status: "CONFIRMED";
  txHash: string;
  confirmedAt: string;
  explorerUrl: string;
  chainId: number;
}

const CONFIRM_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Local demo: wait 1.5s. Lambda: confirm immediately (no artificial timeout). */
export function networkConfirmDelayMs(): number {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return 0;
  }
  if (process.env.NETWORK_CONFIRM_DELAY_MS !== undefined) {
    return Number(process.env.NETWORK_CONFIRM_DELAY_MS) || 0;
  }
  return CONFIRM_DELAY_MS;
}

/**
 * Given a SIGNED transaction: SUBMITTED → (delay) → CONFIRMED + stub chain fields + audit.
 */
export async function submitToNetwork(
  event: SubmitToNetworkEvent
): Promise<SubmitToNetworkResult> {
  const keys = Keys.transaction(event.agentId, event.timestamp, event.txnId);
  const txn = await getItem<Transaction>(keys);

  if (!txn || txn.entityType !== "Transaction") {
    throw new Error("Transaction not found");
  }
  if (txn.status !== "SIGNED") {
    throw new Error(
      `submitToNetwork expects status SIGNED, got ${txn.status}`
    );
  }

  const agent = await getAgentById(txn.agentId);
  const merchant = await getMerchantByName(txn.recipient);
  const fromAddress = agent?.address;
  const toAddress = merchant?.address;
  const chainId = agent?.chainId ?? DEMO_CHAIN.chainId;
  const tokenSymbol = agent?.tokenSymbol ?? DEMO_CHAIN.tokenSymbol;

  console.log(
    JSON.stringify({
      level: "info",
      msg: "network submission (stub)",
      demoOnly: true,
      settlementMode: DEMO_CHAIN.settlementMode,
      txnId: txn.txnId,
      agentId: txn.agentId,
      amount: txn.amount,
      recipient: txn.recipient,
      fromAddress,
      toAddress,
      chainId,
    })
  );

  await updateItem<Transaction>({
    keys,
    set: ["#status = :submitted", "reason = :reason"],
    expressionAttributeNames: { "#status": "status" },
    expressionAttributeValues: {
      ":submitted": "SUBMITTED",
      ":reason": "SUBMITTED",
      ":signed": "SIGNED",
    },
    conditionExpression: "#status = :signed",
  });

  const delay = networkConfirmDelayMs();
  if (delay > 0) {
    await sleep(delay);
  }

  const txHash = stubTxHash(`${txn.txnId}:${txn.timestamp}`);
  const explorerUrl = explorerTxUrl(txHash);
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
    ],
    expressionAttributeNames: { "#status": "status" },
    expressionAttributeValues: {
      ":confirmed": "CONFIRMED",
      ":txHash": txHash,
      ":confirmedAt": confirmedAt,
      ":reason": "CONFIRMED",
      ":submitted": "SUBMITTED",
      ":chainId": chainId,
      ":fromAddress": fromAddress ?? "",
      ":toAddress": toAddress ?? "",
      ":explorerUrl": explorerUrl,
      ":tokenSymbol": tokenSymbol,
    },
    conditionExpression: "#status = :submitted",
  });

  await putItem(
    buildAuditEvent({
      agentId: txn.agentId,
      timestamp: confirmedAt,
      eventType: "TRANSACTION_CONFIRMED",
      details: {
        type: "TRANSACTION_CONFIRMED",
        txnId: txn.txnId,
        txHash,
        explorerUrl,
        chainId,
        fromAddress,
        toAddress,
        tokenSymbol,
        amount: txn.amount,
        recipient: txn.recipient,
        settlementMode: DEMO_CHAIN.settlementMode,
      },
    })
  );

  console.log(
    JSON.stringify({
      level: "info",
      msg: "network confirmation (stub)",
      demoOnly: true,
      txnId: txn.txnId,
      txHash,
      explorerUrl,
      status: "CONFIRMED",
    })
  );

  return {
    txnId: txn.txnId,
    status: "CONFIRMED",
    txHash,
    confirmedAt,
    explorerUrl,
    chainId,
  };
}

/** Optional Lambda entry — same stub logic; no public API route required. */
export const handler: Handler<
  SubmitToNetworkEvent,
  SubmitToNetworkResult
> = async (event) => submitToNetwork(event);
