import { LOGGER } from '@legacy-sports/logging';
import { SecureStorageProvider } from '@legacy-sports/shared-components';
import { resolveOAuthProxyUrl } from './mobileOAuthConfig';
import { emitSessionExpired } from './sessionEvents';

/** Secure-storage key for the internal Legacy Sports JWT (sent as a Bearer token). */
export const INTERNAL_JWT_KEY = 'INTERNAL_JWT';

// Deduplicate concurrent refreshes: when several queries fail with 401 at the
// same moment, only one `/refresh-jwt` round-trip should be made. Reset to null
// in the `finally` so the next genuine expiry can refresh again.
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Silently refresh the internal JWT via the oauth-proxy `/refresh-jwt`
 * endpoint, mirroring the web client (`apps/web/src/lib/apollo-client.ts`) for
 * the mobile Bearer transport.
 *
 * The stored JWT is sent as `Authorization: Bearer`; the backend handler
 * (`lambdas/oauth-proxy/src/handlers/RefreshJwt.ts`) accepts that without a CSRF
 * token (the CSRF double-submit only guards the cookie path) and reissues a JWT
 * up to a 7-day grace window past expiry.
 *
 * Failure handling distinguishes session failures from transient ones:
 *  - Missing proxy config, no stored token, or a 401/403 from the endpoint are
 *    *definitive* — the session is cleared via `emitSessionExpired()` so the
 *    user is routed to login instead of looping on 401.
 *  - 5xx / rate-limit / network failures are *transient* — they return null
 *    WITHOUT clearing the session, so a flaky connection never logs the user out.
 *
 * Returns the new JWT on success, or null on any failure.
 */
export async function silentlyRefreshJwt(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const oauthProxyUrl = resolveOAuthProxyUrl();
      if (!oauthProxyUrl) {
        LOGGER.warn(
          'silentlyRefreshJwt: OAuth proxy URL is not configured — clearing session',
        );
        emitSessionExpired();
        return null;
      }

      let token: string | null = null;
      try {
        token = await SecureStorageProvider.getItem(INTERNAL_JWT_KEY);
      } catch (err) {
        LOGGER.error(
          'silentlyRefreshJwt: failed to read stored token',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
      if (!token) {
        emitSessionExpired();
        return null;
      }

      const response = await fetch(`${oauthProxyUrl}/refresh-jwt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Bearer transport: the backend reads the JWT from this header and
          // skips CSRF, unlike the web cookie path.
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Definitive rejection: the token is past the grace window or invalid.
          emitSessionExpired();
        }
        // 5xx / rate-limit are transient — leave the session intact.
        return null;
      }

      const result = (await response.json()) as { jwt?: string };
      if (!result.jwt) {
        return null;
      }

      await SecureStorageProvider.setItem(INTERNAL_JWT_KEY, result.jwt);
      return result.jwt;
    } catch (err) {
      // Network failure (device offline, DNS) is expected — do not clear the
      // session; the original error simply surfaces and the next request retries.
      LOGGER.warn(
        'silentlyRefreshJwt: refresh request failed',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
