/**
 * Cognito Hosted UI helpers (PKCE) for the LimitX dashboard.
 */

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

export type CognitoConfig = {
  enabled: boolean;
  region: string;
  userPoolId: string;
  clientId: string;
  domain: string;
  hostedUiBase: string;
  scopes?: string;
};

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createPkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(random);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return { verifier, challenge: b64url(digest) };
}

export function cognitoRedirectUri(origin?: string): string {
  // Always prefer the current origin so authorize + token exchange match.
  // (A baked Amplify URL in env would break localhost logins.)
  if (origin) return `${origin.replace(/\/$/, "")}/login/cognito`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/login/cognito`;
  }
  const fromEnv = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  return "http://localhost:3000/login/cognito";
}

export async function fetchCognitoConfig(): Promise<CognitoConfig | null> {
  // Prefer build-time env (Amplify); fall back to API config after deploy.
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim() ?? "";
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN?.trim() ?? "";
  const region =
    process.env.NEXT_PUBLIC_COGNITO_REGION?.trim() ?? "eu-north-1";
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim() ?? "";

  if (clientId && domain) {
    return {
      enabled: true,
      region,
      userPoolId,
      clientId,
      domain,
      hostedUiBase: `https://${domain}.auth.${region}.amazoncognito.com`,
      scopes: "openid email profile",
    };
  }

  try {
    const res = await fetch(`${API_BASE}/auth/cognito/config`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CognitoConfig;
    return data.enabled ? data : null;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(input: {
  hostedUiBase: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string;
}): string {
  const u = new URL(`${input.hostedUiBase.replace(/\/$/, "")}/oauth2/authorize`);
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", input.scopes ?? "openid email profile");
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("state", input.state);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", input.codeChallenge);
  return u.toString();
}

export async function exchangeCodeForTokens(input: {
  hostedUiBase: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{ id_token?: string; error?: string; error_description?: string }> {
  const tokenUrl = `${input.hostedUiBase.replace(/\/$/, "")}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    return {
      error: data.error ?? "token_error",
      error_description: data.error_description ?? res.statusText,
    };
  }
  return data;
}
