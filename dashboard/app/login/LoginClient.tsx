"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildAuthorizeUrl,
  createPkcePair,
  fetchCognitoConfig,
  type CognitoConfig,
} from "../../lib/cognito";

type Step = "phone" | "code";

const VERIFIER_KEY = "limitx_cognito_verifier";
const STATE_KEY = "limitx_cognito_state";
const NEXT_KEY = "limitx_cognito_next";

export default function LoginClient() {
  const search = useSearchParams();
  const nextPath = search.get("next") || "/";

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("91");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cognitoBusy, setCognitoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cognito, setCognito] = useState<CognitoConfig | null>(null);
  const [showPhone, setShowPhone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCognitoConfig().then((cfg) => {
      if (!cancelled) setCognito(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fullPhonePreview = useMemo(() => {
    const digits = phone.replace(/\D/g, "");
    return digits ? `+${countryCode}${digits}` : `+${countryCode}…`;
  }, [countryCode, phone]);

  async function onCognito() {
    setError(null);
    setCognitoBusy(true);
    try {
      const cfg = cognito ?? (await fetchCognitoConfig());
      if (!cfg?.enabled || !cfg.hostedUiBase || !cfg.clientId) {
        throw new Error(
          "Cognito is not ready yet. Check NEXT_PUBLIC_COGNITO_* in .env.local (see docs/AUTH_COGNITO.md)."
        );
      }
      const { verifier, challenge } = await createPkcePair();
      const state = btoa(
        String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      sessionStorage.setItem(VERIFIER_KEY, verifier);
      sessionStorage.setItem(STATE_KEY, state);
      sessionStorage.setItem(NEXT_KEY, nextPath);
      sessionStorage.removeItem("limitx_cognito_exchange_lock");
      const redirectUri = `${window.location.origin}/login/cognito`;
      const url = buildAuthorizeUrl({
        hostedUiBase: cfg.hostedUiBase,
        clientId: cfg.clientId,
        redirectUri,
        state,
        codeChallenge: challenge,
        scopes: cfg.scopes,
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Cognito");
      setCognitoBusy(false);
    }
  }

  async function onSendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDevCode(null);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, countryCode }),
      });
      const data = (await res.json()) as {
        message?: string;
        phoneMasked?: string;
        isNew?: boolean;
        devCode?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? "Could not send code");
      }
      setPhoneMasked(data.phoneMasked ?? fullPhonePreview);
      setIsNew(Boolean(data.isNew));
      setDevCode(data.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, countryCode, code }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Incorrect code");
      }
      window.location.href = nextPath;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[72vh] max-w-md flex-col justify-center">
      <div className="mb-8 text-center">
        <p className="font-display text-4xl font-bold tracking-tight text-[#14201a] sm:text-5xl">
          LimitX
        </p>
        <p className="mt-2 text-sm text-[#5c6b63]">
          Pay with AI agents — safely
        </p>
      </div>

      <div className="card space-y-6 p-6 sm:p-8">
        {!showPhone && step === "phone" ? (
          <>
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#14201a]">
                Sign in
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-[#5c6b63]">
                Create an account or sign in with email via Amazon Cognito.
                Anyone can join.
              </p>
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            )}

            <button
              type="button"
              className="btn-primary w-full py-3 text-base"
              disabled={cognitoBusy}
              onClick={onCognito}
            >
              {cognitoBusy ? "Opening Cognito…" : "Continue with Amazon Cognito"}
            </button>

            <p className="text-center text-xs text-[#8a968e]">
              You’ll use the Cognito Hosted UI to sign up or sign in.
            </p>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#d5ddd8]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-[#8a968e]">or</span>
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setShowPhone(true);
                setError(null);
              }}
            >
              Use phone OTP instead
            </button>
          </>
        ) : step === "phone" ? (
          <form onSubmit={onSendCode} className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#14201a]">
                Your number
              </h1>
              <p className="mt-1 text-sm text-[#5c6b63]">
                We’ll text a one-time code. No password.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="phone">
                Phone number
              </label>
              <div className="flex gap-2">
                <div className="relative w-[7.5rem] shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#5c6b63]">
                    +
                  </span>
                  <input
                    id="cc"
                    className="field pl-6"
                    inputMode="numeric"
                    value={countryCode}
                    onChange={(e) =>
                      setCountryCode(e.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                    aria-label="Country code"
                  />
                </div>
                <input
                  id="phone"
                  className="field"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <p className="mt-1.5 text-xs text-[#8a968e]">{fullPhonePreview}</p>
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Sending…" : "Continue"}
            </button>

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setShowPhone(false);
                setError(null);
              }}
            >
              Back to Cognito
            </button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#14201a]">
                Enter code
              </h1>
              <p className="mt-1 text-sm text-[#5c6b63]">
                Sent to {phoneMasked}
                {isNew ? " · creating your account" : ""}
              </p>
            </div>

            {devCode && (
              <div className="rounded-xl border border-[#c5e4d8] bg-[#e6f5ef] px-3.5 py-3 text-sm text-[#0d7a5f]">
                Demo mode — your code is{" "}
                <span className="font-mono text-base font-semibold tracking-widest">
                  {devCode}
                </span>
              </div>
            )}

            <div>
              <label className="label" htmlFor="code">
                6-digit code
              </label>
              <input
                id="code"
                className="field font-mono text-center text-xl tracking-[0.35em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
              />
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy || code.length < 4}
            >
              {busy ? "Checking…" : "Sign in"}
            </button>

            <button
              type="button"
              className="btn-secondary w-full"
              disabled={busy}
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
                setDevCode(null);
              }}
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
