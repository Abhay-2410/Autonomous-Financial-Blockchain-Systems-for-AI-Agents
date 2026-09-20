import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import type { Transaction } from "./schema";
import type { SignTransactionResult } from "../handlers/signTransaction";

const lambda = new LambdaClient({});

export type SigningMode = "lambda-kms" | "nitro-enclave";

/**
 * Resolve SIGNING_MODE feature flag.
 *
 *   lambda-kms     → Prompt 7 SignTransaction Lambda (Free Tier / demo fallback)
 *   nitro-enclave  → authorizeAndSignViaEnclave (parent → vsock → enclave)
 *
 * Flip SIGNING_MODE on RequestTransaction / OnApprove instantly if the enclave
 * misbehaves during a live demo — both functions stay deployed.
 */
export function resolveSigningMode(
  raw: string | undefined = process.env.SIGNING_MODE
): SigningMode {
  const mode = (raw ?? "lambda-kms").trim().toLowerCase();
  return mode === "nitro-enclave" ? "nitro-enclave" : "lambda-kms";
}

/**
 * Invoke the configured signer Lambda based on SIGNING_MODE.
 */
export async function invokeSignTransaction(
  transaction: Transaction
): Promise<SignTransactionResult | null> {
  const mode = resolveSigningMode();
  const enclaveFn =
    process.env.AUTHORIZE_AND_SIGN_VIA_ENCLAVE_FUNCTION_NAME ??
    process.env.ENCLAVE_SIGN_FUNCTION_NAME;
  const lambdaKmsFn = process.env.SIGN_TRANSACTION_FUNCTION_NAME;

  let functionName: string | undefined;
  if (mode === "nitro-enclave") {
    functionName = enclaveFn || lambdaKmsFn;
    if (!enclaveFn) {
      console.warn(
        "[sign] SIGNING_MODE=nitro-enclave but AUTHORIZE_AND_SIGN_VIA_ENCLAVE_FUNCTION_NAME unset; falling back to lambda-kms"
      );
    }
  } else {
    functionName = lambdaKmsFn || enclaveFn;
  }

  if (!functionName) {
    console.warn(
      "[sign] no signer function configured; skipping sign (local)"
    );
    return null;
  }

  const payload = {
    agentId: transaction.agentId,
    timestamp: transaction.timestamp,
    txnId: transaction.txnId,
  };

  console.log(
    JSON.stringify({
      level: "info",
      msg: "invoke signer",
      signingMode: mode,
      via: mode,
      functionName,
      txnId: transaction.txnId,
    })
  );

  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );

  if (response.FunctionError) {
    const errBody = response.Payload
      ? Buffer.from(response.Payload).toString("utf8")
      : response.FunctionError;
    throw new Error(`sign invoke failed: ${errBody}`);
  }

  if (!response.Payload) {
    throw new Error("signer returned empty payload");
  }

  return JSON.parse(
    Buffer.from(response.Payload).toString("utf8")
  ) as SignTransactionResult;
}
