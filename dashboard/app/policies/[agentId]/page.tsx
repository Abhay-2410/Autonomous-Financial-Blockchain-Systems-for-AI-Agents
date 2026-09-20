"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ErrorBanner,
  LoadingBlock,
  PageHeader,
  StatusBadge,
} from "../../../components/ui";
import {
  ApiError,
  getPolicy,
  patchWallet,
  type PolicyResponse,
} from "../../../lib/api";

export default function PolicyPage() {
  const params = useParams();
  const agentId = decodeURIComponent(String(params.agentId ?? ""));

  const [data, setData] = useState<PolicyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [dailyLimit, setDailyLimit] = useState("");
  const [perTxn, setPerTxn] = useState("");
  const [merchants, setMerchants] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await getPolicy(agentId);
      setData(res);
      if (res.wallet) {
        setDailyLimit(String(res.wallet.dailyLimit));
        setPerTxn(String(res.wallet.perTransactionLimit));
        setMerchants(res.wallet.allowedMerchants.join(", "));
      }
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn’t load this agent’s settings."
      );
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveLimits(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await patchWallet(agentId, {
        dailyLimit: Number(dailyLimit),
        perTransactionLimit: Number(perTxn),
        allowedMerchants: merchants
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      });
      setSaved(true);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn’t save those limits."
      );
    } finally {
      setSaving(false);
    }
  }

  const displayName = data?.wallet?.name ?? agentId;

  return (
    <div>
      <Link
        href="/wallets"
        className="mb-4 inline-flex text-sm font-medium text-[#0d7a5f] hover:underline"
      >
        ← Back to agents
      </Link>

      <PageHeader
        title={displayName}
        description="Adjust how much this agent can spend, and review the rules that protect your budget."
        action={data?.wallet ? <StatusBadge status={data.wallet.status} /> : null}
      />

      {error && <ErrorBanner message={error} />}

      {!data ? (
        <LoadingBlock label="Loading settings…" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="card overflow-hidden lg:col-span-3">
            <div className="border-b border-[#d5ddd8] px-6 py-4">
              <h2 className="text-lg font-semibold text-[#14201a]">
                Spending rules
              </h2>
              <p className="mt-1 text-sm text-[#5c6b63]">
                These rules are locked for the demo — you can still change the
                numeric limits on the right.
              </p>
            </div>
            <pre className="max-h-[26rem] overflow-auto bg-[#14201a] p-5 font-mono text-[12px] leading-relaxed text-[#b8e0d0]">
              {data.cedarPolicy}
            </pre>
          </section>

          <section className="card p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-[#14201a]">
              Edit limits
            </h2>
            <p className="mt-1 mb-5 text-sm leading-relaxed text-[#5c6b63]">
              Changes apply right away to this agent’s wallet.
            </p>
            <form onSubmit={(e) => void saveLimits(e)} className="space-y-4">
              <label className="block">
                <span className="label">Daily budget ($)</span>
                <input
                  type="number"
                  min={0}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="field"
                />
              </label>
              <label className="block">
                <span className="label">Max per purchase ($)</span>
                <input
                  type="number"
                  min={0}
                  value={perTxn}
                  onChange={(e) => setPerTxn(e.target.value)}
                  className="field"
                />
              </label>
              <label className="block">
                <span className="label">Allowed merchants</span>
                <input
                  type="text"
                  value={merchants}
                  onChange={(e) => setMerchants(e.target.value)}
                  className="field"
                  placeholder="Amazon, Flipkart"
                />
                <span className="mt-1.5 block text-xs text-[#8a968e]">
                  Separate names with commas
                </span>
              </label>
              <button
                type="submit"
                disabled={saving || !data.wallet}
                className="btn-primary w-full"
              >
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
