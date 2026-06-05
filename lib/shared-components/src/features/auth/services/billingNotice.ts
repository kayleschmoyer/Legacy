import { LOGGER } from '@legacy-sports/logging';

/**
 * One-shot, post-login billing routing hint (LGN-029).
 *
 * The /oauth/login response carries a `billingStatus` advisory signal. When a
 * premium user is past-due, we stash a notice in sessionStorage so the next
 * authenticated screen can surface a dismissible "open billing" banner exactly
 * once. The notice is intentionally session-scoped (clears on tab close),
 * consumed on read, and never gates anything.
 *
 * sessionStorage mirrors the existing `ls_csrf_token` handling: it is guarded
 * by a `typeof` check so the shared service stays safe on platforms (e.g.
 * React Native) where Web Storage is unavailable.
 */

/** Billing-standing value as returned by the server. */
export type BillingNoticeStatus = 'past_due';

const BILLING_NOTICE_KEY = 'ls_billing_notice';

/** Only this value is actionable enough to warrant a post-login banner. */
const ACTIONABLE_STATUS: BillingNoticeStatus = 'past_due';

function getSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    // Accessing sessionStorage can throw in sandboxed/SSR contexts.
  }
  return null;
}

/**
 * Persist (or clear) the post-login billing notice based on the server's
 * billingStatus signal. Storing 'past_due' arms the banner; any other value
 * clears a stale notice so it cannot leak across logins.
 */
export function storeBillingNotice(billingStatus: string | undefined): void {
  const store = getSessionStorage();
  if (!store) return;
  try {
    if (billingStatus === ACTIONABLE_STATUS) {
      store.setItem(BILLING_NOTICE_KEY, ACTIONABLE_STATUS);
    } else {
      store.removeItem(BILLING_NOTICE_KEY);
    }
  } catch (error) {
    LOGGER.warn(
      'Failed to store billing notice:',
      error instanceof Error ? error : String(error),
    );
  }
}

/**
 * Read the pending billing notice and remove it (one-shot). Returns the notice
 * status, or null when there is none.
 */
export function consumeBillingNotice(): BillingNoticeStatus | null {
  const store = getSessionStorage();
  if (!store) return null;
  try {
    const value = store.getItem(BILLING_NOTICE_KEY);
    if (value === ACTIONABLE_STATUS) {
      store.removeItem(BILLING_NOTICE_KEY);
      return ACTIONABLE_STATUS;
    }
  } catch (error) {
    LOGGER.warn(
      'Failed to read billing notice:',
      error instanceof Error ? error : String(error),
    );
  }
  return null;
}

/** Clear any pending billing notice (e.g. on logout). */
export function clearBillingNotice(): void {
  const store = getSessionStorage();
  if (!store) return;
  try {
    store.removeItem(BILLING_NOTICE_KEY);
  } catch {
    // best-effort cleanup
  }
}
