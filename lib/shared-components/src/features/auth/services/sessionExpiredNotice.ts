/**
 * One-shot "your session expired" notice (LS-10447).
 *
 * When the server definitively rejects a session refresh (401/403 from
 * /oauth/refresh-jwt), the AuthProvider clears local auth state and the auth
 * guard swaps in the login screen. Without a notice that looks like a random
 * sign-out, so the involuntary-logout paths arm this flag and the login screen
 * consumes it to explain what happened. An explicit user logout never arms it.
 *
 * Session-scoped (clears on tab close) and guarded by a `typeof` check so the
 * shared service stays safe on platforms (e.g. React Native) where Web Storage
 * is unavailable — mirrors billingNotice.ts.
 */

const SESSION_EXPIRED_NOTICE_KEY = 'ls_session_expired_notice';

/** User-facing copy shown on the login screen after an involuntary logout. */
export const SESSION_EXPIRED_MESSAGE =
  'Your session expired. Please sign in again to pick up where you left off.';

function getSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    // Accessing sessionStorage can throw in sandboxed/SSR contexts.
  }
  return null;
}

/** Arm the notice after the server rejected the session. */
export function markSessionExpiredNotice(): void {
  try {
    getSessionStorage()?.setItem(SESSION_EXPIRED_NOTICE_KEY, '1');
  } catch {
    // best-effort — the logout itself still happens
  }
}

/**
 * Read the pending notice and remove it (one-shot). Returns true when the
 * last logout was an involuntary session expiry.
 */
export function consumeSessionExpiredNotice(): boolean {
  const store = getSessionStorage();
  if (!store) return false;
  try {
    const armed = store.getItem(SESSION_EXPIRED_NOTICE_KEY) !== null;
    if (armed) store.removeItem(SESSION_EXPIRED_NOTICE_KEY);
    return armed;
  } catch {
    return false;
  }
}
