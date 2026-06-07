import { randomBytes, timingSafeEqual } from 'crypto';

/**
 * Cookie that stores the OAuth CSRF state token. Bound to the browser
 * that initiated the flow; verified on the callback (or token POST) to
 * prevent OAuth login CSRF / session-fixation.
 *
 * This is the default/shared name. Flows that can run concurrently in
 * separate browser tabs against the same authorize endpoint must use a
 * flow-specific name so their state cookies do not clobber each other —
 * see {@link OAUTH_STATE_COOKIE_LOGIN} / {@link OAUTH_STATE_COOKIE_LINK}.
 */
export const OAUTH_STATE_COOKIE = 'ls_oauth_state';

/**
 * Flow-specific state cookie for the Discord *sign-in* flow
 * (`/oauth/discord/authorize` without `link=1` → `/oauth/discord`).
 * Distinct from {@link OAUTH_STATE_COOKIE_LINK} so a sign-in tab and a
 * link tab open at the same time do not overwrite each other's state
 * (LS-6661).
 */
export const OAUTH_STATE_COOKIE_LOGIN = 'ls_oauth_state_login';

/**
 * Flow-specific state cookie for the Discord *account-link* flow
 * (`/oauth/discord/authorize?link=1` → `/oauth/discord/link`). Distinct
 * from {@link OAUTH_STATE_COOKIE_LOGIN} (LS-6661).
 */
export const OAUTH_STATE_COOKIE_LINK = 'ls_oauth_state_link';

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
 *
 * `cookieName` defaults to the shared {@link OAUTH_STATE_COOKIE}; pass a
 * flow-specific name (e.g. {@link OAUTH_STATE_COOKIE_LOGIN}) when the flow can
 * run concurrently with another in a separate tab.
 */
export function buildOauthStateCookie(
  csrfToken: string,
  cookieName: string = OAUTH_STATE_COOKIE,
): string {
  return `${cookieName}=${csrfToken}; HttpOnly; ${stateCookieAttrs()}; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}`;
}

/**
 * Build the Set-Cookie value that clears the state cookie. Emitted on both
 * success and failure of the callback so the token is single-use.
 *
 * `cookieName` must match the name used when the cookie was set.
 */
export function buildClearOauthStateCookie(
  cookieName: string = OAUTH_STATE_COOKIE,
): string {
  return `${cookieName}=; HttpOnly; ${stateCookieAttrs()}; Max-Age=0`;
}

/**
 * Read the CSRF state value out of the request Cookie header.
 * Returns null if the cookie is absent.
 *
 * `cookieName` must match the name used when the cookie was set.
 */
export function parseOauthStateFromCookies(
  cookieHeader: string | undefined,
  cookieName: string = OAUTH_STATE_COOKIE,
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const raw of parts) {
    const trimmed = raw.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq);
    if (name !== cookieName) continue;
    const value = trimmed.slice(eq + 1);
    return value || null;
  }
  return null;
}

/**
 * Constant-time compare of the received CSRF token against the cookie value.
 * Returns true only when both are non-empty and equal.
 *
 * `cookieName` selects which state cookie to verify against — pass the
 * flow-specific name so concurrent flows verify their own binding.
 */
export function verifyOauthState(
  receivedCsrfToken: string | undefined | null,
  cookieHeader: string | undefined,
  cookieName: string = OAUTH_STATE_COOKIE,
): boolean {
  if (!receivedCsrfToken) return false;
  const cookieValue = parseOauthStateFromCookies(cookieHeader, cookieName);
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
