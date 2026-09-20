import type { ReactNode } from "react";

export function SpendBar({
  spent,
  limit,
}: {
  spent: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const tone =
    pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-[#0d7a5f]";
  const remaining = Math.max(0, limit - spent);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-[#5c6b63]">
          Spent today{" "}
          <span className="font-semibold text-[#14201a]">
            ${spent.toLocaleString()}
          </span>
          <span className="text-[#8a968e]"> of ${limit.toLocaleString()}</span>
        </p>
        <p className="text-sm font-semibold text-[#0d7a5f]">
          ${remaining.toLocaleString()} left
        </p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#e8eee9]">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${tone}`}
          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-[#e6f5ef] text-[#0d7a5f]"
          : "bg-rose-50 text-rose-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-[#0d7a5f]" : "bg-rose-500"
        }`}
      />
      {active ? "Active" : "Paused"}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#14201a] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-[#5c6b63]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e6f5ef] text-2xl text-[#0d7a5f]">
        ✓
      </div>
      <h3 className="text-lg font-semibold text-[#14201a]">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[#5c6b63]">
        {description}
      </p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
    >
      {message}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="card flex items-center gap-3 px-5 py-8 text-sm text-[#5c6b63]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0d7a5f] border-t-transparent" />
      {label}
    </div>
  );
}

export function friendlyEventLabel(eventType: string): string {
  const t = eventType.toUpperCase();
  if (t.includes("CONFIRMED")) return "Payment completed";
  if (t.includes("ALLOWED")) return "Payment approved";
  if (t.includes("DENIED") || t.includes("REJECT")) return "Payment blocked";
  if (t.includes("PENDING") || t.includes("APPROVAL"))
    return "Waiting for your approval";
  if (t.includes("SIGNED")) return "Payment signed";
  return eventType.replace(/_/g, " ").toLowerCase();
}

export function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
