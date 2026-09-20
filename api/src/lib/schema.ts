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
 *   User          PK=USER#<userId>       SK=META
 *   PhoneIndex    PK=PHONE#<e164>        SK=USER
 *   CognitoIndex  PK=COGNITO#<sub>       SK=USER
 *   PhoneOtp      PK=OTP#<e164>          SK=CODE   (TTL via expiresAt)
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
  | "AuditEvent"
  | "User"
  | "PhoneIndex"
  | "CognitoIndex"
  | "PhoneOtp";

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
  /** On-chain treasury address (Stellar G… or demo 0x…). */
  address?: string;
  /** AES-GCM sealed Stellar secret (S…) for custodial signing. */
  stellarSecretEnc?: string;
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
  /** USD-equivalent daily soft ceiling (same unit as Transaction.amount). */
  dailyLimit: number;
  /** USD-equivalent per-txn soft ceiling. */
  perTransactionLimit: number;
  allowedMerchants: string[];
  /** USD-equivalent spent so far today (reset via spentTodayDate). */
  spentToday: number;
  /** YYYY-MM-DD — used to reset spentToday each calendar day */
  spentTodayDate: string;
  /** Shared secret presented as x-api-key (auth check). */
  apiKey?: string;
  /** ISO-8601; if set and now >= value, wallet is expired. */
  walletExpiresAt?: string;
  /** Allowed transaction `type` values; default purchase/payment/transfer/refund. */
  permittedTransactionTypes?: string[];
  /** Total allocated balance for the period (USD-equivalent); defaults to dailyLimit. */
  allocatedBalance?: number;
  /** Agent prepaid card / Stellar G… or demo 0x address. */
  address?: string;
  /** AES-GCM sealed Stellar secret (S…) for custodial signing. */
  stellarSecretEnc?: string;
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
  /**
   * USD-equivalent amount (plain number). Same unit as dailyLimit /
   * spentToday / Cedar checks. Converted to XLM only at Stellar settlement.
   */
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
  /** Settlement path: on-chain stub vs Prava card rail. */
  settlementRail?: "chain" | "prava" | "stellar";
  pravaSessionId?: string;
  pravaOrderId?: string | null;
  pravaIframeUrl?: string;
  pravaStatus?: string;
  pravaExpiresAt?: string;
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

/** Phone- or Cognito-authenticated LimitX account (payments-app style). */
export interface User extends DynamoKeys {
  entityType: "User";
  userId: string;
  /**
   * Internal identity key for session JWTs:
   * E.164 for phone auth, or `cognito:<sub>` for Cognito-only accounts.
   * Never show this in the UI — use email / displayName instead.
   */
  phone: string;
  /** Cognito email (or linked email). Preferred UI identity. */
  email?: string;
  /** From Cognito ID token `email_verified` claim. */
  emailVerified?: boolean;
  cognitoSub?: string;
  authProvider?: "phone" | "cognito";
  walletId: string;
  displayName?: string;
  createdAt: string;
  lastLoginAt?: string;
}

/** Reverse lookup phone → userId (one row per phone). */
export interface PhoneIndex extends DynamoKeys {
  entityType: "PhoneIndex";
  phone: string;
  userId: string;
}

/** Reverse lookup Cognito sub → userId. */
export interface CognitoIndex extends DynamoKeys {
  entityType: "CognitoIndex";
  cognitoSub: string;
  userId: string;
}

/** Short-lived SMS/dev OTP. DynamoDB TTL on expiresAt (epoch seconds). */
export interface PhoneOtp extends DynamoKeys {
  entityType: "PhoneOtp";
  phone: string;
  codeHash: string;
  attempts: number;
  createdAt: string;
  /** Epoch seconds — DynamoDB TTL attribute */
  expiresAt: number;
}

export type AgentWalletItem =
  | ParentWallet
  | AgentWallet
  | Policy
  | Transaction
  | AuditEvent
  | User
  | PhoneIndex
  | CognitoIndex
  | PhoneOtp;

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

  user: (userId: string): DynamoKeys => ({
    pk: `USER#${userId}`,
    sk: "META",
  }),

  phoneIndex: (phoneE164: string): DynamoKeys => ({
    pk: `PHONE#${phoneE164}`,
    sk: "USER",
  }),

  cognitoIndex: (cognitoSub: string): DynamoKeys => ({
    pk: `COGNITO#${cognitoSub}`,
    sk: "USER",
  }),

  phoneOtp: (phoneE164: string): DynamoKeys => ({
    pk: `OTP#${phoneE164}`,
    sk: "CODE",
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

export function buildUser(
  input: Omit<User, "pk" | "sk" | "entityType">
): User {
  return {
    ...Keys.user(input.userId),
    entityType: "User",
    ...input,
  };
}

export function buildPhoneIndex(
  input: Omit<PhoneIndex, "pk" | "sk" | "entityType">
): PhoneIndex {
  return {
    ...Keys.phoneIndex(input.phone),
    entityType: "PhoneIndex",
    ...input,
  };
}

export function buildCognitoIndex(
  input: Omit<CognitoIndex, "pk" | "sk" | "entityType">
): CognitoIndex {
  return {
    ...Keys.cognitoIndex(input.cognitoSub),
    entityType: "CognitoIndex",
    ...input,
  };
}

export function buildPhoneOtp(
  input: Omit<PhoneOtp, "pk" | "sk" | "entityType">
): PhoneOtp {
  return {
    ...Keys.phoneOtp(input.phone),
    entityType: "PhoneOtp",
    ...input,
  };
}
