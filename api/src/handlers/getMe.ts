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

  return json(200, {
    user: {
      userId: user.userId,
      phone: user.phone,
      email: user.email ?? null,
      authProvider: user.authProvider ?? (user.cognitoSub ? "cognito" : "phone"),
      walletId: user.walletId,
      displayName: user.displayName ?? user.email ?? user.phone,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
  });
};
