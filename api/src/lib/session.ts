/**
 * Compact HS256 session JWTs for phone-authenticated owners.
 * No external deps — Node crypto only.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionClaims {
  sub: string; // userId
  phone: string;
  walletId: string;
  iat: number;
  exp: number;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ??
    process.env.OWNER_API_KEY ??
    "limitx-dev-session-secret"
  );
}

export function sessionTtlSeconds(): number {
  const n = Number(process.env.SESSION_TTL_SECONDS ?? String(60 * 60 * 24 * 30));
  return Number.isFinite(n) && n > 60 ? n : 60 * 60 * 24 * 30;
}

export function signSession(input: {
  userId: string;
  phone: string;
  walletId: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: input.userId,
    phone: input.phone,
    walletId: input.walletId,
    iat: now,
    exp: now + (input.ttlSeconds ?? sessionTtlSeconds()),
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", sessionSecret()).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

export function verifySession(token: string): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const expected = createHmac("sha256", sessionSecret()).update(data).digest();
  let presented: Buffer;
  try {
    presented = fromB64url(sig);
  } catch {
    return null;
  }
  if (
    expected.length !== presented.length ||
    !timingSafeEqual(expected, presented)
  ) {
    return null;
  }
  try {
    const claims = JSON.parse(fromB64url(payload).toString("utf8")) as SessionClaims;
    if (
      typeof claims.sub !== "string" ||
      typeof claims.phone !== "string" ||
      typeof claims.walletId !== "string" ||
      typeof claims.exp !== "number"
    ) {
      return null;
    }
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function extractBearer(
  headers?: Record<string, string | undefined>
): string | undefined {
  if (!headers) return undefined;
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const auth = lower["authorization"];
  if (!auth) return undefined;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}
