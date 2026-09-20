/**
 * Resolve the signed-in LimitX owner from Authorization: Bearer <session>.
 * Also accepts legacy x-owner-key for server-side Next proxies during migration.
 */

import type { SessionClaims } from "./session";
import { extractBearer, verifySession } from "./session";

export interface OwnerAuth {
  kind: "session" | "owner-key";
  userId?: string;
  phone?: string;
  walletId: string;
}

function headerMap(
  headers?: Record<string, string | undefined>
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
}

export function resolveOwnerAuth(event: {
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
}): OwnerAuth | null {
  const headers = headerMap(event.headers);
  const bearer = extractBearer(headers);
  if (bearer) {
    const claims = verifySession(bearer);
    if (claims) {
      return {
        kind: "session",
        userId: claims.sub,
        phone: claims.phone,
        walletId: claims.walletId,
      };
    }
  }

  const ownerKey = headers["x-owner-key"];
  const expected = process.env.OWNER_API_KEY;
  if (expected && ownerKey && ownerKey === expected) {
    const walletId =
      event.queryStringParameters?.walletId ??
      process.env.WALLET_ID ??
      "org-limitx";
    return { kind: "owner-key", walletId };
  }

  return null;
}

export function requireSession(event: {
  headers?: Record<string, string | undefined>;
}): SessionClaims | null {
  const bearer = extractBearer(headerMap(event.headers));
  if (!bearer) return null;
  return verifySession(bearer);
}
