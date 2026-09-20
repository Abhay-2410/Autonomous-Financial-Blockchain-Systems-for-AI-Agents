"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  ErrorBanner,
  formatUsd,
  formatWhen,
  friendlyEventLabel,
  PageHeader,
} from "../../components/ui";
import { ApiError, getAudit, type AuditItem } from "../../lib/api";

function toneFor(eventType: string): {
  ring: string;
  badge: string;
  dot: string;
} {
  const t = eventType.toUpperCase();
  if (t.includes("DENIED") || t.includes("REJECT") || t.includes("REVOKED")) {
    return {
      ring: "border-l-rose-400",
      badge: "bg-rose-50 text-rose-700",
      dot: "bg-rose-500",
    };
  }
  if (t.includes("PENDING") || t.includes("APPROVAL")) {
    return {
      ring: "border-l-amber-400",
      badge: "bg-amber-50 text-amber-800",
      dot: "bg-amber-500",
    };
  }
  if (
    t.includes("ALLOWED") ||
    t.includes("CONFIRMED") ||
    t.includes("SIGNED") ||
    t.includes("APPROVED")
  ) {
    return {
      ring: "border-l-[#0d7a5f]",
      badge: "bg-[#e6f5ef] text-[#0d7a5f]",
      dot: "bg-[#0d7a5f]",
    };
  }
  return {
    ring: "border-l-[#d5ddd8]",
    badge: "bg-[#f3f6f4] text-[#5c6b63]",
    dot: "bg-[#8a968e]",
  };
}

function detailLine(ev: AuditItem): string {
  const d = ev.details;
  const amount = typeof d.amount === "number" ? d.amount : null;
  const recipient =
    typeof d.recipient === "string" ? d.recipient : null;
  const parts: string[] = [];
  if (amount !== null) parts.push(formatUsd(amount));
  if (recipient) parts.push(`to ${recipient}`);
  return parts.join(" ") || "Details recorded";
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await getAudit({
        agentId: agentFilter.trim() || undefined,
        limit: 80,
      });
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn’t load activity right now."
      );
    }
  }, [agentFilter]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 2500);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Activity"
        description="A live timeline of what your agents tried to buy — approved, blocked, or waiting on you."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              placeholder="Filter by agent name…"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="field w-56"
            />
            <span className="inline-flex items-center gap-2 rounded-full bg-[#e6f5ef] px-3 py-1.5 text-sm font-medium text-[#0d7a5f]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#0d7a5f]" />
              Live
            </span>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-4 text-sm text-[#5c6b63]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#0d7a5f]" /> Allowed
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Blocked
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Waiting
        </span>
      </div>

      {error && <ErrorBanner message={error} />}

      {items.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="When your agents start making purchases, you’ll see every decision here in plain language."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((ev) => {
            const tone = toneFor(ev.eventType);
            return (
              <li
                key={`${ev.sk}-${ev.timestamp}`}
                className={`card border-l-4 ${tone.ring} px-5 py-4`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-[#14201a]">
                        {friendlyEventLabel(ev.eventType)}
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}
                      >
                        {ev.agentId}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#3d4a43]">
                      {detailLine(ev)}
                    </p>
                    {typeof ev.details.explorerUrl === "string" && (
                      <a
                        href={ev.details.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-sm font-medium text-[#0d7a5f] hover:underline"
                      >
                        View on explorer →
                      </a>
                    )}
                    {typeof ev.details.txHash === "string" &&
                      typeof ev.details.explorerUrl !== "string" && (
                        <p className="mt-2 font-mono text-xs text-[#8a968e]">
                          tx {String(ev.details.txHash).slice(0, 18)}…
                        </p>
                      )}
                  </div>
                  <time className="text-sm text-[#8a968e]">
                    {formatWhen(ev.timestamp)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
