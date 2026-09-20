"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Home", hint: "Balance" },
  { href: "/pay", label: "Pay", hint: "Send money" },
  { href: "/wallets", label: "Agents", hint: "Cards" },
  { href: "/approvals", label: "Approvals", hint: "Inbox" },
  { href: "/audit", label: "Activity", hint: "History" },
] as const;

type MeUser = {
  email?: string | null;
  emailVerified?: boolean | null;
  displayName?: string | null;
  phone?: string | null;
  authProvider?: string | null;
};

function identityLabel(user: MeUser): {
  text: string;
  unverified: boolean;
  email: string | null;
} {
  const looksLikeUuid = (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v
    );
  const email =
    user.email && user.email.includes("@") && !user.email.startsWith("cognito:")
      ? user.email
      : null;
  const display =
    user.displayName &&
    !user.displayName.startsWith("cognito:") &&
    !looksLikeUuid(user.displayName) &&
    user.displayName !== user.phone
      ? user.displayName
      : null;
  const phone =
    user.phone && !user.phone.startsWith("cognito:") ? user.phone : null;

  const primary = email ?? display ?? phone;
  if (!primary) {
    return { text: "", unverified: false, email: null };
  }

  const unverified =
    Boolean(email) &&
    user.authProvider === "cognito" &&
    user.emailVerified === false;

  return {
    text: unverified ? `Unverified: ${email}` : primary,
    unverified,
    email,
  };
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [resendState, setResendState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  const loadMe = useCallback(() => {
    if (pathname === "/login" || pathname.startsWith("/login/")) return;
    fetch("/api/auth/me")
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{ user?: MeUser }>;
      })
      .then((data) => setMe(data?.user ?? null))
      .catch(() => setMe(null));
  }, [pathname]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  if (pathname === "/login" || pathname.startsWith("/login/")) return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function resendVerification() {
    const email = me?.email;
    if (!email) return;
    setResendState("sending");
    try {
      const res = await fetch("/api/auth/cognito/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resend", email }),
      });
      if (!res.ok) {
        setResendState("error");
        return;
      }
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  }

  const identity = me ? identityLabel(me) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-[#d5ddd8]/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5">
        <Link href="/" className="group shrink-0">
          <div className="font-display text-2xl font-bold tracking-tight text-[#14201a] transition group-hover:text-[#0d7a5f]">
            LimitX
          </div>
          <p className="text-xs text-[#5c6b63]">Pay with AI agents — safely</p>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl px-3 py-2 transition ${
                  active
                    ? "bg-[#e6f5ef] text-[#0d7a5f]"
                    : "text-[#5c6b63] hover:bg-[#f3f6f4] hover:text-[#14201a]"
                }`}
              >
                <div className="text-sm font-semibold">{l.label}</div>
                <div className="text-[11px] opacity-80">{l.hint}</div>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <nav className="flex flex-wrap justify-end gap-1 md:hidden">
            {LINKS.map((l) => {
              const active =
                l.href === "/"
                  ? pathname === "/"
                  : pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    active ? "bg-[#e6f5ef] text-[#0d7a5f]" : "text-[#5c6b63]"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          {identity?.text && (
            <span className="hidden max-w-[14rem] truncate text-xs text-[#5c6b63] sm:inline">
              {identity.text}
              {identity.unverified && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="font-semibold text-[#0d7a5f] underline-offset-2 hover:underline disabled:opacity-60"
                    disabled={resendState === "sending" || resendState === "sent"}
                    onClick={() => void resendVerification()}
                  >
                    {resendState === "sent"
                      ? "Code sent"
                      : resendState === "sending"
                        ? "Sending…"
                        : resendState === "error"
                          ? "Retry resend"
                          : "Resend verification"}
                  </button>
                </>
              )}
            </span>
          )}
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
