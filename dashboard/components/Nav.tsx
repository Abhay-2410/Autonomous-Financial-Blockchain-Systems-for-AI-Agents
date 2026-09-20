"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Home", hint: "Balance" },
  { href: "/pay", label: "Pay", hint: "Send money" },
  { href: "/wallets", label: "Agents", hint: "Cards" },
  { href: "/approvals", label: "Approvals", hint: "Inbox" },
  { href: "/audit", label: "Activity", hint: "History" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/login/")) return;
    fetch("/api/auth/me")
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{ user?: { phone?: string } }>;
      })
      .then((data) => setPhone(data?.user?.phone ?? null))
      .catch(() => setPhone(null));
  }, [pathname]);

  if (pathname === "/login" || pathname.startsWith("/login/")) return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

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
          {phone && (
            <span className="hidden font-mono text-xs text-[#5c6b63] sm:inline">
              {phone}
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
