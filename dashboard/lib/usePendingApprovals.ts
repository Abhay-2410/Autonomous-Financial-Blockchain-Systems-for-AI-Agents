"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  listPendingApprovals,
  type PendingApproval,
} from "./api";

/**
 * Shared pending-approvals source for Home + Approvals pages.
 * Always hits GET /approvals/pending so counts stay in sync.
 */
export function usePendingApprovals(opts?: { pollMs?: number }) {
  const pollMs = opts?.pollMs ?? 0;
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await listPendingApprovals();
      setPending(res.pending);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn’t load approvals right now."
      );
    }
  }, []);

  useEffect(() => {
    void reload();
    if (pollMs <= 0) return;
    const id = setInterval(() => void reload(), pollMs);
    return () => clearInterval(id);
  }, [reload, pollMs]);

  return {
    pending,
    count: pending.length,
    error,
    reload,
  };
}
