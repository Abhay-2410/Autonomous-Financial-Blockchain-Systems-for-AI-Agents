/**
 * First-login walkthrough dismissed state (localStorage).
 * Survives reloads; cleared when the header "?" re-opens the tour.
 */

const DISMISSED_KEY = "limitx.onboarding.dismissed";
export const ONBOARDING_OPEN_EVENT = "limitx:onboarding-open";

export function isOnboardingDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Clear dismissed flag and notify Home (or navigate there) to show the tour. */
export function reopenOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(ONBOARDING_OPEN_EVENT));
}
