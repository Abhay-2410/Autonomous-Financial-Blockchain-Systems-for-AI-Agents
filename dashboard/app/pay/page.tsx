"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ErrorBanner,
  LoadingBlock,
  PageHeader,
} from "../../components/ui";
import {
  ApiError,
  listMerchants,
  listWallets,
  payAsOwner,
  shortAddress,
  type AgentWallet,
  type Merchant,
  type PayResult,
} from "../../lib/api";

export default function PayPage() {
  const [wallets, setWallets] = useState<AgentWallet[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [agentId, setAgentId] = useState("");
  const [amount, setAmount] = useState("25");
  const [recipient, setRecipient] = useState("");
  const [purpose, setPurpose] = useState("Everyday purchase");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PayResult | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => wallets.find((w) => w.agentId === agentId),
    [wallets, agentId]
  );

  const allowedMerchants = useMemo(() => {
    if (!selected) return merchants;
    return merchants.filter((m) =>
      selected.allowedMerchants.some(
        (a) => a.toLowerCase() === m.id.toLowerCase()
      )
    );
  }, [merchants, selected]);

  const load = useCallback(async () => {
    try {
      const [w, m] = await Promise.all([listWallets(), listMerchants()]);
      setWallets(w.wallets.filter((x) => x.status === "ACTIVE"));
      setMerchants(m.merchants);
      if (!agentId && w.wallets[0]) setAgentId(w.wallets[0].agentId);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn’t load pay form."
      );
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (allowedMerchants.length && !allowedMerchants.some((m) => m.id === recipient)) {
      setRecipient(allowedMerchants[0]?.id ?? "");
    }
  }, [allowedMerchants, recipient]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const res = await payAsOwner({
        agentId,
        amount: Number(amount),
        recipient,
        type: "purchase",
        purpose,
        timestamp: new Date().toISOString(),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Payment failed.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingBlock label="Preparing pay…" />;

  const merchant = merchants.find((m) => m.id === recipient);

  return (
    <div>
      <PageHeader
        title="Pay"
        description="Send money from an agent’s prepaid wallet. Policy decides allow, ask you, or block — then LimitX signs."
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-6 lg:grid-cols-5">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="card space-y-4 p-6 lg:col-span-3"
        >
          <label className="block">
            <span className="label">Pay from agent</span>
            <select
              className="field"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              {wallets.map((w) => (
                <option key={w.agentId} value={w.agentId}>
                  {w.name} · ${w.spentToday}/{w.dailyLimit} today
                </option>
              ))}
            </select>
            {selected?.address && (
              <span className="mt-1.5 block font-mono text-xs text-[#8a968e]">
                Card {shortAddress(selected.address)} ·{" "}
                {selected.chainName ?? "Base Sepolia"}
              </span>
            )}
          </label>

          <label className="block">
            <span className="label">Amount (USD / USDC)</span>
            <input
              type="number"
              min={1}
              step={1}
              className="field"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="label">Merchant</span>
            <select
              className="field"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              required
            >
              {allowedMerchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.category}
                </option>
              ))}
            </select>
            {merchant && (
              <span className="mt-1.5 block font-mono text-xs text-[#8a968e]">
                Payout {shortAddress(merchant.address)}
              </span>
            )}
          </label>

          <label className="block">
            <span className="label">What’s it for?</span>
            <input
              type="text"
              className="field"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
            />
          </label>

          <button type="submit" disabled={sending || !agentId} className="btn-primary w-full">
            {sending ? "Sending…" : "Send payment"}
          </button>
        </form>

        <aside className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <h2 className="text-base font-semibold">How it works</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-[#5c6b63]">
              <li>Policy checks limits & merchants</li>
              <li>Soft overspend → Approvals inbox</li>
              <li>Allowed → KMS sign → stub settle on Base Sepolia</li>
            </ol>
          </div>

          {result && (
            <div className="card border-[#0d7a5f]/30 p-5">
              <h2 className="text-base font-semibold text-[#14201a]">Result</h2>
              <p className="mt-2 text-2xl font-bold text-[#0d7a5f]">
                {result.decision.replace(/_/g, " ")}
              </p>
              <p className="mt-1 text-sm text-[#5c6b63]">
                {result.reasons.map((r) => r.replace(/_/g, " ")).join(" · ")}
              </p>
              <p className="mt-3 font-mono text-xs text-[#8a968e]">
                {result.transactionId}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {result.decision === "PENDING_APPROVAL" && (
                  <Link href="/approvals" className="btn-primary text-sm">
                    Open approvals
                  </Link>
                )}
                <Link href="/audit" className="btn-secondary text-sm">
                  View activity
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
