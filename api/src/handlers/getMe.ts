/**
 * GET /auth/me — current authenticated owner (phone or Cognito).
 */

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getItem } from "../lib/dynamo";
import { json } from "../lib/http";
import { requireSession } from "../lib/authContext";
import { Keys, type User } from "../lib/schema";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const session = requireSession(event);
  if (!session) {
    return json(401, { message: "Sign in to continue." });
  }

  const user = await getItem<User>(Keys.user(session.sub));
  if (!user || user.entityType !== "User") {
    return json(401, { message: "Session invalid. Sign in again." });
  }

  const phoneIsCognitoKey = user.phone.startsWith("cognito:");
  const looksLikeEmail = (v: string | undefined): v is string =>
    Boolean(v && v.includes("@") && !v.startsWith("cognito:"));
  const looksLikeUuid = (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v
    );

  const displayName =
    (user.displayName &&
    !user.displayName.startsWith("cognito:") &&
    !looksLikeUuid(user.displayName)
      ? user.displayName
      : null) ??
    (looksLikeEmail(user.email) ? user.email : null) ??
    (phoneIsCognitoKey ? null : user.phone) ??
    user.userId;

  return json(200, {
    user: {
      userId: user.userId,
      phone: user.phone,
      email: looksLikeEmail(user.email) ? user.email : null,
      emailVerified: user.emailVerified ?? null,
      authProvider: user.authProvider ?? (user.cognitoSub ? "cognito" : "phone"),
      walletId: user.walletId,
      /** Prefer email for Cognito; never expose cognito:<sub> / UUID as the label. */
      displayName,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
  });
};
