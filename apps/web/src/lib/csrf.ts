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
 * Store the CSRF token in localStorage so it persists across browser restarts
 * (matching the auth cookie lifetime). Falls back to an in-memory variable
 * when storage is unavailable.
 */
export function storeCsrfToken(token: string): void {
  inMemoryToken = token;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CSRF_STORAGE_KEY, token);
    }
  } catch {
    // Storage full or disabled — in-memory fallback is already set
  }
}

/**
 * Clear the stored CSRF token (e.g. on logout).
 */
export function clearCsrfToken(): void {
  inMemoryToken = '';
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
 * Read the CSRF token. Checks in-memory first, then localStorage
 * (works cross-origin), then falls back to `document.cookie` (same-origin only).
 * Returns an empty string if the token is not available.
 */
export function getCsrfToken(): string {
  // 1. In-memory (always available, set during this page session)
  if (inMemoryToken) return inMemoryToken;

  // 2. localStorage (persists across browser restarts)
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(CSRF_STORAGE_KEY);
      if (stored) {
        inMemoryToken = stored;
        return stored;
      }
    }
  } catch {
    // localStorage not available
  }

  // Fallback: read from cookie (only works when API is same-origin)
  if (typeof document === 'undefined') return '';

  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));

  return match ? match.substring(CSRF_COOKIE.length + 1) : '';
}
