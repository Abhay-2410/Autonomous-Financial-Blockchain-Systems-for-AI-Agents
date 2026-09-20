/**
 * Alternate signer path (vs Prompt 7 `signTransaction` Lambda).
 *
 * Selected when SIGNING_MODE=nitro-enclave (see invokeSignTransaction).
 * Keep both Lambdas deployed so a live demo can flip SIGNING_MODE=lambda-kms
 * instantly if the enclave misbehaves — no stack rewrite required.
 *
 * Flow:
 *   1. Load ALLOWED transaction + agent (policy snapshot)
 *   2. POST to parent HTTP proxy on the enclave host private IP
 *   3. Parent opens vsock → enclave re-validates + KMS Sign (via vsock-proxy)
 *   4. Persist SIGNED status + signature (same shape as signTransaction)
 *
 * Production key policy (when EnclaveImageSha384 is set) binds kms:Sign for the
 * Nitro instance role to kms:RecipientAttestation:ImageSha384 (≡ PCR0). That
 * statement is the independently checkable proof that Sign requires a fresh
 * attestation from the exact enclave image — see TransactionSigningKey in
 * infra/template.yaml (Sid: SignOnlyWithEnclaveImageAttestation).
 *
 * Env:
 *   ENCLAVE_PARENT_URL  e.g. http://10.20.1.10:8443
 *   KMS_KEY_ID          signing key id/arn
 *   AWS_REGION          forwarded to enclave
 */

import type { Handler } from "aws-lambda";
import { getAgentById, getItem, updateItem } from "../lib/dynamo";
import {
  Keys,
  type AgentWallet,
  type Transaction,
} from "../lib/schema";
import {
  assertAllowedForSigning,
  canonicalTransactionJson,
  type SignTransactionEvent,
  type SignTransactionResult,
} from "./signTransaction";

const SIGNING_ALGORITHM = "ECDSA_SHA_256" as const;

interface EnclaveSignResponse {
  transactionId?: string;
  decision?: string;
  reasons?: string[];
  signature?: string;
  failedCheck?: number;
  error?: string;
}

function policySnapshotFromAgent(agent: AgentWallet) {
  return {
    agentId: agent.agentId,
    status: agent.status,
    dailyLimit: agent.dailyLimit,
    perTransactionLimit: agent.perTransactionLimit,
    spentToday: agent.spentToday,
    allowedMerchants: agent.allowedMerchants,
    allocatedBalance: agent.allocatedBalance ?? agent.dailyLimit,
    walletExpiresAt: agent.walletExpiresAt,
    permittedTransactionTypes: agent.permittedTransactionTypes,
  };
}

export const handler: Handler<
  SignTransactionEvent,
  SignTransactionResult
> = async (event) => {
  const parentUrl = (process.env.ENCLAVE_PARENT_URL ?? "").replace(/\/$/, "");
  const keyId = process.env.KMS_KEY_ID;
  if (!parentUrl) {
    throw new Error(
      "ENCLAVE_PARENT_URL is not configured (e.g. http://10.20.1.x:8443)"
    );
  }
  if (!keyId) {
    throw new Error("KMS_KEY_ID is not configured");
  }

  const keys = Keys.transaction(event.agentId, event.timestamp, event.txnId);
  const loaded = await getItem<Transaction>(keys);
  const txn = assertAllowedForSigning(loaded);

  const agent = await getAgentById(txn.agentId);
  if (!agent) {
    throw new Error(`Agent not found for enclave sign: ${txn.agentId}`);
  }

  const canonical = canonicalTransactionJson(txn);
  const body = {
    transactionId: txn.txnId,
    canonicalTransactionJson: canonical,
    kmsKeyId: keyId,
    policySnapshot: policySnapshotFromAgent(agent),
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-north-1",
  };

  console.log(
    JSON.stringify({
      level: "info",
      msg: "forwarding sign to Nitro enclave parent proxy",
      trustBoundary: "nitro-enclave",
      parentUrl,
      txnId: txn.txnId,
      agentId: txn.agentId,
    })
  );

  const res = await fetch(`${parentUrl}/v1/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: EnclaveSignResponse;
  try {
    parsed = JSON.parse(text) as EnclaveSignResponse;
  } catch {
    throw new Error(`enclave parent returned non-JSON (${res.status}): ${text}`);
  }

  if (!res.ok || parsed.decision !== "ALLOWED" || !parsed.signature) {
    throw new Error(
      `enclave sign denied/failed: decision=${parsed.decision} reasons=${JSON.stringify(
        parsed.reasons
      )} error=${parsed.error ?? ""} http=${res.status}`
    );
  }

  const signature = parsed.signature;
  const signedAt = new Date().toISOString();

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
      ":reason": "SIGNED_VIA_ENCLAVE",
      ":allowed": "ALLOWED",
    },
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
