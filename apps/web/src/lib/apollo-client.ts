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
import { env } from '../config/environment';

// GraphQL endpoint URL from centralized environment config
const GRAPHQL_URL = env.graphqlUrl;

// Debug logging to check what URL is being used
LOGGER.info('🔗 Apollo Client Configuration:');
LOGGER.info('GraphQL URL from env config:', GRAPHQL_URL);

const httpLink = createHttpLink({
  uri: (operation) => `${GRAPHQL_URL}?ref=${operation.operationName}`,
  headers: {
    'apollo-require-preflight': 'true',
  },
});

// Authentication link to add JWT token to requests
const authLink = setContext((_, { headers }) => {
  // Get the authentication token from local storage if it exists
  const token = localStorage.getItem('auth_jwt');

  // Return the headers to the context so httpLink can read them
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

// ─── Silent JWT refresh ────────────────────────────────────────────────────

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Silently refresh the JWT by calling the oauth proxy's /refresh-jwt endpoint.
 * Deduplicates concurrent calls so only one network request is made even when
 * multiple queries fail simultaneously with an auth error.
 */
async function silentlyRefreshJwt(): Promise<string | null> {
  // Deduplicate: if a refresh is already in-flight, wait for it
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const currentToken = localStorage.getItem('auth_jwt');
  if (!currentToken) return null;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${env.oauthProxyUrl}/refresh-jwt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) return null;

      const result = (await response.json()) as { jwt?: string };
      if (!result.jwt) return null;

      // Persist the new token immediately so retried requests pick it up
      localStorage.setItem('auth_jwt', result.jwt);
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

const errorLink = new ErrorLink(({ error, operation, forward }) => {
  // Check for UNAUTHENTICATED GraphQL error
  const isUnauthenticated =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) =>
        (e.extensions?.['code'] as string | undefined) === 'UNAUTHENTICATED',
    );

  // Check for 401 HTTP error
  const is401 = ServerError.is(error) && error.statusCode === 401;

  if (!isUnauthenticated && !is401) {
    // Surface uncaught errors to the user via the global ApolloErrorToast.
    if (CombinedGraphQLErrors.is(error) && error.errors.length > 0) {
      dispatchApolloError(
        error.errors[0]?.message ?? 'An unexpected error occurred',
      );
    } else if (ServerError.is(error)) {
      dispatchApolloError(
        `Server error (${error.statusCode.toString()}): please try again`,
      );
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
    return;
  }

  // Attempt a silent refresh and retry the operation once
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
