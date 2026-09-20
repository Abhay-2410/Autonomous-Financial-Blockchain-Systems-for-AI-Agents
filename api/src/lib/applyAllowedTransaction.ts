import {
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  docClient,
  getTableName,
  putItem,
  updateItem,
} from "./dynamo";
import { invokeSignTransaction } from "./invokeSignTransaction";
import { submitToNetwork } from "../handlers/submitToNetwork";
import { emitTransactionAllowed } from "./events";
import {
  Keys,
  buildAuditEvent,
  type AgentWallet,
  type AuditEvent,
  type Transaction,
} from "./schema";

export class DailyLimitRaceError extends Error {
  readonly code = "DAILY_LIMIT_RACE";

  constructor(message = "spentToday + amount would exceed dailyLimit") {
    super(message);
    this.name = "DailyLimitRaceError";
  }
}

export interface ApplyAllowedTransactionInput {
  agent: AgentWallet;
  /** Existing transaction row (keys + fields). */
  transaction: Transaction;
  amount: number;
  recipient: string;
  timestamp: string;
}

export interface ApplyAllowedTransactionResult {
  agent: AgentWallet;
  transaction: Transaction;
  audit: AuditEvent;
  spentTodayAfter: number;
}

/**
 * Apply an ALLOWED decision: atomically bump spentToday, mark the txn ALLOWED,
 * and append a TRANSACTION_ALLOWED audit event.
 *
 * ConditionExpression ensures spentToday + amount <= dailyLimit at write time
 * so two concurrent ALLOWED paths cannot both commit past the daily ceiling.
 */
export async function applyAllowedTransaction(
  input: ApplyAllowedTransactionInput
): Promise<ApplyAllowedTransactionResult> {
  const { agent, transaction, amount, recipient, timestamp } = input;
  const agentKeys = Keys.agentWallet(agent.walletId, agent.agentId);
  const maxSpentBefore = agent.dailyLimit - amount;

  let spentTodayAfter: number;

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { pk: agentKeys.pk, sk: agentKeys.sk },
        UpdateExpression: "SET spentToday = spentToday + :amount",
        ConditionExpression:
          "attribute_exists(pk) AND spentToday <= :maxSpentBefore",
        ExpressionAttributeValues: {
          ":amount": amount,
          ":maxSpentBefore": maxSpentBefore,
        },
        ReturnValues: "ALL_NEW",
      })
    );

    const updated = result.Attributes as AgentWallet | undefined;
    if (!updated || typeof updated.spentToday !== "number") {
      throw new Error("AgentWallet update did not return spentToday");
    }
    spentTodayAfter = updated.spentToday;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      throw new DailyLimitRaceError();
    }
    throw err;
  }

  const txnKeys = Keys.transaction(
    transaction.agentId,
    transaction.timestamp,
    transaction.txnId
  );

  const updatedTxn = await updateItem<Transaction>({
    keys: txnKeys,
    set: ["#status = :allowed", "reason = :reason"],
    expressionAttributeNames: { "#status": "status" },
    expressionAttributeValues: {
      ":allowed": "ALLOWED",
      ":reason": "ALLOWED",
    },
  });

  const finalTxn: Transaction = updatedTxn ?? {
    ...transaction,
    status: "ALLOWED",
    reason: "ALLOWED",
  };

  const audit = buildAuditEvent({
    agentId: agent.agentId,
    timestamp,
    eventType: "TRANSACTION_ALLOWED",
    details: {
      type: "TRANSACTION_ALLOWED",
      amount,
      recipient,
      spentTodayAfter,
    },
  });
  await putItem(audit);

  await emitTransactionAllowed(
    agent,
    amount,
    recipient,
    transaction.txnId,
    agent.spentToday
  );

  // Internal-only KMS signer (IAM-isolated; approximates Nitro Enclave boundary).
  const signed = await invokeSignTransaction(finalTxn);
  if (signed) {
    finalTxn.status = "SIGNED";
    finalTxn.signature = signed.signature;
    finalTxn.signedAt = signed.signedAt;
    finalTxn.signingAlgorithm = signed.signingAlgorithm;
    finalTxn.reason = "SIGNED";

    // Demo stub settlement — SUBMITTED → CONFIRMED (not a real chain).
    const confirmed = await submitToNetwork({
      agentId: finalTxn.agentId,
      timestamp: finalTxn.timestamp,
      txnId: finalTxn.txnId,
    });
    finalTxn.status = "CONFIRMED";
    finalTxn.txHash = confirmed.txHash;
    finalTxn.confirmedAt = confirmed.confirmedAt;
    finalTxn.reason = "CONFIRMED";
  }

  const updatedAgent: AgentWallet = {
    ...agent,
    spentToday: spentTodayAfter,
  };

  return {
    agent: updatedAgent,
    transaction: finalTxn,
    audit,
    spentTodayAfter,
  };
}

function isConditionalCheckFailed(err: unknown): boolean {
  if (err instanceof ConditionalCheckFailedException) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; Code?: string; code?: string };
  return (
    e.name === "ConditionalCheckFailedException" ||
    e.Code === "ConditionalCheckFailedException" ||
    e.code === "ConditionalCheckFailedException"
  );
}
