import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import type { AgentWallet } from "./schema";

const eb = new EventBridgeClient({});

export const EVENT_SOURCE = "agent-wallet";

export type AgentWalletDetailType =
  | "TRANSACTION_DENIED"
  | "TRANSACTION_ALLOWED";

export interface TransactionAlertDetail {
  agentId: string;
  amount: number;
  recipient?: string;
  dailyLimit: number;
  spentToday: number;
  remainingDailyBudget: number;
  /** amount > 0.8 * remainingDailyBudget */
  exceedsEightyPercentRemaining: boolean;
  reasons?: string[];
  txnId?: string;
  decision?: string;
}

/** True when the spend would consume more than 80% of what's left today. */
export function exceedsEightyPercentRemaining(
  amount: number,
  dailyLimit: number,
  spentToday: number
): boolean {
  const remaining = Math.max(0, dailyLimit - spentToday);
  if (remaining === 0) return amount > 0;
  return amount > remaining * 0.8;
}

/**
 * PutEvents to the default bus. No-ops / swallows errors when offline (local tests).
 */
export async function putAgentWalletEvent(
  detailType: AgentWalletDetailType,
  detail: TransactionAlertDetail
): Promise<void> {
  try {
    await eb.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: EVENT_SOURCE,
            DetailType: detailType,
            Detail: JSON.stringify(detail),
            EventBusName: process.env.EVENT_BUS_NAME ?? "default",
          },
        ],
      })
    );
  } catch (err) {
    console.warn("[events] PutEvents failed (non-fatal)", err);
  }
}

export async function emitTransactionDenied(
  agent: AgentWallet,
  amount: number,
  recipient: string | undefined,
  reasons: string[]
): Promise<void> {
  const remainingDailyBudget = Math.max(0, agent.dailyLimit - agent.spentToday);
  const flag = exceedsEightyPercentRemaining(
    amount,
    agent.dailyLimit,
    agent.spentToday
  );
  if (!flag) return;

  await putAgentWalletEvent("TRANSACTION_DENIED", {
    agentId: agent.agentId,
    amount,
    recipient,
    dailyLimit: agent.dailyLimit,
    spentToday: agent.spentToday,
    remainingDailyBudget,
    exceedsEightyPercentRemaining: true,
    reasons,
    decision: "DENIED",
  });
}

export async function emitTransactionAllowed(
  agent: AgentWallet,
  amount: number,
  recipient: string,
  txnId: string,
  spentTodayBefore: number
): Promise<void> {
  const remainingDailyBudget = Math.max(
    0,
    agent.dailyLimit - spentTodayBefore
  );
  const flag = exceedsEightyPercentRemaining(
    amount,
    agent.dailyLimit,
    spentTodayBefore
  );
  if (!flag) return;

  await putAgentWalletEvent("TRANSACTION_ALLOWED", {
    agentId: agent.agentId,
    amount,
    recipient,
    dailyLimit: agent.dailyLimit,
    spentToday: spentTodayBefore,
    remainingDailyBudget,
    exceedsEightyPercentRemaining: true,
    txnId,
    decision: "ALLOWED",
  });
}
