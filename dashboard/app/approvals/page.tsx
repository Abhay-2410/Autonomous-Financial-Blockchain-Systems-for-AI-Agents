"use client";

import { useState } from "react";
import {
  EmptyState,
  ErrorBanner,
  formatUsd,
  formatWhen,
  PageHeader,
} from "../../components/ui";
import {
  ApiError,
  approveTransaction,
  rejectTransaction,
} from "../../lib/api";
import { usePendingApprovals } from "../../lib/usePendingApprovals";

export default function ApprovalsPage() {
  const { pending, error, reload } = usePendingApprovals({ pollMs: 3000 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(transactionId: string, action: "approve" | "reject") {
    setBusy(transactionId);
    setActionError(null);
    try {
      if (action === "approve") {
        await approveTransaction(transactionId);
      } else {
        await rejectTransaction(transactionId);
      }
      await reload();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : action === "approve"
            ? "Couldn’t approve this payment."
            : "Couldn’t decline this payment."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Needs your approval"
        description="When an agent wants to spend more than its soft limits allow, the payment waits here until you say yes or no. This list refreshes automatically."
        action={
          <span className="inline-flex items-center gap-2 rounded-full bg-[#fff7e6] px-3 py-1.5 text-sm font-medium text-amber-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Watching for new requests
          </span>
        }
      />

      {(error || actionError) && (
        <ErrorBanner message={actionError ?? error ?? ""} />
      )}

      {pending.length === 0 ? (
        <EmptyState
          title="No payments waiting"
          description="Requests appear here when an agent tries to spend beyond its daily or per-transaction limit."
        />
      ) : (
        <div className="space-y-4">
          {pending.map((p) => (
            <article key={p.transactionId} className="card p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0d7a5f]">
                    {p.agentId} · {formatWhen(p.timestamp)}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-[#14201a]">
                    {formatUsd(p.amount)}{" "}
                    <span className="text-lg font-semibold text-[#5c6b63]">
                      to {p.recipient}
                    </span>
                  </h2>
                  <p className="mt-2 text-base text-[#3d4a43]">{p.purpose}</p>
                  {p.reasons.length > 0 && (
                    <p className="mt-3 text-sm text-[#5c6b63]">
                      Why it’s waiting:{" "}
                      <span className="font-medium text-[#14201a]">
                        {p.reasons
                          .map((r) => r.replace(/_/g, " "))
                          .join(", ")}
                      </span>
                    </p>
                  )}
                  {!p.hasTaskToken && (
                    <p className="mt-2 text-sm text-amber-700">
                      Setting up the approval workflow… buttons unlock in a moment.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-3 sm:flex-col">
                  <button
                    type="button"
                    disabled={busy === p.transactionId || !p.hasTaskToken}
                    onClick={() => void act(p.transactionId, "approve")}
                    className="btn-primary min-w-[8rem]"
                  >
                    {busy === p.transactionId ? "Working…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.transactionId || !p.hasTaskToken}
                    onClick={() => void act(p.transactionId, "reject")}
                    className="btn-danger min-w-[8rem]"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
