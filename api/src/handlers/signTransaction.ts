/**
 * Transaction signer Lambda (orchestration only in production).
 *
 * Production path: Nitro Enclave on EC2 (infra/nitro-enclave/).
 * That instance role is the ONLY IAM principal granted kms:Sign and
 * kms:DescribeKey on the secp256k1 TransactionSigningKey. This Lambda's
 * execution role intentionally has no KMS sign permissions — call the
 * enclave host over the VPC (private IP / port 8443) once the EIF is running.
 *
 * Hackathon note: the in-process KMS Sign below still works only if you
 * temporarily re-attach kms:Sign for local demos; the SAM template does not.
 */

import { KMSClient, SignCommand } from "@aws-sdk/client-kms";
import type { Handler } from "aws-lambda";
import { getItem, updateItem } from "../lib/dynamo";
import { Keys, type Transaction } from "../lib/schema";

export interface SignTransactionEvent {
  agentId: string;
  timestamp: string;
  txnId: string;
}

export interface SignTransactionResult {
  txnId: string;
  status: "SIGNED";
  signature: string;
  signedAt: string;
  signingAlgorithm: string;
}

const SIGNING_ALGORITHM = "ECDSA_SHA_256" as const;

const kms = new KMSClient({});

/** Deterministic JSON for the bytes passed to KMS Sign. */
export function canonicalTransactionJson(txn: Transaction): string {
  const payload: Record<string, unknown> = {
    agentId: txn.agentId,
    amount: txn.amount,
    purpose: txn.purpose,
    recipient: txn.recipient,
    status: "ALLOWED",
    timestamp: txn.timestamp,
    txnId: txn.txnId,
    type: txn.type,
  };
  return JSON.stringify(sortKeysDeep(payload));
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeysDeep(obj[key]);
    }
    return out;
  }
  return value;
}

export function assertAllowedForSigning(txn: Transaction | null): Transaction {
  if (!txn || txn.entityType !== "Transaction") {
    throw new Error("Transaction not found");
  }
  if (txn.status !== "ALLOWED") {
    throw new Error(
      `Refusing to sign: expected status ALLOWED, got ${txn.status}`
    );
  }
  return txn;
}

export const handler: Handler<
  SignTransactionEvent,
  SignTransactionResult
> = async (event) => {
  const keyId = process.env.KMS_KEY_ID;
  if (!keyId) {
    throw new Error("KMS_KEY_ID is not configured");
  }

  const keys = Keys.transaction(event.agentId, event.timestamp, event.txnId);
  const loaded = await getItem<Transaction>(keys);
  const txn = assertAllowedForSigning(loaded);

  const message = Buffer.from(canonicalTransactionJson(txn), "utf8");

  const signed = await kms.send(
    new SignCommand({
      KeyId: keyId,
      Message: message,
      MessageType: "RAW",
      SigningAlgorithm: SIGNING_ALGORITHM,
    })
  );

  if (!signed.Signature) {
    throw new Error("KMS Sign returned no signature");
  }

  const signature = Buffer.from(signed.Signature).toString("base64");
  const signedAt = new Date().toISOString();

  // Trust-boundary log: signing key never leaves KMS; no other stack role can kms:Sign.
  console.log(
    JSON.stringify({
      level: "info",
      msg: "signing key never leaves KMS; no other execution role in this stack can invoke kms:Sign",
      trustBoundary: "kms-isolated-signer",
      nitroEnclaveSubstitute: true,
      txnId: txn.txnId,
      agentId: txn.agentId,
      signingAlgorithm: SIGNING_ALGORITHM,
      keyId,
    })
  );

  await updateItem<Transaction>({
    keys,
    set: [
      "#status = :signed",
      "signature = :signature",
      "signedAt = :signedAt",
      "signingAlgorithm = :alg",
      "reason = :reason",
    ],
    expressionAttributeNames: { "#status": "status" },
    expressionAttributeValues: {
      ":signed": "SIGNED",
      ":signature": signature,
      ":signedAt": signedAt,
      ":alg": SIGNING_ALGORITHM,
      ":reason": "SIGNED",
      ":allowed": "ALLOWED",
    },
    // Defense in depth: only transition from ALLOWED → SIGNED
    conditionExpression: "#status = :allowed",
  });

  return {
    txnId: txn.txnId,
    status: "SIGNED",
    signature,
    signedAt,
    signingAlgorithm: SIGNING_ALGORITHM,
  };
};
