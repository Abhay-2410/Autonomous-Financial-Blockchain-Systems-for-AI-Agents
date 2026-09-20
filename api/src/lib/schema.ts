/**
 * Single-table DynamoDB schema for agent-wallet.
 *
 * Table keys: pk (HASH), sk (RANGE)
 *
 * Access patterns:
 *   ParentWallet  PK=WALLET#<walletId>   SK=META
 *   AgentWallet   PK=WALLET#<walletId>   SK=AGENT#<agentId>
 *   Policy        PK=AGENT#<agentId>     SK=POLICY#<version>
 *   Transaction   PK=AGENT#<agentId>     SK=TXN#<timestamp>#<txnId>
 *   AuditEvent    PK=AGENT#<agentId>     SK=AUDIT#<timestamp>
 */

export type AgentStatus = "ACTIVE" | "REVOKED";
export type TransactionStatus =
  | "ALLOWED"
  | "DENIED"
  | "PENDING"
  | "PENDING_APPROVAL"
  | "SIGNED"
  | "SUBMITTED"
  | "CONFIRMED";

export type EntityType =
  | "ParentWallet"
  | "AgentWallet"
  | "Policy"
  | "Transaction"
  | "AuditEvent";

/** Base item shape stored in DynamoDB. */
export interface DynamoKeys {
  pk: string;
  sk: string;
}

export interface ParentWallet extends DynamoKeys {
  entityType: "ParentWallet";
  walletId: string;
  orgName: string;
  createdAt: string; // ISO-8601
  /** Treasury balance shown in the payments home (demo units ≈ USD). */
  balance?: number;
  /** On-chain treasury address (demo identity). */
  address?: string;
  chainId?: number;
  tokenSymbol?: string;
  chainName?: string;
}

export interface AgentWallet extends DynamoKeys {
  entityType: "AgentWallet";
  walletId: string;
  agentId: string;
  name: string;
  status: AgentStatus;
  dailyLimit: number;
  perTransactionLimit: number;
  allowedMerchants: string[];
  spentToday: number;
  /** YYYY-MM-DD — used to reset spentToday each calendar day */
  spentTodayDate: string;
  /** Shared secret presented as x-api-key (auth check). */
  apiKey?: string;
  /** ISO-8601; if set and now >= value, wallet is expired. */
  walletExpiresAt?: string;
  /** Allowed transaction `type` values; default purchase/payment/transfer/refund. */
  permittedTransactionTypes?: string[];
  /** Total allocated balance for the period; defaults to dailyLimit. */
  allocatedBalance?: number;
  /** Agent prepaid card / on-chain address (demo identity). */
  address?: string;
  chainId?: number;
  tokenSymbol?: string;
  chainName?: string;
}

export interface Policy extends DynamoKeys {
  entityType: "Policy";
  agentId: string;
  version: string;
  /** Cedar policy text */
  cedarPolicy: string;
  effectiveFrom: string; // ISO-8601
  effectiveTo?: string; // ISO-8601; omit = open-ended
}

export interface Transaction extends DynamoKeys {
  entityType: "Transaction";
  agentId: string;
  txnId: string;
  amount: number;
  recipient: string;
  type: string;
  purpose: string;
  timestamp: string; // ISO-8601
  status: TransactionStatus;
  reason: string;
  /** Structured authorization reasons from authorizeTransaction. */
  reasons?: string[];
  metadata?: Record<string, unknown>;
  /** Base64 KMS ECDSA signature (set by signTransaction). */
  signature?: string;
  /** ISO-8601 when KMS signed the transaction. */
  signedAt?: string;
  signingAlgorithm?: string;
  /** Network tx hash after confirmation (stub looks like EVM 0x…). */
  txHash?: string;
  confirmedAt?: string;
  chainId?: number;
  fromAddress?: string;
  toAddress?: string;
  explorerUrl?: string;
  tokenSymbol?: string;
  /** Step Functions waitForTaskToken token (human approval). */
  approvalTaskToken?: string;
  approvalExecutionArn?: string;
}

export interface AuditEvent extends DynamoKeys {
  entityType: "AuditEvent";
  agentId: string;
  timestamp: string; // ISO-8601
  eventType: string;
  details: Record<string, unknown>;
}

export type AgentWalletItem =
  | ParentWallet
  | AgentWallet
  | Policy
  | Transaction
  | AuditEvent;

// --- Key builders ---

export const Keys = {
  parentWallet: (walletId: string): DynamoKeys => ({
    pk: `WALLET#${walletId}`,
    sk: "META",
  }),

  agentWallet: (walletId: string, agentId: string): DynamoKeys => ({
    pk: `WALLET#${walletId}`,
    sk: `AGENT#${agentId}`,
  }),

  policy: (agentId: string, version: string): DynamoKeys => ({
    pk: `AGENT#${agentId}`,
    sk: `POLICY#${version}`,
  }),

  transaction: (
    agentId: string,
    timestamp: string,
    txnId: string
  ): DynamoKeys => ({
    pk: `AGENT#${agentId}`,
    sk: `TXN#${timestamp}#${txnId}`,
  }),

  auditEvent: (agentId: string, timestamp: string): DynamoKeys => ({
    pk: `AGENT#${agentId}`,
    sk: `AUDIT#${timestamp}`,
  }),
} as const;

/** Prefixes for Query begins_with */
export const SkPrefix = {
  agent: "AGENT#",
  policy: "POLICY#",
  transaction: "TXN#",
  audit: "AUDIT#",
} as const;

// --- Factory helpers (build full items with keys) ---

export function buildParentWallet(
  input: Omit<ParentWallet, "pk" | "sk" | "entityType">
): ParentWallet {
  return {
    ...Keys.parentWallet(input.walletId),
    entityType: "ParentWallet",
    ...input,
  };
}

export function buildAgentWallet(
  input: Omit<AgentWallet, "pk" | "sk" | "entityType">
): AgentWallet {
  return {
    ...Keys.agentWallet(input.walletId, input.agentId),
    entityType: "AgentWallet",
    ...input,
  };
}

export function buildPolicy(
  input: Omit<Policy, "pk" | "sk" | "entityType">
): Policy {
  return {
    ...Keys.policy(input.agentId, input.version),
    entityType: "Policy",
    ...input,
  };
}

export function buildTransaction(
  input: Omit<Transaction, "pk" | "sk" | "entityType">
): Transaction {
  return {
    ...Keys.transaction(input.agentId, input.timestamp, input.txnId),
    entityType: "Transaction",
    ...input,
  };
}

export function buildAuditEvent(
  input: Omit<AuditEvent, "pk" | "sk" | "entityType">
): AuditEvent {
  return {
    ...Keys.auditEvent(input.agentId, input.timestamp),
    entityType: "AuditEvent",
    ...input,
  };
}
