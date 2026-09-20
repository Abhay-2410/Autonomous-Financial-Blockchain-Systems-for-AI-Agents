"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const VERIFIER_KEY = "limitx_cognito_verifier";
const STATE_KEY = "limitx_cognito_state";
const NEXT_KEY = "limitx_cognito_next";

export default function CognitoCallbackClient() {
  const search = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = search.get("error_description") || search.get("error");
    if (err) {
      setError(err);
      return;
    }

    const code = search.get("code");
    const state = search.get("state");
    if (!code) {
      setError("Missing authorization code from Cognito.");
      return;
    }

    const expectedState = sessionStorage.getItem(STATE_KEY);
    if (expectedState && state && expectedState !== state) {
      setError("Login state mismatch. Try again from the sign-in page.");
      return;
    }

    const codeVerifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!codeVerifier) {
      setError(
        "Missing PKCE verifier (open Cognito from the LimitX login page, not a bookmarked URL)."
      );
      return;
    }

    const nextPath = sessionStorage.getItem(NEXT_KEY) || "/";
    const redirectUri = `${window.location.origin}/login/cognito`;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/cognito", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, codeVerifier, redirectUri }),
        });
        const data = (await res.json()) as { message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? "Cognito sign-in failed");
        }
        sessionStorage.removeItem(VERIFIER_KEY);
        sessionStorage.removeItem(STATE_KEY);
        sessionStorage.removeItem(NEXT_KEY);
        if (!cancelled) {
          window.location.href = nextPath.startsWith("/") ? nextPath : "/";
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Cognito sign-in failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search, router]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-1 text-center">
      <div className="font-display text-3xl font-bold text-[#14201a]">LimitX</div>
      {error ? (
        <>
          <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
          <a href="/login" className="btn-secondary mt-6 inline-flex justify-center">
            Back to sign in
          </a>
        </>
      ) : (
        <p className="mt-4 text-sm text-[#5c6b63]">Finishing Cognito sign-in…</p>
      )}
    </div>
  );
}
