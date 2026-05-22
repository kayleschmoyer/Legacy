import { randomBytes, timingSafeEqual } from 'crypto';

/**
 * Cookie that stores the OAuth CSRF state token. Bound to the browser
 * that initiated the flow; verified on the callback (or token POST) to
 * prevent OAuth login CSRF / session-fixation.
 */
export const OAUTH_STATE_COOKIE = 'ls_oauth_state';

/** 10 minutes — matches typical OAuth authorize-to-callback budget. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

/** Separator between the CSRF token and a piggy-backed device code. */
const STATE_SEPARATOR = '.';

/**
 * Generate a cryptographically random state token (32 bytes, hex-encoded).
 */
export function generateOauthState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Compose the state value sent to the OAuth provider. When a device code is
 * supplied (CLI device flow) it is appended after the CSRF token so the
 * callback can both verify the CSRF binding and recover the device code.
 */
export function encodeOauthState(
  csrfToken: string,
  deviceCode?: string,
): string {
  if (!deviceCode) return csrfToken;
  return `${csrfToken}${STATE_SEPARATOR}${deviceCode}`;
}

/**
 * Inverse of {@link encodeOauthState}. Returns the CSRF token and any
 * trailing device code. Missing/empty values are returned as the empty string
 * for the CSRF token (callers must treat that as an invalid match).
 */
export function decodeOauthState(state: string | undefined | null): {
  csrfToken: string;
  deviceCode: string;
} {
  if (!state) return { csrfToken: '', deviceCode: '' };
  const idx = state.indexOf(STATE_SEPARATOR);
  if (idx === -1) return { csrfToken: state, deviceCode: '' };
  return {
    csrfToken: state.slice(0, idx),
    deviceCode: state.slice(idx + 1),
  };
}

function isLocalDev(): boolean {
  return (
    process.env['IS_LOCAL'] === 'true' ||
    process.env['NODE_ENV'] === 'development'
  );
}

function stateCookieAttrs(): string {
  // SameSite=Lax (not Strict): the OAuth provider redirects the browser back
  // to our callback as a top-level navigation; Strict would drop the cookie
  // on that cross-site redirect and break the flow. Lax preserves it on
  // top-level GETs while still blocking it on cross-site sub-resource
  // requests, which is the CSRF property we need.
  if (isLocalDev()) return 'SameSite=Lax; Path=/';
  return 'Secure; SameSite=Lax; Path=/';
}

/**
 * Build the Set-Cookie value that pins the CSRF state token to the initiating
 * browser. HttpOnly so JS cannot read it (defense in depth against XSS).
 */
export function buildOauthStateCookie(csrfToken: string): string {
  return `${OAUTH_STATE_COOKIE}=${csrfToken}; HttpOnly; ${stateCookieAttrs()}; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}`;
}

/**
 * Build the Set-Cookie value that clears the state cookie. Emitted on both
 * success and failure of the callback so the token is single-use.
 */
export function buildClearOauthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; ${stateCookieAttrs()}; Max-Age=0`;
}

/**
 * Read the CSRF state value out of the request Cookie header.
 * Returns null if the cookie is absent.
 */
export function parseOauthStateFromCookies(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const raw of parts) {
    const trimmed = raw.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq);
    if (name !== OAUTH_STATE_COOKIE) continue;
    const value = trimmed.slice(eq + 1);
    return value || null;
  }
  return null;
}

/**
 * Constant-time compare of the received CSRF token against the cookie value.
 * Returns true only when both are non-empty and equal.
 */
export function verifyOauthState(
  receivedCsrfToken: string | undefined | null,
  cookieHeader: string | undefined,
): boolean {
  if (!receivedCsrfToken) return false;
  const cookieValue = parseOauthStateFromCookies(cookieHeader);
  if (!cookieValue) return false;
  if (receivedCsrfToken.length !== cookieValue.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(receivedCsrfToken),
      Buffer.from(cookieValue),
    );
  } catch {
    return false;
  }
}
