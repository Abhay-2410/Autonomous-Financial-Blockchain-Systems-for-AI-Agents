import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import type { Transaction } from "./schema";
import type { SignTransactionResult } from "../handlers/signTransaction";

const lambda = new LambdaClient({});

/**
 * Invoke the IAM-isolated signer Lambda (no public route).
 * No-ops when SIGN_TRANSACTION_FUNCTION_NAME is unset (local/unit tests).
 */
export async function invokeSignTransaction(
  transaction: Transaction
): Promise<SignTransactionResult | null> {
  const functionName = process.env.SIGN_TRANSACTION_FUNCTION_NAME;
  if (!functionName) {
    console.warn(
      "[sign] SIGN_TRANSACTION_FUNCTION_NAME unset; skipping KMS sign (local)"
    );
    return null;
  }

  const payload = {
    agentId: transaction.agentId,
    timestamp: transaction.timestamp,
    txnId: transaction.txnId,
  };

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
    throw new Error(`signTransaction failed: ${errBody}`);
  }

  if (!response.Payload) {
    throw new Error("signTransaction returned empty payload");
  }

  return JSON.parse(
    Buffer.from(response.Payload).toString("utf8")
  ) as SignTransactionResult;
}
