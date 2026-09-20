/**
 * Cognito email/password auth for LimitX (no Hosted UI redirect).
 * POST { action: "signup" | "signin" | "confirm", email, password?, code? }
 */

import {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../../../lib/auth";
import { fetchCognitoConfig } from "../../../../../lib/cognito";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

const REGION =
  process.env.NEXT_PUBLIC_COGNITO_REGION?.trim() ||
  process.env.AWS_REGION ||
  "eu-north-1";

function cognitoClient() {
  return new CognitoIdentityProviderClient({ region: REGION });
}

async function setLimitXSession(idToken: string) {
  const res = await fetch(`${API_BASE}/auth/cognito/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const text = await res.text();
  let data: { token?: string; message?: string; isNew?: boolean; user?: unknown } =
    {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    data = {};
  }
  if (!res.ok || !data.token) {
    throw new Error(data.message || "Could not create LimitX session");
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, data.token, sessionCookieOptions());
  return data;
}

export async function POST(req: Request) {
  let body: {
    action?: string;
    email?: string;
    password?: string;
    code?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const action = (body.action ?? "").toLowerCase();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const code = (body.code ?? "").trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { message: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const cfg = await fetchCognitoConfig();
  if (!cfg?.enabled || !cfg.clientId) {
    return NextResponse.json(
      { message: "Cognito is not configured." },
      { status: 503 }
    );
  }

  const client = cognitoClient();

  try {
    if (action === "signup") {
      if (password.length < 8) {
        return NextResponse.json(
          { message: "Password must be at least 8 characters." },
          { status: 400 }
        );
      }
      await client.send(
        new SignUpCommand({
          ClientId: cfg.clientId,
          Username: email,
          Password: password,
          UserAttributes: [{ Name: "email", Value: email }],
        })
      );
      // Email must be verified before sign-in (no PreSignUp auto-confirm).
      return NextResponse.json({
        ok: true,
        needsConfirmation: true,
        message:
          "Account created. Enter the verification code we emailed you (check spam).",
      });
    }

    if (action === "resend") {
      await client.send(
        new ResendConfirmationCodeCommand({
          ClientId: cfg.clientId,
          Username: email,
        })
      );
      return NextResponse.json({
        ok: true,
        message: "Verification code sent. Check your email (and spam folder).",
      });
    }

    if (action === "confirm") {
      if (!code) {
        return NextResponse.json(
          { message: "Enter the verification code from your email." },
          { status: 400 }
        );
      }
      await client.send(
        new ConfirmSignUpCommand({
          ClientId: cfg.clientId,
          Username: email,
          ConfirmationCode: code,
        })
      );
      // If password provided, sign in immediately after confirm
      if (password.length >= 8) {
        const auth = await client.send(
          new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: cfg.clientId,
            AuthParameters: {
              USERNAME: email,
              PASSWORD: password,
            },
          })
        );
        const idToken = auth.AuthenticationResult?.IdToken;
        if (!idToken) {
          return NextResponse.json({
            ok: true,
            confirmed: true,
            message: "Email verified. Sign in with your password.",
          });
        }
        const session = await setLimitXSession(idToken);
        return NextResponse.json({
          ok: true,
          confirmed: true,
          signedIn: true,
          ...session,
        });
      }
      return NextResponse.json({
        ok: true,
        confirmed: true,
        message: "Email verified. You can sign in now.",
      });
    }

    if (action === "signin") {
      if (!password) {
        return NextResponse.json(
          { message: "Enter your password." },
          { status: 400 }
        );
      }
      const auth = await client.send(
        new InitiateAuthCommand({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: cfg.clientId,
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
          },
        })
      );
      const idToken = auth.AuthenticationResult?.IdToken;
      if (!idToken) {
        return NextResponse.json(
          { message: "Sign-in did not return a token. Try again." },
          { status: 401 }
        );
      }
      const session = await setLimitXSession(idToken);
      return NextResponse.json({ ok: true, signedIn: true, ...session });
    }

    return NextResponse.json(
      { message: "action must be signup, signin, confirm, or resend" },
      { status: 400 }
    );
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    const raw = err instanceof Error ? err.message : String(err);
    let message = raw;
    if (name === "UsernameExistsException") {
      message = "An account with this email already exists. Sign in instead.";
    } else if (name === "UserNotConfirmedException") {
      message = "Confirm your email first — enter the verification code we sent.";
      return NextResponse.json(
        { message, needsConfirmation: true },
        { status: 403 }
      );
    } else if (name === "NotAuthorizedException") {
      message = "Incorrect email or password.";
    } else if (name === "CodeMismatchException") {
      message = "Wrong verification code. Check your email and try again.";
    } else if (name === "InvalidPasswordException") {
      message =
        "Password must be at least 8 characters and include a letter and a number.";
    } else if (name === "UserNotFoundException") {
      message = "No account with that email. Create one below.";
    }
    return NextResponse.json({ message }, { status: 400 });
  }
}
