/**
 * CSRF double-submit cookie utilities.
 *
 * The server sets a non-HttpOnly `ls_csrf` cookie on login. The frontend
 * reads it here and attaches it as the `X-CSRF-Token` header on every
 * request. The server validates that the header matches the cookie.
 */

const CSRF_COOKIE = 'ls_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Read the CSRF token from the `ls_csrf` cookie.
 * Returns an empty string if the cookie is not present (e.g. not logged in).
 */
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';

  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));

  return match ? match.substring(CSRF_COOKIE.length + 1) : '';
}
