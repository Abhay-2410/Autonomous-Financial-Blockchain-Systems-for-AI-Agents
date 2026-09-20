"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ErrorBanner,
  formatUsd,
  LoadingBlock,
  PageHeader,
} from "../components/ui";
import { OnboardingWalkthrough } from "../components/OnboardingWalkthrough";
import {
  ApiError,
  getHome,
  shortAddress,
  type HomeSummary,
} from "../lib/api";
import { usePendingApprovals } from "../lib/usePendingApprovals";

function HomeContent() {
  const search = useSearchParams();
  const forceTour = search.get("tour") === "1";
  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { count: pendingApprovals } = usePendingApprovals({ pollMs: 3000 });

  const load = useCallback(async () => {
    try {
      const res = await getHome();
      setData(res);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn’t load your LimitX home."
      );
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 8000);
    return () => clearInterval(id);
  }, [load]);

  if (!data && !error) {
    return <LoadingBlock label="Opening your wallet…" />;
  }

  return (
    <div>
      <PageHeader
        title="Home"
        description="Your treasury funds prepaid agent cards. Every payment is policy-checked before it’s signed."
      />

      <OnboardingWalkthrough forceOpen={forceTour} />

      {error && <ErrorBanner message={error} />}

      {data && (
        <>
          <section className="card overflow-hidden">
            <div className="bg-gradient-to-br from-[#0d7a5f] to-[#0a4f3d] px-6 py-8 text-white sm:px-8">
              <p className="text-sm font-medium text-white/80">
                {data.orgName} · {data.treasury.chainName}
              </p>
              <p className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">
                {data.treasury.tokenSymbol === "XLM" ? (
                  <>
                    {data.treasury.balance.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    <span className="text-2xl font-semibold sm:text-3xl">
                      XLM
                    </span>
                  </>
                ) : (
                  <>${data.treasury.balance.toLocaleString()}</>
                )}
              </p>
              <p className="mt-1 text-sm text-white/75">
                {data.treasury.tokenSymbol} treasury · settlement{" "}
                {data.treasury.settlementMode === "stub"
                  ? "demo (stub chain)"
                  : data.treasury.settlementMode === "stellar-testnet"
                    ? "Stellar Testnet"
                    : "live"}
              </p>
              <a
                href={data.treasury.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1.5 font-mono text-xs text-white hover:bg-white/25"
              >
                {shortAddress(data.treasury.address)}
              </a>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <div className="rounded-xl bg-[#f3f6f4] px-4 py-3">
                <p className="text-xs font-medium text-[#5c6b63]">Spent today</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatUsd(data.totals.spentToday)}
                </p>
              </div>
              <div className="rounded-xl bg-[#f3f6f4] px-4 py-3">
                <p className="text-xs font-medium text-[#5c6b63]">Active agents</p>
                <p className="mt-1 text-xl font-semibold">
                  {data.totals.activeAgents}/{data.totals.agentCount}
                </p>
              </div>
              <Link
                href="/approvals"
                className="rounded-xl bg-[#fff7e6] px-4 py-3 transition hover:bg-[#ffefcc]"
              >
                <p className="text-xs font-medium text-amber-800">
                  Needs approval
                </p>
                <p className="mt-1 text-xl font-semibold text-amber-900">
                  {pendingApprovals}
                </p>
              </Link>
            </div>
          </section>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Link
              href="/pay"
              className="card flex flex-col gap-1 p-5 transition hover:-translate-y-0.5 hover:border-[#0d7a5f]/40"
            >
              <span className="text-2xl">↑</span>
              <span className="text-lg font-semibold">Pay</span>
              <span className="text-sm text-[#5c6b63]">
                Send from an agent card
              </span>
            </Link>
            <Link
              href="/approvals"
              className="card flex flex-col gap-1 p-5 transition hover:-translate-y-0.5 hover:border-[#0d7a5f]/40"
            >
              <span className="text-2xl">✓</span>
              <span className="text-lg font-semibold">Approvals</span>
              <span className="text-sm text-[#5c6b63]">
                Review waiting payments
                {pendingApprovals > 0 ? ` (${pendingApprovals})` : ""}
              </span>
            </Link>
            <Link
              href="/wallets"
              className="card flex flex-col gap-1 p-5 transition hover:-translate-y-0.5 hover:border-[#0d7a5f]/40"
            >
              <span className="text-2xl">◇</span>
              <span className="text-lg font-semibold">Agent cards</span>
              <span className="text-sm text-[#5c6b63]">
                Limits, merchants, pause
              </span>
            </Link>
          </div>

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-[#14201a]">
              Agent cards
            </h2>
            <ul className="space-y-2">
              {data.agents.map((a) => (
                <li key={a.agentId}>
                  <Link
                    href={`/policies/${encodeURIComponent(a.agentId)}`}
                    className="card flex items-center justify-between gap-3 px-4 py-3.5 transition hover:border-[#0d7a5f]/30"
                  >
                    <div>
                      <p className="font-semibold text-[#14201a]">{a.name}</p>
                      <p className="font-mono text-xs text-[#8a968e]">
                        {shortAddress(a.address)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatUsd(a.spentToday)}
                        <span className="font-normal text-[#8a968e]">
                          {" "}
                          / {formatUsd(a.dailyLimit)}
                        </span>
                      </p>
                      <p className="text-xs text-[#5c6b63]">{a.status}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingBlock label="Opening your wallet…" />}>
      <HomeContent />
    </Suspense>
  );
}
