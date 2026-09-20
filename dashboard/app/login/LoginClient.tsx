"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Step = "phone" | "code";

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
  const [error, setError] = useState<string | null>(null);

  const fullPhonePreview = useMemo(() => {
    const digits = phone.replace(/\D/g, "");
    return digits ? `+${countryCode}${digits}` : `+${countryCode}…`;
  }, [countryCode, phone]);

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
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-1">
      <div className="mb-8 text-center">
        <div className="font-display text-4xl font-bold tracking-tight text-[#14201a]">
          LimitX
        </div>
        <p className="mt-2 text-sm text-[#5c6b63]">
          Sign in with your phone — like a real payments app.
        </p>
      </div>

      <div className="card p-6 sm:p-8">
        {step === "phone" ? (
          <form onSubmit={onSendCode} className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#14201a]">
                Your number
              </h1>
              <p className="mt-1 text-sm text-[#5c6b63]">
                We&apos;ll text a one-time code to your phone. No password.
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
