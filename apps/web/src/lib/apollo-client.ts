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
import { setContext } from '@apollo/client/link/context';
import type { ApolloLink } from '@apollo/client/link';
import { env } from '../config/environment';

// GraphQL endpoint URL from centralized environment config
const GRAPHQL_URL = env.graphqlUrl;

// Debug logging to check what URL is being used
console.log('🔗 Apollo Client Configuration:');
console.log('GraphQL URL from env config:', GRAPHQL_URL);

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
    } catch {
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
      dispatchApolloError(error.message);
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
  link: from([errorLink, authLink, httpLink]),
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
