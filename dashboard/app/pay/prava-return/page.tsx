"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  ErrorBanner,
  LoadingBlock,
  PageHeader,
} from "../../../components/ui";
import {
  ApiError,
  completePravaCheckout,
  getPravaStatus,
} from "../../../lib/api";

function PravaReturnInner() {
  const params = useSearchParams();
  const txnId = params.get("txnId") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Checking Prava…");
  const [done, setDone] = useState(false);

  const finish = useCallback(async () => {
    if (!txnId) {
      setError("Missing txnId — open this page from a Pay → Prava flow.");
      return;
    }
    setError(null);
    try {
      const st = await getPravaStatus(txnId);
      setStatus(`Prava status: ${st.prava?.status ?? st.message ?? "unknown"}`);
      const completed = await completePravaCheckout(txnId);
      setStatus(`LimitX confirmed via Prava · ${completed.status}`);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not complete Prava checkout."
      );
    }
  }, [txnId]);

  useEffect(() => {
    void finish();
  }, [finish]);

  return (
    <div>
      <PageHeader
        title="Prava checkout"
        description="Finishing the one-time card credential after your passkey approval."
      />
      {error && <ErrorBanner message={error} />}
      <div className="card max-w-lg space-y-4 p-6">
        <p className="text-sm text-[#5c6b63]">{status}</p>
        <p className="font-mono text-xs text-[#8a968e]">{txnId || "—"}</p>
        <div className="flex flex-wrap gap-2">
          {!done && (
            <button type="button" className="btn-primary" onClick={() => void finish()}>
              Retry complete
            </button>
          )}
          <Link href="/pay" className="btn-secondary">
            Back to Pay
          </Link>
          <Link href="/audit" className="btn-secondary">
            Activity
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PravaReturnPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading Prava return…" />}>
      <PravaReturnInner />
    </Suspense>
  );
}
