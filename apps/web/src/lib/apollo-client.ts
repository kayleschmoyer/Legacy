import {
  ApolloClient,
  CombinedGraphQLErrors,
  createHttpLink,
  from,
  InMemoryCache,
  Observable,
  ServerError,
} from '@apollo/client';
import { ErrorLink } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { setContext } from '@apollo/client/link/context';
import type { ApolloLink } from '@apollo/client/link';
import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar/web';
import { CSRF_HEADER, getCsrfToken, storeCsrfToken } from './csrf';
import { env } from '../config/environment';

// GraphQL endpoint URL from centralized environment config
const GRAPHQL_URL = env.graphqlUrl;

const httpLink = createHttpLink({
  uri: (operation) => `${GRAPHQL_URL}?ref=${operation.operationName}`,
  headers: {
    'apollo-require-preflight': 'true',
  },
  // Send HttpOnly cookies (ls_jwt) with every request
  credentials: 'include',
});

// Authentication link — sends the CSRF double-submit token so the server
// can validate that the request originated from our frontend.
// JWT auth is carried by HttpOnly cookies (credentials: 'include'):
//   - ls_jwt:     regular user session
//   - ls_imp_jwt: admin impersonation session (takes priority server-side)
// No tokens are stored in localStorage — both cookies are HttpOnly and
// inaccessible to JavaScript, preventing XSS-based token theft.
const authLink = setContext((_, { headers }) => {
  const csrfToken = getCsrfToken();

  return {
    headers: {
      ...headers,
      ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
    },
  };
});

// ─── Silent JWT refresh ────────────────────────────────────────────────────

let refreshInFlight: Promise<string | null> | null = null;

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
    accessLevel:
      (payload['accessLevel'] as 'none' | 'user' | 'admin') || 'user',
  };

  // Update the localStorage cache so page reloads also pick up the change
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ls_user_profile', JSON.stringify(updatedProfile));
    }
  } catch {
    // Storage unavailable — the event dispatch below is the primary mechanism
  }

  // Persist the token expiry for proactive-refresh scheduling
  const exp = payload['exp'] as number | undefined;
  if (exp) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ls_token_expiry', String(exp));
      }
    } catch {
      // ignore
    }
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
async function silentlyRefreshJwt(): Promise<string | null> {
  // Deduplicate: if a refresh is already in-flight, wait for it
  if (refreshInFlight) {
    return refreshInFlight;
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

      if (!response.ok) return null;

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
          error.message,
        );
        captureError(error, { context: 'silentlyRefreshJwt' });
      }
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// ─── Dispatch a window event so the ApolloErrorToast component can display it ──

function dispatchApolloError(message: string): void {
  window.dispatchEvent(
    new CustomEvent('apollo:error', { detail: { message } }),
  );
}

// ─── Retry link for transient network errors (LS-900) ──────────────────────

const retryLink = new RetryLink({
  delay: { initial: 300, max: 5000, jitter: true },
  attempts: {
    max: 3,
    retryIf: (error: unknown) => {
      // Only retry network-level failures (e.g. "Failed to fetch"), not
      // HTTP responses (4xx/5xx) which have a statusCode.
      if (error instanceof Error && !('statusCode' in error)) {
        return true;
      }
      return false;
    },
  },
});

// ─── Error link with token-refresh + retry ─────────────────────────────────

export const errorLink = new ErrorLink(({ error, operation, forward }) => {
  // Check for UNAUTHENTICATED GraphQL error
  const isUnauthenticated =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) =>
        (e.extensions?.['code'] as string | undefined) === 'UNAUTHENTICATED',
    );

  // Check for 401 HTTP error
  const is401 = ServerError.is(error) && error.statusCode === 401;

  // Allow callers to opt out of the global toast by passing
  // `context: { suppressGlobalError: true }` in the mutation/query options.
  const suppressGlobalError = Boolean(
    operation.getContext()['suppressGlobalError'],
  );

  // Auth errors (UNAUTHENTICATED / 401) → attempt a silent token refresh and retry.
  // These are not reported to Rollbar: an expired/invalid token is an expected
  // user-facing condition, not a bug.
  if (isUnauthenticated || is401) {
    return new Observable<ApolloLink.Result>((observer) => {
      silentlyRefreshJwt()
        .then((newToken) => {
          if (!newToken) {
            // Refresh failed — propagate the original error
            observer.error(error);
            return;
          }

          // Retry the original operation; authLink will pick up the updated token
          forward(operation).subscribe({
            next: (value) => observer.next(value),
            error: (err: unknown) => observer.error(err),
            complete: () => observer.complete(),
          });
        })
        .catch((err: unknown) => {
          observer.error(err);
        });
    });
  }

  // Non-auth errors: surface to the user via the global ApolloErrorToast and
  // report to Rollbar — unless the caller explicitly suppressed the global error.
  if (!suppressGlobalError) {
    if (CombinedGraphQLErrors.is(error) && error.errors.length > 0) {
      // PREMIUM_REQUIRED is an expected user-facing condition (free-tier access
      // attempt on a premium feature). Show the descriptive server message so the
      // user understands why they were blocked; do NOT report to Rollbar.
      const premiumError = error.errors.find(
        (e) =>
          (e.extensions?.['code'] as string | undefined) === 'PREMIUM_REQUIRED',
      );

      dispatchApolloError(
        premiumError?.message ??
          error.errors[0]?.message ??
          'An unexpected error occurred',
      );

      if (!premiumError) {
        // Unexpected server errors are captured explicitly so Rollbar items
        // include the operation name for easy diagnosis.
        captureError(
          error instanceof Error ? error : new Error(String(error)),
          { context: `apollo:${operation.operationName}` },
        );
      }
    } else if (ServerError.is(error)) {
      dispatchApolloError(
        `Server error (${error.statusCode.toString()}): please try again`,
      );
      captureError(error instanceof Error ? error : new Error(String(error)), {
        context: `apollo:${operation.operationName}`,
      });
    } else if (error instanceof Error) {
      // Transient network errors (e.g. "Failed to fetch") surface a
      // user-friendly message instead of the raw TypeError text.
      const isNetworkError =
        error.message === 'Failed to fetch' ||
        error.message === 'NetworkError when attempting to fetch resource.' ||
        error.message === 'Network request failed';
      dispatchApolloError(
        isNetworkError
          ? 'Network error — please check your connection and try again'
          : error.message,
      );
    } else {
      dispatchApolloError('An unexpected error occurred');
    }
  }
});

export const apolloClient = new ApolloClient({
  link: from([retryLink, errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all',
    },
    query: {
      errorPolicy: 'all',
    },
  },
});
