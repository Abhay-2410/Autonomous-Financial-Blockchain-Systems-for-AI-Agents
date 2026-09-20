"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Mode = "signin" | "signup" | "confirm" | "phone" | "phone-code";

export default function LoginClient() {
  const search = useSearchParams();
  const nextPath = search.get("next") || "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");

  const [countryCode, setCountryCode] = useState("91");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fullPhonePreview = useMemo(() => {
    const digits = phone.replace(/\D/g, "");
    return digits ? `+${countryCode}${digits}` : `+${countryCode}…`;
  }, [countryCode, phone]);

  async function finishOk() {
    window.location.href = nextPath.startsWith("/") ? nextPath : "/";
  }

  async function onEmailAuth(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup" && password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      const action =
        mode === "confirm" ? "confirm" : mode === "signup" ? "signup" : "signin";
      const res = await fetch("/api/auth/cognito/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          email,
          password,
          code: verifyCode,
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        needsConfirmation?: boolean;
        signedIn?: boolean;
        confirmed?: boolean;
      };
      if (!res.ok) {
        if (data.needsConfirmation) {
          setMode("confirm");
          setInfo(data.message ?? "Enter the verification code from your email.");
          setError(null);
          return;
        }
        throw new Error(data.message ?? "Authentication failed");
      }
      if (data.needsConfirmation) {
        setMode("confirm");
        setInfo(data.message ?? "Check your email for a verification code.");
        return;
      }
      if (data.signedIn) {
        await finishOk();
        return;
      }
      if (data.confirmed) {
        setMode("signin");
        setInfo("Email verified. Sign in with your password.");
        setVerifyCode("");
        return;
      }
      throw new Error(data.message ?? "Unexpected response");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSendSms(e: FormEvent) {
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
      if (!res.ok) throw new Error(data.message ?? "Could not send code");
      setPhoneMasked(data.phoneMasked ?? fullPhonePreview);
      setIsNew(Boolean(data.isNew));
      setDevCode(data.devCode ?? null);
      setMode("phone-code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function onVerifySms(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, countryCode, code: smsCode }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Incorrect code");
      await finishOk();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setBusy(false);
    }
  }

  const emailModes = mode === "signin" || mode === "signup" || mode === "confirm";

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

      <div className="card space-y-5 p-6 sm:p-8">
        {emailModes && (
          <>
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#14201a]">
                {mode === "signup"
                  ? "Create account"
                  : mode === "confirm"
                    ? "Verify email"
                    : "Sign in"}
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-[#5c6b63]">
                {mode === "signup"
                  ? "Anyone can join with email and password (Amazon Cognito)."
                  : mode === "confirm"
                    ? `Enter the code sent to ${email || "your email"}.`
                    : "Sign in with your email and password."}
              </p>
            </div>

            {mode !== "confirm" && (
              <div className="flex rounded-xl border border-[#d5ddd8] p-1">
                <button
                  type="button"
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                    mode === "signin"
                      ? "bg-[#e6f5ef] text-[#0d7a5f]"
                      : "text-[#5c6b63] hover:text-[#14201a]"
                  }`}
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setInfo(null);
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                    mode === "signup"
                      ? "bg-[#e6f5ef] text-[#0d7a5f]"
                      : "text-[#5c6b63] hover:text-[#14201a]"
                  }`}
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setInfo(null);
                  }}
                >
                  Create account
                </button>
              </div>
            )}

            <form onSubmit={onEmailAuth} className="space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className="field"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={mode === "confirm"}
                />
              </div>

              {mode !== "confirm" && (
                <div>
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    className="field"
                    type="password"
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    placeholder={
                      mode === "signup" ? "Min 8 chars, letter + number" : "••••••••"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              )}

              {mode === "signup" && (
                <div>
                  <label className="label" htmlFor="confirmPassword">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              )}

              {mode === "confirm" && (
                <>
                  <div>
                    <label className="label" htmlFor="verifyCode">
                      Verification code
                    </label>
                    <input
                      id="verifyCode"
                      className="field font-mono tracking-widest"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={verifyCode}
                      onChange={(e) =>
                        setVerifyCode(e.target.value.replace(/\s/g, ""))
                      }
                      required
                    />
                  </div>
                  <input type="hidden" value={password} readOnly />
                </>
              )}

              {info && (
                <p className="rounded-xl bg-[#e6f5ef] px-3.5 py-2.5 text-sm text-[#0d7a5f]">
                  {info}
                </p>
              )}
              {error && (
                <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary w-full py-3 text-base"
                disabled={busy}
              >
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "confirm"
                      ? "Verify & sign in"
                      : "Sign in"}
              </button>
            </form>

            {mode === "confirm" && (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
              >
                Back to sign in
              </button>
            )}

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
                setMode("phone");
                setError(null);
                setInfo(null);
              }}
            >
              Use phone OTP instead
            </button>
          </>
        )}

        {mode === "phone" && (
          <form onSubmit={onSendSms} className="space-y-5">
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
              onClick={() => setMode("signin")}
            >
              Back to email sign in
            </button>
          </form>
        )}

        {mode === "phone-code" && (
          <form onSubmit={onVerifySms} className="space-y-5">
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
              <label className="label" htmlFor="smsCode">
                6-digit code
              </label>
              <input
                id="smsCode"
                className="field font-mono text-center text-xl tracking-[0.35em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={smsCode}
                onChange={(e) =>
                  setSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6))
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
              disabled={busy || smsCode.length < 4}
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => setMode("phone")}
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
