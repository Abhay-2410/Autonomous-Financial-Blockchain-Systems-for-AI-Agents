"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  ErrorBanner,
  formatUsd,
  LoadingBlock,
  PageHeader,
  SpendBar,
  StatusBadge,
} from "../../components/ui";
import {
  ApiError,
  listWallets,
  patchWallet,
  shortAddress,
  topUpWallet,
  type AgentWallet,
} from "../../lib/api";

export default function WalletsPage() {
  const [wallets, setWallets] = useState<AgentWallet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await listWallets();
      setWallets(res.wallets);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn’t load your agents. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(agentId: string, name: string) {
    if (
      !confirm(
        `Pause ${name}? It won’t be able to spend until you turn it back on.`
      )
    ) {
      return;
    }
    setBusy(agentId);
    try {
      await patchWallet(agentId, { status: "REVOKED" });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn’t pause this agent."
      );
    } finally {
      setBusy(null);
    }
  }

  async function topUp(agentId: string, name: string) {
    const raw = prompt(`Top up ${name} from treasury (USD amount):`, "500");
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid positive amount.");
      return;
    }
    setBusy(agentId);
    try {
      await topUpWallet(agentId, amount);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Top-up failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Agent cards"
        description="Each AI agent gets a prepaid wallet with daily limits and merchants. Run agents/shopping_agent.py (demo / browser / Prava) to spend through LimitX."
        action={
          <button type="button" onClick={() => void load()} className="btn-secondary">
            Refresh
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <LoadingBlock label="Loading your agents…" />
      ) : wallets.length === 0 ? (
        <EmptyState
          title="No agents yet"
          description="Once agents are set up for your organization, they’ll show up here with their budgets."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {wallets.map((w) => (
            <article
              key={w.agentId}
              className="card flex flex-col gap-5 p-6 transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(20,32,26,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-[#14201a]">
                    {w.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-[#8a968e]">
                    {w.agentId}
                    {w.address ? ` · ${shortAddress(w.address)}` : ""}
                  </p>
                  {w.chainName && (
                    <p className="mt-0.5 text-xs text-[#8a968e]">
                      {w.chainName} · {w.tokenSymbol ?? "USDC"}
                    </p>
                  )}
                </div>
                <StatusBadge status={w.status} />
              </div>

              <SpendBar spent={w.spentToday} limit={w.dailyLimit} />

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#f3f6f4] px-3.5 py-3">
                  <p className="text-xs font-medium text-[#5c6b63]">Daily budget</p>
                  <p className="mt-1 text-lg font-semibold text-[#14201a]">
                    {formatUsd(w.dailyLimit)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#f3f6f4] px-3.5 py-3">
                  <p className="text-xs font-medium text-[#5c6b63]">
                    Card balance
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#14201a]">
                    {formatUsd(w.allocatedBalance ?? 0)}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-[#3d4a43]">
                  Allowed merchants
                </p>
                <div className="flex flex-wrap gap-2">
                  {w.allowedMerchants.map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-[#e6f5ef] px-3 py-1 text-sm font-medium text-[#0d7a5f]"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                <Link
                  href={`/policies/${encodeURIComponent(w.agentId)}`}
                  className="btn-primary col-span-2 sm:col-span-1"
                >
                  Limits
                </Link>
                <button
                  type="button"
                  disabled={busy === w.agentId}
                  onClick={() => void topUp(w.agentId, w.name)}
                  className="btn-secondary"
                >
                  Top up
                </button>
                <button
                  type="button"
                  disabled={w.status === "REVOKED" || busy === w.agentId}
                  onClick={() => void revoke(w.agentId, w.name)}
                  className="btn-danger"
                >
                  {busy === w.agentId
                    ? "…"
                    : w.status === "REVOKED"
                      ? "Paused"
                      : "Pause"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
