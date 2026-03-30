/**
 * CSRF double-submit utilities.
 *
 * The server returns the CSRF token in the response body on login and refresh.
 * The frontend stores it in localStorage (persists across browser restarts to
 * match the 24h auth cookie lifetime) and attaches it as the `X-CSRF-Token`
 * header on every request. The server validates that the header matches the
 * `ls_csrf` cookie (which the browser sends automatically).
 *
 * localStorage is necessary because the `ls_csrf` cookie lives on the API
 * domain (cross-origin) and is not readable via `document.cookie` on the
 * web app domain.
 */

const CSRF_COOKIE = 'ls_csrf';
const CSRF_STORAGE_KEY = 'ls_csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/** In-memory fallback when localStorage is unavailable (privacy mode, etc.) */
let inMemoryToken = '';

/**
 * Set to the stale localStorage value when setItem fails (e.g. QuotaExceededError).
 * getCsrfToken() prefers the in-memory token when localStorage still holds this
 * stale value, but recovers automatically when another code path writes a newer token.
 */
let staleStorageValue: string | null = null;

/**
 * Store the CSRF token in localStorage so it persists across browser restarts
 * (matching the auth cookie lifetime). Falls back to an in-memory variable
 * when storage is unavailable.
 */
export function storeCsrfToken(token: string): void {
  inMemoryToken = token;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CSRF_STORAGE_KEY, token);
      staleStorageValue = null;
    }
  } catch {
    // Record the stale value left in localStorage so getCsrfToken can
    // distinguish it from a newer value written by another code path.
    try {
      staleStorageValue = localStorage.getItem(CSRF_STORAGE_KEY);
    } catch {
      staleStorageValue = '';
    }
  }
}

/**
 * Clear the stored CSRF token (e.g. on logout).
 */
export function clearCsrfToken(): void {
  inMemoryToken = '';
  staleStorageValue = null;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CSRF_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  // Also clean up legacy sessionStorage key if present
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(CSRF_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Read the CSRF token. Checks localStorage first (shared source of truth
 * across all code paths), then in-memory fallback, then `document.cookie`.
 *
 * localStorage is checked before in-memory because multiple independent code
 * paths update the CSRF token (Apollo error link and AuthService proactive
 * refresh). Each has its own in-memory variable, but both write to the same
 * localStorage key. Reading localStorage first ensures we always get the
 * latest token, preventing stale in-memory values from causing CSRF mismatches
 * after concurrent refresh races.
 */
export function getCsrfToken(): string {
  // 1. localStorage (single source of truth shared between all code paths).
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(CSRF_STORAGE_KEY);
      if (stored) {
        if (staleStorageValue !== null && stored === staleStorageValue) {
          // localStorage still holds the stale value from before the write
          // failure — prefer the in-memory token which is newer.
          if (inMemoryToken) return inMemoryToken;
        }
        // Either no write failure, or localStorage was updated by another code
        // path (recovered) — use the stored value.
        staleStorageValue = null;
        inMemoryToken = stored;
        return stored;
      }
    }
  } catch {
    // localStorage not available — fall through to in-memory
  }

  // 2. In-memory fallback (when localStorage is unavailable or after write failure)
  if (inMemoryToken) return inMemoryToken;

  // 3. Cookie fallback (only works when API is same-origin)
  if (typeof document === 'undefined') return '';

  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));

  return match ? match.substring(CSRF_COOKIE.length + 1) : '';
}
