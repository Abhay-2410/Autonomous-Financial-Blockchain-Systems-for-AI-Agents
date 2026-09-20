"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  dismissOnboarding,
  isOnboardingDismissed,
  ONBOARDING_OPEN_EVENT,
} from "../lib/onboarding";

const STEPS = [
  {
    n: 1,
    title: "Fund your treasury",
    detail: "Already done — 10,000 XLM on Testnet (Friendbot).",
    href: "/",
    linkLabel: "Home",
  },
  {
    n: 2,
    title: "Review agent limits",
    detail: "Check daily / per-transaction ceilings on each card.",
    href: "/wallets",
    linkLabel: "Agents",
  },
  {
    n: 3,
    title: "Send a test payment",
    detail: "Pick an agent, merchant, and USD amount.",
    href: "/pay",
    linkLabel: "Pay",
  },
  {
    n: 4,
    title: "Watch policy in real time",
    detail: "Allow, block, and confirm events show up live.",
    href: "/audit",
    linkLabel: "Activity",
  },
] as const;

export function OnboardingWalkthrough({
  forceOpen = false,
}: {
  /** When true (e.g. ?tour=1), show even if previously dismissed. */
  forceOpen?: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  const sync = useCallback(() => {
    setVisible(forceOpen || !isOnboardingDismissed());
    setReady(true);
  }, [forceOpen]);

  useEffect(() => {
    sync();
    const onOpen = () => setVisible(true);
    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpen);
  }, [sync]);

  if (!ready || !visible) return null;

  function onDismiss() {
    dismissOnboarding();
    setVisible(false);
    if (forceOpen) {
      router.replace("/");
    }
  }

  return (
    <section
      className="card mb-6 border-[#0d7a5f]/25 bg-gradient-to-br from-[#e6f5ef]/80 to-white p-5 sm:p-6"
      aria-label="Getting started"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0d7a5f]">
            Getting started
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-[#14201a]">
            Four steps to try LimitX
          </h2>
          <p className="mt-1 text-sm text-[#5c6b63]">
            Follow the path once — you can reopen this anytime from the{" "}
            <span className="font-semibold">?</span> in the header.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="btn-secondary shrink-0 self-start !px-3 !py-1.5 text-xs"
        >
          Dismiss
        </button>
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {STEPS.map((step) => (
          <li key={step.n}>
            <Link
              href={step.href}
              className="flex h-full gap-3 rounded-xl border border-[#d5ddd8]/80 bg-white/80 px-3.5 py-3 transition hover:border-[#0d7a5f]/40 hover:bg-[#f3f6f4]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0d7a5f] text-xs font-bold text-white">
                {step.n}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#14201a]">
                  {step.title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[#5c6b63]">
                  {step.detail}
                </span>
                <span className="mt-1.5 inline-block text-xs font-semibold text-[#0d7a5f]">
                  Open {step.linkLabel} →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
