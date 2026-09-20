import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../../lib/auth";
import {
  cognitoRedirectUri,
  exchangeCodeForTokens,
  fetchCognitoConfig,
} from "../../../../lib/cognito";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

/**
 * POST /api/auth/cognito
 * Body: { code, codeVerifier, redirectUri?, state? }
 * Exchanges Cognito auth code → id_token → LimitX session cookie.
 */
export async function POST(req: Request) {
  let body: {
    code?: string;
    codeVerifier?: string;
    redirectUri?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const code = body.code?.trim();
  const codeVerifier = body.codeVerifier?.trim();
  if (!code || !codeVerifier) {
    return NextResponse.json(
      { message: "code and codeVerifier are required" },
      { status: 400 }
    );
  }

  const cfg = await fetchCognitoConfig();
  if (!cfg?.enabled || !cfg.hostedUiBase || !cfg.clientId) {
    return NextResponse.json(
      {
        message:
          "Cognito is not configured. Deploy the SAM stack and set NEXT_PUBLIC_COGNITO_* on Amplify.",
      },
      { status: 503 }
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri =
    body.redirectUri?.trim() || cognitoRedirectUri(origin);

  const tokens = await exchangeCodeForTokens({
    hostedUiBase: cfg.hostedUiBase,
    clientId: cfg.clientId,
    redirectUri,
    code,
    codeVerifier,
  });

  if (!tokens.id_token) {
    return NextResponse.json(
      {
        message:
          tokens.error_description ||
          tokens.error ||
          "Cognito token exchange failed",
      },
      { status: 401 }
    );
  }

  const res = await fetch(`${API_BASE}/auth/cognito/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: tokens.id_token }),
  });
  const text = await res.text();
  let data: { token?: string; message?: string } = {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    data = {};
  }

  if (!res.ok || !data.token) {
    return new NextResponse(text || JSON.stringify({ message: "Exchange failed" }), {
      status: res.status || 401,
      headers: { "content-type": "application/json" },
    });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, data.token, sessionCookieOptions());

  return NextResponse.json(JSON.parse(text));
}
