"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ErrorBanner,
  formatUsd,
  LoadingBlock,
  PageHeader,
} from "../../components/ui";
import {
  ApiError,
  completePravaCheckout,
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
  const [rail, setRail] = useState<"stellar" | "chain" | "prava">("stellar");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PayResult | null>(null);
  const [sending, setSending] = useState(false);
  const [completingPrava, setCompletingPrava] = useState(false);
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
        settlementRail: rail,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Payment failed.");
    } finally {
      setSending(false);
    }
  }

  async function onCompletePrava() {
    if (!result?.transactionId) return;
    setCompletingPrava(true);
    setError(null);
    try {
      await completePravaCheckout(result.transactionId);
      setResult({
        ...result,
        status: "CONFIRMED",
        decision: result.decision,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not complete Prava checkout."
      );
    } finally {
      setCompletingPrava(false);
    }
  }

  if (loading) return <LoadingBlock label="Preparing pay…" />;

  const merchant = merchants.find((m) => m.id === recipient);
  const prava = result?.pravaCheckout;

  return (
    <div>
      <PageHeader
        title="Pay"
        description="Enter a USD amount. Policy decides allow / ask / block. Settlement can be Stellar Testnet (1 USD = 1 XLM demo rate), Base stub, or Prava card."
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
                  {w.name} · {formatUsd(w.spentToday)}/{formatUsd(w.dailyLimit)}{" "}
                  today
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

          <fieldset className="block">
            <span className="label">Settlement rail</span>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="rail"
                  checked={rail === "stellar"}
                  onChange={() => setRail("stellar")}
                />
                Stellar Testnet (XLM)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="rail"
                  checked={rail === "chain"}
                  onChange={() => setRail("chain")}
                />
                Base Sepolia (stub)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="rail"
                  checked={rail === "prava"}
                  onChange={() => setRail("prava")}
                />
                Prava card checkout
              </label>
            </div>
            {rail === "stellar" && (
              <p className="mt-2 text-xs text-[#5c6b63]">
                Amount is USD (same unit as agent limits). At settlement LimitX
                converts with the demo rate{" "}
                <strong>1 USD = 1 XLM</strong> on Stellar Testnet
                (Friendbot-funded custodial account).
              </p>
            )}
            {rail === "prava" && (
              <p className="mt-2 text-xs text-[#5c6b63]">
                After policy allow + KMS sign, open Prava’s hosted page to approve
                a one-time merchant-scoped Visa credential (passkey). Requires{" "}
                <code className="font-mono">PRAVA_SECRET_KEY</code> on the API.
              </p>
            )}
          </fieldset>

          <label className="block">
            <span className="label">Amount (USD)</span>
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
                Payout{" "}
                {shortAddress(
                  rail === "stellar"
                    ? merchant.stellarAddress ?? merchant.address
                    : merchant.address
                )}
                {merchant.url ? ` · ${merchant.url}` : ""}
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
              <li>Policy checks limits &amp; merchants</li>
              <li>Soft overspend → Approvals inbox</li>
              <li>Allowed → KMS sign (Lambda or Nitro)</li>
              <li>Settle: Stellar Testnet XLM, Base stub, or Prava card</li>
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
              <p className="mt-1 text-xs text-[#8a968e]">
                Rail: {result.settlementRail ?? rail}
                {result.status ? ` · ${result.status}` : ""}
              </p>
              <p className="mt-3 font-mono text-xs text-[#8a968e]">
                {result.transactionId}
              </p>

              {prava && (
                <div className="mt-4 space-y-2 rounded-lg bg-[#f4f7f5] p-3 text-sm">
                  <p className="font-medium text-[#14201a]">Prava checkout</p>
                  {!prava.configured || !prava.iframeUrl ? (
                    <p className="text-[#5c6b63]">
                      {prava.message ??
                        "Set PRAVA_SECRET_KEY on the API stack, then redeploy."}
                    </p>
                  ) : (
                    <>
                      <a
                        href={prava.iframeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary inline-flex text-sm"
                      >
                        Open Prava hosted checkout
                      </a>
                      <button
                        type="button"
                        className="btn-secondary ml-2 text-sm"
                        disabled={completingPrava}
                        onClick={() => void onCompletePrava()}
                      >
                        {completingPrava
                          ? "Confirming…"
                          : "I’ve finished — confirm"}
                      </button>
                      <p className="text-xs text-[#8a968e]">
                        Sandbox test OTP is usually <code>456789</code>. Card
                        numbers never touch LimitX.
                      </p>
                    </>
                  )}
                </div>
              )}

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
