/**
 * Browser client for LimitX Pay API Gateway + local Next proxies.
 */

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  absolute = false
): Promise<T> {
  const url = absolute || path.startsWith("/api/")
    ? path
    : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }

  return data as T;
}

export type AgentStatus = "ACTIVE" | "REVOKED";

export interface AgentWallet {
  agentId: string;
  walletId: string;
  name: string;
  status: AgentStatus;
  dailyLimit: number;
  perTransactionLimit: number;
  allowedMerchants: string[];
  spentToday: number;
  spentTodayDate?: string;
  allocatedBalance?: number;
  address?: string;
  chainId?: number;
  tokenSymbol?: string;
  chainName?: string;
}

export interface HomeSummary {
  orgName: string;
  walletId: string;
  treasury: {
    balance: number;
    address: string;
    explorerUrl: string;
    chainId: number;
    chainName: string;
    tokenSymbol: string;
    settlementMode: string;
  };
  totals: {
    agentCount: number;
    activeAgents: number;
    allocated: number;
    spentToday: number;
    pendingApprovals: number;
  };
  agents: Array<{
    agentId: string;
    name: string;
    status: AgentStatus;
    spentToday: number;
    dailyLimit: number;
    address?: string;
    tokenSymbol?: string;
  }>;
}

export interface Merchant {
  id: string;
  name: string;
  category: string;
  address: string;
  stellarAddress?: string;
  chainId: number;
  tokenSymbol: string;
  url?: string;
}

export interface PayResult {
  transactionId: string;
  decision: string;
  reasons: string[];
  failedCheck?: number;
  approvalExecutionArn?: string | null;
  settlementRail?: "chain" | "prava" | "stellar";
  status?: string;
  pravaCheckout?: {
    configured: boolean;
    sessionId?: string;
    orderId?: string | null;
    iframeUrl?: string;
    expiresAt?: string;
    message?: string;
  } | null;
}

export interface PravaStatusResult {
  configured: boolean;
  transactionId: string;
  agentId?: string | null;
  limitxStatus?: string | null;
  pravaLocalStatus?: string | null;
  iframeUrl?: string | null;
  prava?: {
    sessionId: string;
    orderId: string | null;
    status: string;
    merchantStatus: string | null;
    hasCredentials: boolean;
    error: { code: string; message: string } | null;
  };
  message?: string;
}

export interface PendingApproval {
  transactionId: string;
  agentId: string;
  amount: number;
  recipient: string;
  type: string;
  purpose: string;
  timestamp: string;
  status: string;
  reasons: string[];
  hasTaskToken: boolean;
}

export interface AuditItem {
  agentId: string;
  timestamp: string;
  eventType: string;
  details: Record<string, unknown>;
  sk: string;
}

export interface PolicyResponse {
  agentId: string;
  cedarPolicy: string;
  source: string;
  wallet: {
    name: string;
    status: AgentStatus;
    dailyLimit: number;
    perTransactionLimit: number;
    allowedMerchants: string[];
    spentToday: number;
    spentTodayDate?: string;
  } | null;
}

export function getApiBase(): string {
  return API_BASE;
}

export function getHome() {
  return request<HomeSummary>("/api/home");
}

export function listMerchants() {
  return request<{ merchants: Merchant[]; count: number }>("/merchants");
}

export function listWallets() {
  return request<{ wallets: AgentWallet[]; count: number }>("/api/wallets");
}

export function patchWallet(
  agentId: string,
  body: {
    status?: AgentStatus;
    dailyLimit?: number;
    perTransactionLimit?: number;
    allowedMerchants?: string[];
  }
) {
  return request<{ wallet: AgentWallet }>(
    `/wallets/${encodeURIComponent(agentId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export function topUpWallet(agentId: string, amount: number) {
  return request<{
    treasuryBalance: number;
    wallet: AgentWallet;
    toppedUp: number;
  }>("/api/topup", {
    method: "POST",
    body: JSON.stringify({ agentId, amount }),
  });
}

export function payAsOwner(body: {
  agentId: string;
  amount: number;
  recipient: string;
  type: string;
  purpose: string;
  timestamp: string;
  settlementRail?: "chain" | "prava" | "stellar";
}) {
  return request<PayResult>("/api/pay", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getPravaStatus(transactionId: string) {
  return request<PravaStatusResult>(
    `/api/prava/status?transactionId=${encodeURIComponent(transactionId)}`
  );
}

export function completePravaCheckout(transactionId: string) {
  return request<{
    transactionId: string;
    status: string;
    settlementRail: string;
    confirmedAt: string;
  }>("/api/prava/complete", {
    method: "POST",
    body: JSON.stringify({ transactionId }),
  });
}

export function getPolicy(agentId: string) {
  return request<PolicyResponse>(`/policies/${encodeURIComponent(agentId)}`);
}

export function listPendingApprovals() {
  return request<{ pending: PendingApproval[]; count: number }>(
    "/approvals/pending"
  );
}

export function approveTransaction(transactionId: string) {
  return request<{ transactionId: string; decision: string }>(
    `/approvals/${encodeURIComponent(transactionId)}/approve`,
    { method: "POST", body: "{}" }
  );
}

export function rejectTransaction(transactionId: string) {
  return request<{ transactionId: string; decision: string }>(
    `/approvals/${encodeURIComponent(transactionId)}/reject`,
    { method: "POST", body: "{}" }
  );
}

export function getAudit(params?: { agentId?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.agentId) q.set("agentId", params.agentId);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<{ items: AuditItem[]; count: number }>(
    `/audit${qs ? `?${qs}` : ""}`
  );
}

export function shortAddress(addr?: string): string {
  if (!addr) return "—";
  if (addr.startsWith("G") && addr.length >= 12) {
    return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  }
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
