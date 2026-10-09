const STORAGE_KEY = 'ls:pendingBillingAction';
// A billing portal / checkout visit that never reports back should not warn forever.
const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Records that this browser has handed off to Stripe (billing portal or
 * checkout). localStorage is shared across tabs, so the sign-out dialog on
 * /profile/settings can warn about an action started in another tab.
 */
export function markPendingBillingAction(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // Storage unavailable (private mode / blocked) — the warning is best-effort.
  }
}

export function clearPendingBillingAction(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort, see markPendingBillingAction.
  }
}

export function hasPendingBillingAction(now: number = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const startedAt = Number(raw);
    return Number.isFinite(startedAt) && now - startedAt < MAX_AGE_MS;
  } catch {
    return false;
  }
}
