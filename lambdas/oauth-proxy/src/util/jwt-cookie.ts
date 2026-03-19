import { randomBytes } from 'crypto';

/**
 * Cookie name for the HttpOnly JWT cookie.
 * This cookie is NOT accessible to JavaScript.
 */
export const JWT_COOKIE = 'ls_jwt';

/**
 * Cookie name for the CSRF double-submit token.
 * This cookie IS accessible to JavaScript so the frontend can read it
 * and send it as a request header for CSRF validation.
 */
export const CSRF_COOKIE = 'ls_csrf';

/** Header name the frontend must send with the CSRF token value. */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Generate a cryptographically random CSRF token (32 bytes, hex-encoded).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Whether we're running in local development (HTTP, no TLS).
 * `Secure` cookies cannot be set over plain HTTP, so we omit the flag
 * and fall back to `SameSite=Lax` (browsers reject `SameSite=None` without `Secure`).
 */
function isLocalDev(): boolean {
  return (
    process.env['IS_LOCAL'] === 'true' ||
    process.env['NODE_ENV'] === 'development'
  );
}

/** Cookie attributes that vary between local dev and deployed environments. */
function cookieAttrs(domain?: string): string {
  if (isLocalDev()) return 'SameSite=Lax; Path=/';
  const domainAttr = domain ? `; Domain=.${domain}` : '';
  return `Secure; SameSite=None; Path=/${domainAttr}`;
}

/**
 * Build Set-Cookie header values for the JWT and CSRF cookies.
 *
 * Returns an array of cookie strings suitable for `multiValueHeaders['Set-Cookie']`.
 *
 * Security attributes:
 * - **ls_jwt**: HttpOnly (not JS-accessible), Secure (HTTPS only), SameSite=None
 *   (required for cross-origin API requests), Path=/
 * - **ls_csrf**: NOT HttpOnly (JS must read it), Secure, SameSite=None, Path=/
 *
 * Both cookies use SameSite=None because the web frontend and Lambda API may
 * be on different origins (e.g. legacy-fantasy.com vs *.execute-api.amazonaws.com).
 * CSRF protection is provided by the double-submit cookie pattern: the frontend
 * reads ls_csrf and sends it as the X-CSRF-Token header on every request.
 *
 * In local development (HTTP), `Secure` is omitted and `SameSite=Lax` is used
 * because browsers reject `SameSite=None` without the `Secure` flag.
 *
 * When `COOKIE_DOMAIN` env var is set (e.g. `legacy-fantasy.com`), the cookies
 * are scoped to `.legacy-fantasy.com` so all subdomains (api., ws.) can send
 * them — required for the WebSocket Lambda to receive the ls_jwt cookie.
 */
export function buildAuthCookies(jwt: string, csrfToken: string): string[] {
  const maxAge = 24 * 60 * 60; // 24 hours — matches JWT expiry
  const domain = process.env['COOKIE_DOMAIN'] || undefined;
  const attrs = cookieAttrs(domain);

  return [
    `${JWT_COOKIE}=${jwt}; HttpOnly; ${attrs}; Max-Age=${maxAge}`,
    `${CSRF_COOKIE}=${csrfToken}; ${attrs}; Max-Age=${maxAge}`,
  ];
}

/**
 * Build Set-Cookie headers that clear the JWT and CSRF cookies (on logout).
 */
export function buildClearAuthCookies(): string[] {
  const domain = process.env['COOKIE_DOMAIN'] || undefined;
  const attrs = cookieAttrs(domain);
  return [
    `${JWT_COOKIE}=; HttpOnly; ${attrs}; Max-Age=0`,
    `${CSRF_COOKIE}=; ${attrs}; Max-Age=0`,
  ];
}

/**
 * Parse the JWT from the Cookie header string.
 * Returns null if the ls_jwt cookie is not present.
 */
export function parseJwtFromCookies(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === JWT_COOKIE) {
      const value = valueParts.join('='); // JWT contains '=' in base64
      return value || null;
    }
  }
  return null;
}

/**
 * Parse the CSRF token from the Cookie header string.
 * Returns null if the ls_csrf cookie is not present.
 */
export function parseCsrfFromCookies(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === CSRF_COOKIE) {
      return valueParts.join('=') || null;
    }
  }
  return null;
}

/**
 * Validate the CSRF double-submit: the X-CSRF-Token request header must
 * match the ls_csrf cookie value. Returns true when valid.
 */
export function validateCsrf(
  csrfHeader: string | undefined,
  cookieHeader: string | undefined,
): boolean {
  if (!csrfHeader) return false;
  const cookieCsrf = parseCsrfFromCookies(cookieHeader);
  if (!cookieCsrf) return false;

  // Constant-time comparison to avoid timing attacks
  if (csrfHeader.length !== cookieCsrf.length) return false;
  let result = 0;
  for (let i = 0; i < csrfHeader.length; i++) {
    result |= csrfHeader.charCodeAt(i) ^ cookieCsrf.charCodeAt(i);
  }
  return result === 0;
}
