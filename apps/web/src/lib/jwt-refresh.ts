import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar/web';
import { CSRF_HEADER, getCsrfToken, storeCsrfToken } from './csrf';
import { env } from '../config/environment';

// ─── Silent JWT refresh ────────────────────────────────────────────────────
//
// Extracted from apollo-client.ts (LS-8645) so hooks that only need the refresh
// helper (e.g. useIsPremium's proactive entitlement re-mint) can import it
// WITHOUT pulling in the ApolloClient module's side effects (createHttpLink
// requires a global fetch, which breaks jsdom component specs on import).

let refreshInFlight: Promise<string | null> | null = null;
let lastRefreshCompletedAt = 0;
let lastRefreshedToken: string | null = null;

// A repeatedly-erroring operation (e.g. a query whose mocked/misconfigured
// backend always returns UNAUTHENTICATED) retries once per occurrence via the
// Apollo error link, and each successful refresh dispatches
// `auth:token-refreshed` — which other hooks (e.g. useEntitlements) react to
// by refetching their own queries. Now that silentlyRefreshJwt has multiple
// independent callers (LS-8645), a burst of near-simultaneous callers must not
// each mint a fresh refresh + event dispatch: capping repeat calls to once per
// window collapses that into a single refresh, preventing a refresh -> event
// -> refetch -> error -> refresh feedback loop while staying transparent to
// the normal (infrequent) refresh triggers this function is designed for.
const REFRESH_COOLDOWN_MS = 2000;

/** Test-only: reset the cooldown/in-flight state between test cases. */
export function __resetJwtRefreshStateForTests(): void {
  refreshInFlight = null;
  lastRefreshCompletedAt = 0;
  lastRefreshedToken = null;
}

/**
 * Decode a JWT payload without signature verification.
 * Returns null if the token cannot be decoded.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * After a successful JWT refresh, update the cached user profile in
 * localStorage and notify the AuthProvider via a window event so the
 * UI immediately reflects any claim changes (e.g. accessLevel promotion).
 */
export function syncUserProfileFromJwt(jwt: string): void {
  const payload = decodeJwtPayload(jwt);
  if (!payload) return;

  const updatedProfile = {
    id: (payload['id'] as number) || 0,
    email: (payload['email'] as string) || '',
    username:
      (payload['username'] as string) ||
      (payload['name'] as string) ||
      'Unknown',
    picture: payload['picture'] as string | undefined,
    accessLevel: (payload['accessLevel'] as 'none' | 'admin') || 'none',
  };

  // Update the localStorage cache so page reloads also pick up the change.
  // Both writes are best-effort; errors (private browsing, quota) are silently ignored.
  const exp = payload['exp'] as number | undefined;
  try {
    localStorage.setItem('ls_user_profile', JSON.stringify(updatedProfile));
    if (exp) {
      localStorage.setItem('ls_token_expiry', String(exp));
    }
  } catch {
    // Storage unavailable — the event dispatch below is the primary mechanism
  }

  // Dispatch a window event so the AuthProvider can update React state
  // without tight coupling between the Apollo module and the React context.
  window.dispatchEvent(
    new CustomEvent('auth:token-refreshed', {
      detail: { user: updatedProfile, exp },
    }),
  );
}

/**
 * Silently refresh the JWT by calling the oauth proxy's /refresh-jwt endpoint.
 * The server reads the JWT from the HttpOnly cookie and returns a new one
 * (also set as a cookie). Deduplicates concurrent calls so only one network
 * request is made even when multiple queries fail simultaneously.
 *
 * After a successful refresh, the cached user profile in localStorage is
 * updated and an `auth:token-refreshed` event is dispatched so the
 * AuthProvider can reflect any claim changes (e.g. accessLevel) immediately.
 */
export async function silentlyRefreshJwt(): Promise<string | null> {
  // Deduplicate: if a refresh is already in-flight, wait for it
  if (refreshInFlight) {
    return refreshInFlight;
  }

  // Cooldown: a burst of callers within the window (e.g. a repeatedly-erroring
  // operation retrying in a tight cycle) reuses the last SUCCESSFUL result
  // instead of re-hitting the network and re-dispatching `auth:token-refreshed`
  // for each one — see REFRESH_COOLDOWN_MS above for why this matters. Only
  // short-circuits on a cached success: a failed refresh must not be cached,
  // or a transient failure would lock out real retries for the full window.
  if (
    lastRefreshedToken &&
    Date.now() - lastRefreshCompletedAt < REFRESH_COOLDOWN_MS
  ) {
    return lastRefreshedToken;
  }

  refreshInFlight = (async () => {
    try {
      const csrfToken = getCsrfToken();
      const response = await fetch(`${env.oauthProxyUrl}/refresh-jwt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
        },
        // Send the HttpOnly cookie so the server can read the current JWT
        credentials: 'include',
      });

      if (!response.ok) {
        // A 401 or 403 from the refresh endpoint is a definitive server-side
        // rejection — the session is invalid, not merely expired on the clock.
        // Signal the AuthProvider to clear local state so the user is prompted
        // to re-authenticate rather than being stuck in a 401 retry loop.
        // Other non-OK statuses (5xx, rate limits) are transient; do not force
        // logout for those.
        if (response.status === 401 || response.status === 403) {
          window.dispatchEvent(new CustomEvent('auth:session-expired'));
        }
        return null;
      }

      const result = (await response.json()) as {
        jwt?: string;
        csrfToken?: string;
      };
      if (!result.jwt) return null;

      // Persist the refreshed CSRF token so subsequent requests include it.
      if (result.csrfToken) {
        storeCsrfToken(result.csrfToken);
      }

      // Sync the cached user profile and notify the AuthProvider so the UI
      // immediately reflects any claim changes (e.g. accessLevel promotion).
      // The refreshed JWT is always the admin's real token (ls_jwt cookie).
      // During impersonation, the server also refreshes ls_imp_jwt in the
      // same response — no client-side coordination needed.
      syncUserProfileFromJwt(result.jwt);

      // The server also sets updated cookies automatically.
      // Return the token so the retry flow knows refresh succeeded.
      return result.jwt;
    } catch (err) {
      // Network errors (device offline, CORS, DNS) are expected — swallow silently.
      // Anything else (JSON parse failures, programming errors, missing config) is
      // a structural bug that must be surfaced in Sentry/Rollbar.
      const isNetworkError =
        err instanceof TypeError &&
        (err.message === 'Failed to fetch' ||
          err.message === 'NetworkError when attempting to fetch resource.' ||
          err.message === 'Network request failed');
      if (!isNetworkError) {
        const error = err instanceof Error ? err : new Error(String(err));
        LOGGER.error(
          'silentlyRefreshJwt: unexpected error during JWT refresh',
          error,
        );
        captureError(error, { context: 'silentlyRefreshJwt' });
      }
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  const token = await refreshInFlight;
  lastRefreshCompletedAt = Date.now();
  lastRefreshedToken = token;
  return token;
}
