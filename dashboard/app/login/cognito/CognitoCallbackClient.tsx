"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const VERIFIER_KEY = "limitx_cognito_verifier";
const STATE_KEY = "limitx_cognito_state";
const NEXT_KEY = "limitx_cognito_next";
/** Prevents double token exchange (React Strict Mode remounts). */
const EXCHANGE_LOCK_KEY = "limitx_cognito_exchange_lock";

export default function CognitoCallbackClient() {
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Finishing Cognito sign-in…");

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

    // Strict Mode mounts twice — only the first exchange may use the one-time code.
    const existingLock = sessionStorage.getItem(EXCHANGE_LOCK_KEY);
    if (existingLock === code) {
      setStatus("Sign-in already in progress…");
      return;
    }
    if (existingLock && existingLock.startsWith("done:")) {
      const nextPath = sessionStorage.getItem(NEXT_KEY) || "/";
      window.location.replace(nextPath.startsWith("/") ? nextPath : "/");
      return;
    }

    const codeVerifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!codeVerifier) {
      setError(
        "Missing PKCE verifier. Start again from the LimitX sign-in page (don’t refresh this callback URL)."
      );
      return;
    }

    sessionStorage.setItem(EXCHANGE_LOCK_KEY, code);

    const nextPath = sessionStorage.getItem(NEXT_KEY) || "/";
    // Must match the redirect_uri used on /oauth2/authorize exactly.
    const redirectUri = `${window.location.origin}/login/cognito`;

    void (async () => {
      try {
        const res = await fetch("/api/auth/cognito", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, codeVerifier, redirectUri }),
        });
        const data = (await res.json()) as { message?: string };
        if (!res.ok) {
          sessionStorage.removeItem(EXCHANGE_LOCK_KEY);
          throw new Error(data.message ?? "Cognito sign-in failed");
        }

        sessionStorage.setItem(EXCHANGE_LOCK_KEY, `done:${code}`);
        sessionStorage.removeItem(VERIFIER_KEY);
        sessionStorage.removeItem(STATE_KEY);

        const dest = nextPath.startsWith("/") ? nextPath : "/";
        sessionStorage.removeItem(NEXT_KEY);
        window.location.replace(dest);
      } catch (e) {
        sessionStorage.removeItem(EXCHANGE_LOCK_KEY);
        setError(e instanceof Error ? e.message : "Cognito sign-in failed");
      }
    })();
  }, [search]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-1 text-center">
      <div className="font-display text-3xl font-bold text-[#14201a]">LimitX</div>
      {error ? (
        <>
          <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
          <a
            href="/login"
            className="btn-secondary mt-6 inline-flex justify-center"
            onClick={() => {
              sessionStorage.removeItem(EXCHANGE_LOCK_KEY);
              sessionStorage.removeItem(VERIFIER_KEY);
              sessionStorage.removeItem(STATE_KEY);
            }}
          >
            Back to sign in
          </a>
        </>
      ) : (
        <p className="mt-4 text-sm text-[#5c6b63]">{status}</p>
      )}
    </div>
  );
}
