/**
 * Prava Payments REST client (sandbox/prod).
 * Docs: https://docs.prava.space/
 *
 * LimitX uses Prava as the *fiat card rail* after policy ALLOW + KMS sign:
 * create session → owner completes hosted passkey checkout → we poll + report.
 * Card PANs / network tokens never touch the dashboard browser.
 */

export interface PravaConfig {
  apiBase: string;
  secretKey: string;
  ownerEmail: string;
  callbackBase: string;
}

export interface PravaSession {
  session_id: string;
  session_token: string;
  iframe_url: string;
  order_id: string | null;
  expires_at: string;
}

export interface PravaPaymentResult {
  session_id: string;
  order_id: string | null;
  status: "pending" | "processing" | "awaiting_result" | "completed" | "failed";
  transactions: Array<{
    txn_id: string;
    card_id: string | null;
    status: string;
    line_items?: Array<{
      txn_ref_id: string;
      merchant_name?: string | null;
      total_amount?: string;
      status?: string;
      token?: string | null;
      dynamic_cvv?: string | null;
      expiry_month?: string | null;
      expiry_year?: string | null;
    }>;
  }>;
  error?: { code: string; message: string };
  merchant_res?: { status: string; orderId?: string };
}

export class PravaError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "PravaError";
  }
}

export function getPravaConfig(): PravaConfig | null {
  const secretKey = (process.env.PRAVA_SECRET_KEY ?? "").trim();
  if (!secretKey) return null;
  return {
    apiBase: (
      process.env.PRAVA_API_BASE ?? "https://sandbox.api.prava.space"
    ).replace(/\/$/, ""),
    secretKey,
    ownerEmail:
      process.env.PRAVA_OWNER_EMAIL ?? "owner@limitx.demo",
    callbackBase: (
      process.env.PRAVA_CALLBACK_BASE ??
      process.env.DASHBOARD_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, ""),
  };
}

export function isPravaConfigured(): boolean {
  return getPravaConfig() !== null;
}

async function pravaFetch<T>(
  cfg: PravaConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.secretKey}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    const errObj =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { code?: string; message?: string } }).error
        : undefined;
    throw new PravaError(
      res.status,
      errObj?.code ?? `HTTP_${res.status}`,
      errObj?.message ?? `Prava request failed (${res.status})`
    );
  }
  return body as T;
}

export interface CreatePravaSessionInput {
  userId: string;
  amount: number;
  currency?: string;
  merchantName: string;
  merchantUrl: string;
  productDescription: string;
  /** LimitX transaction id — echoed in callback query */
  limitxTxnId: string;
  countryCode?: string;
}

export async function createPravaSession(
  input: CreatePravaSessionInput
): Promise<PravaSession> {
  const cfg = getPravaConfig();
  if (!cfg) {
    throw new PravaError(503, "PRAVA_NOT_CONFIGURED", "PRAVA_SECRET_KEY is not set");
  }

  const amount = input.amount.toFixed(2);
  const useHttpsCallback = cfg.callbackBase.startsWith("https://");
  const callback = `${cfg.callbackBase}/pay/prava-return?txnId=${encodeURIComponent(
    input.limitxTxnId
  )}`;

  const body: Record<string, unknown> = {
    user_id: input.userId.slice(0, 255),
    user_email: cfg.ownerEmail,
    total_amount: amount,
    currency: input.currency ?? "USD",
    integration_type: "full_checkout",
    external_order_id: input.limitxTxnId.slice(0, 255),
    description: `LimitX agent payment: ${input.productDescription}`.slice(
      0,
      500
    ),
    purchase_context: {
      custom: [
        {
          merchant_details: {
            name: sanitizeMerchantName(input.merchantName),
            url: ensureHttpsUrl(input.merchantUrl),
            country_code_iso2: input.countryCode ?? "US",
            category: "Shopping",
          },
          product_details: [
            {
              description: input.productDescription.slice(0, 200),
              unit_price: amount,
              quantity: 1,
            },
          ],
        },
      ],
    },
  };
  if (useHttpsCallback) {
    body.callback_url = callback;
  }

  return pravaFetch<PravaSession>(cfg, "/v1/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getPravaPaymentResult(
  sessionId: string
): Promise<PravaPaymentResult> {
  const cfg = getPravaConfig();
  if (!cfg) {
    throw new PravaError(503, "PRAVA_NOT_CONFIGURED", "PRAVA_SECRET_KEY is not set");
  }
  return pravaFetch<PravaPaymentResult>(
    cfg,
    `/v1/sessions/${encodeURIComponent(sessionId)}/payment-result`
  );
}

export async function reportPravaStatus(
  sessionId: string,
  txnRefId: string,
  txnStatus: "APPROVED" | "DECLINED"
): Promise<{ status: string; txn_status: string }> {
  const cfg = getPravaConfig();
  if (!cfg) {
    throw new PravaError(503, "PRAVA_NOT_CONFIGURED", "PRAVA_SECRET_KEY is not set");
  }
  return pravaFetch(cfg, `/v1/sessions/${encodeURIComponent(sessionId)}/report-status`, {
    method: "POST",
    body: JSON.stringify({
      txn_ref_id: txnRefId,
      txn_status: txnStatus,
      txn_type: "PURCHASE",
      authorization_code: "LIMITX",
      response_code: txnStatus === "APPROVED" ? "00" : "05",
    }),
  });
}

/** Public-safe summary — never includes network token / CVV. */
export function publicPravaStatus(result: PravaPaymentResult) {
  const line = result.transactions[0]?.line_items?.[0];
  return {
    sessionId: result.session_id,
    orderId: result.order_id,
    status: result.status,
    merchantStatus: result.merchant_res?.status ?? null,
    merchantOrderId: result.merchant_res?.orderId ?? null,
    hasCredentials: Boolean(line?.token && line?.dynamic_cvv),
    txnRefId: line?.txn_ref_id ?? null,
    error: result.error ?? null,
  };
}

function sanitizeMerchantName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ._-]/g, "").trim();
  return (cleaned || "LimitX Merchant").slice(0, 100);
}

function ensureHttpsUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith("https://")) return u;
  if (u.startsWith("http://")) return `https://${u.slice("http://".length)}`;
  return `https://${u}`;
}
