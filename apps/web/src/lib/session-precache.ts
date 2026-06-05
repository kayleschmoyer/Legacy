/**
 * Discord / OAuth session pre-cache utilities.
 *
 * After a successful Discord OAuth exchange the server returns a signed JWT.
 * We decode the payload client-side and write a user-profile hint plus the
 * token-expiry timestamp to localStorage **before** redirecting to the app.
 * This lets AuthProvider hydrate the UI instantly (no loading flash) while the
 * real session is established via the HttpOnly cookie.
 *
 * PRE-CACHE CONTRACT:
 *  - Data stored here is UNTRUSTED / UI-only.  It is derived from a
 *    client-side JWT decode; the signature is NOT verified in the browser.
 *  - Both keys (`ls_user_profile`, `ls_token_expiry`) are **always cleared on
 *    logout** via `AuthService.clearTokens()`.
 *  - On every page load `useAuth` fires a background JWT refresh; the
 *    authoritative server response overwrites the cached profile once the
 *    refresh completes.
 *  - Empty / stub profiles are rejected: `id` (non-zero) and `email`
 *    (non-empty) must both be present in the decoded payload, otherwise no
 *    write is performed and the UI falls back to the server round-trip.
 */

const USER_PROFILE_KEY = 'ls_user_profile';
const TOKEN_EXPIRY_KEY = 'ls_token_expiry';

/**
 * Decode a JWT payload and write a pre-cache user profile + token expiry to
 * localStorage so AuthProvider can hydrate the UI on the next page load
 * without waiting for a network round-trip.
 *
 * Silently no-ops when:
 *  - The JWT is malformed (not three dot-separated segments)
 *  - The decoded payload is missing `id` or `email` (rejects `?? 0`/`?? ''` stubs)
 *  - localStorage is unavailable (SSR, private-browsing quota)
 *
 * @param jwt - Raw JWT string returned by the OAuth endpoint.
 */
export function storeDiscordSessionPreCache(jwt: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return;

    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as {
      id?: number;
      email?: string;
      username?: string;
      name?: string;
      picture?: string;
      accessLevel?: string;
      exp?: number;
    };

    // Reject stubs — only write when the JWT carries a real user identity.
    if (!payload.id || !payload.email) return;

    const profile = {
      id: payload.id,
      email: payload.email,
      username: payload.username ?? payload.name ?? 'Unknown',
      picture: payload.picture,
      accessLevel: payload.accessLevel ?? 'none',
    };

    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    if (payload.exp) {
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(payload.exp));
    }
  } catch {
    // Best-effort — AuthProvider will restore the session from the HttpOnly
    // cookie on the next page load even if the pre-cache write fails.
  }
}
