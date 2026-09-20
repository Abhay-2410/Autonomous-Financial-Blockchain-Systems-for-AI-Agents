/**
 * Cognito bridge for LimitX:
 *   GET  /auth/cognito/config   — public Hosted UI settings
 *   POST /auth/cognito/exchange — { idToken } → LimitX session JWT + provision wallet
 *
 * Phone OTP auth is unchanged; this only adds an alternate identity path.
 */

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { cognitoPublicConfig, verifyCognitoIdToken } from "../lib/cognito";
import { json } from "../lib/http";
import { getOrCreateUserFromCognito } from "../lib/provisionUser";
import { signSession } from "../lib/session";

function parseBody(raw: string | undefined): { idToken?: string } {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { idToken?: string };
  } catch {
    return {};
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = (
    event.requestContext as { http?: { method?: string } } | undefined
  )?.http?.method;
  const legacyMethod = (event as { httpMethod?: string }).httpMethod;
  const httpMethod = (method ?? legacyMethod ?? "GET").toUpperCase();

  if (httpMethod === "GET") {
    const cfg = cognitoPublicConfig();
    return json(200, {
      ...cfg,
      // Amplify / local dashboard build Hosted UI URLs from these.
      authorizePath: "/oauth2/authorize",
      logoutPath: "/logout",
      scopes: "openid email profile",
    });
  }

  if (httpMethod !== "POST") {
    return json(405, { message: "Method not allowed" });
  }

  const cfg = cognitoPublicConfig();
  if (!cfg.enabled) {
    return json(503, {
      message:
        "Cognito is not configured on this API. Redeploy the SAM stack with the Cognito resources.",
    });
  }

  const body = parseBody(event.body);
  const idToken = body.idToken?.trim();
  if (!idToken) {
    return json(400, { message: "idToken is required" });
  }

  const claims = await verifyCognitoIdToken(idToken);
  if (!claims) {
    return json(401, { message: "Invalid or expired Cognito ID token" });
  }

  const email =
    claims.email?.trim() ||
    claims["cognito:username"]?.trim() ||
    `${claims.sub}@cognito.local`;

  const { user, isNew } = await getOrCreateUserFromCognito({
    cognitoSub: claims.sub,
    email,
  });

  const token = signSession({
    userId: user.userId,
    phone: user.phone,
    walletId: user.walletId,
  });

  return json(200, {
    token,
    isNew,
    user: {
      userId: user.userId,
      phone: user.phone,
      email: user.email ?? email,
      walletId: user.walletId,
      displayName: user.displayName ?? email,
      authProvider: user.authProvider ?? "cognito",
    },
  });
};
