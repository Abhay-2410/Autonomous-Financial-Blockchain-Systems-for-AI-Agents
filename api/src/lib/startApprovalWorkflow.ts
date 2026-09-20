import {
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import type { AgentWallet, Transaction } from "./schema";

const sfn = new SFNClient({});

export interface ApprovalWorkflowInput {
  agentId: string;
  walletId: string;
  transactionId: string;
  timestamp: string;
  amount: number;
  recipient: string;
  type: string;
  purpose: string;
}

/**
 * Start the human-approval state machine for a PENDING_APPROVAL transaction.
 * No-ops when APPROVAL_STATE_MACHINE_ARN is unset (local/unit tests).
 */
export async function startApprovalWorkflow(
  agent: AgentWallet,
  txn: Transaction
): Promise<string | null> {
  const stateMachineArn = process.env.APPROVAL_STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    console.warn(
      "[approval] APPROVAL_STATE_MACHINE_ARN unset; skipping Step Functions start"
    );
    return null;
  }

  const input: ApprovalWorkflowInput = {
    agentId: agent.agentId,
    walletId: agent.walletId,
    transactionId: txn.txnId,
    timestamp: txn.timestamp,
    amount: txn.amount,
    recipient: txn.recipient,
    type: txn.type,
    purpose: txn.purpose,
  };

  const result = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn,
      name: `approve-${txn.txnId}`.slice(0, 80),
      input: JSON.stringify(input),
    })
  );

  return result.executionArn ?? null;
}
