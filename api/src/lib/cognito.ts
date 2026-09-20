/**
 * Cognito ID-token verification + Hosted UI config for LimitX.
 */

import { CognitoJwtVerifier } from "aws-jwt-verify";

export interface CognitoIdClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  "cognito:username"?: string;
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function poolConfigured(): boolean {
  return Boolean(
    process.env.COGNITO_USER_POOL_ID?.trim() &&
      process.env.COGNITO_CLIENT_ID?.trim()
  );
}

function getVerifier() {
  if (!poolConfigured()) return null;
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID!.trim(),
      tokenUse: "id",
      clientId: process.env.COGNITO_CLIENT_ID!.trim(),
    });
  }
  return verifier;
}

export async function verifyCognitoIdToken(
  idToken: string
): Promise<CognitoIdClaims | null> {
  const v = getVerifier();
  if (!v) return null;
  try {
    const payload = await v.verify(idToken);
    const sub = String(payload.sub ?? "");
    if (!sub) return null;
    return {
      sub,
      email:
        typeof payload.email === "string" ? payload.email : undefined,
      email_verified: payload.email_verified as boolean | string | undefined,
      "cognito:username":
        typeof payload["cognito:username"] === "string"
          ? payload["cognito:username"]
          : undefined,
    };
  } catch {
    return null;
  }
}

export function cognitoPublicConfig(): {
  enabled: boolean;
  region: string;
  userPoolId: string;
  clientId: string;
  domain: string;
  hostedUiBase: string;
} {
  const region =
    process.env.COGNITO_REGION?.trim() ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "eu-north-1";
  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim() ?? "";
  const clientId = process.env.COGNITO_CLIENT_ID?.trim() ?? "";
  // Domain prefix is not in Lambda env by default — Hosted UI base can be passed
  // via COGNITO_DOMAIN (prefix only) when set after deploy.
  const domain = process.env.COGNITO_DOMAIN?.trim() ?? "";
  const hostedUiBase = domain
    ? `https://${domain}.auth.${region}.amazoncognito.com`
    : "";
  return {
    enabled: Boolean(userPoolId && clientId),
    region,
    userPoolId,
    clientId,
    domain,
    hostedUiBase,
  };
}
