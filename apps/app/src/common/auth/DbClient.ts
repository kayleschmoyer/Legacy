import {
  ApolloClient,
  CombinedGraphQLErrors,
  from,
  HttpLink,
  InMemoryCache,
  Observable,
  ServerError,
} from '@apollo/client';
import { ApolloLink } from '@apollo/client/link';
import { ErrorLink } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { setContext } from '@apollo/client/link/context';
import { config } from '@legacy-sports/app-config/native';
import { LOGGER } from '@legacy-sports/logging';
import { SecureStorageProvider } from '@legacy-sports/shared-components';
import { GetUserById, UserFragment } from '@legacy-sports/graphql';
import { INTERNAL_JWT_KEY, silentlyRefreshJwt } from './jwtRefresh';
import { emitSessionExpired } from './sessionEvents';

// ENTITLEMENTS_STALE bounded retry (LS-9067): the dominant trigger is
// transient webhook-propagation lag, not a genuine failure, so a single-shot
// retry fires the terminal fallback far more often than the underlying
// staleness actually warrants. Three total attempts (1 immediate + 2 backed
// off) absorb that race; worst-case added latency is bounded at ~3s
// (0 + 800 + 2000ms) — never unbounded.
const ENTITLEMENTS_STALE_MAX_ATTEMPTS = 3;
const ENTITLEMENTS_STALE_RETRY_DELAYS_MS = [0, 800, 2000];

// Extracted to module scope (rather than built inside the DbClient
// constructor) so unit tests can drive the ENTITLEMENTS_STALE / auth retry
// decision logic directly via `errorLink.request(...)`, mirroring
// apps/web/src/lib/apollo-client.ts's exported `errorLink`.
export const errorLink = new ErrorLink(({ error, operation, forward }) => {
  const is401 = ServerError.is(error) && error.statusCode === 401;
  const isUnauthenticated =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) =>
        (e.extensions?.['code'] as string | undefined) === 'UNAUTHENTICATED',
    );

  // Stale-entitlements refresh signal (LS-8643/LS-8645): the token is valid
  // but its Stripe-minted entitlement claim predates the user's
  // `entitlements_updated_at` marker. Silently re-mint the JWT and retry
  // the operation, up to ENTITLEMENTS_STALE_MAX_ATTEMPTS times with
  // backoff (LS-9067; a bounded counter, driven recursively rather than via
  // operation context re-entry — see below). Once the budget is exhausted,
  // fail safe — clear the session so the user drops to free and is
  // prompted to re-login (epic LS-8638 SHARED CONTRACTS #1).
  const isEntitlementsStale =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) =>
        (e.extensions?.['code'] as string | undefined) === 'ENTITLEMENTS_STALE',
    );

  if (isEntitlementsStale) {
    const initialAttempt = Number(
      operation.getContext()['entitlementsStaleAttempt'] ?? 0,
    );
    return new Observable<ApolloLink.Result>((observer) => {
      // A hard refresh failure (silentlyRefreshJwt resolves null — the
      // /refresh-jwt call itself failed, e.g. a transient network blip)
      // used to skip straight to the terminal fallback with zero retries.
      // That's too harsh: a momentary network hiccup isn't evidence the
      // user's entitlements are stuck, so it now consumes a retry slot
      // within the same bounded budget instead (LS-9067 follow-up). This
      // can't rely on the usual "replay via forward() re-enters errorLink"
      // mechanism the stale-again case uses, since there's no new operation
      // response to intercept — so it loops locally via recursion, driven
      // by the same attempt counter.
      const tryRefresh = (attempt: number) => {
        if (attempt >= ENTITLEMENTS_STALE_MAX_ATTEMPTS) {
          emitSessionExpired();
          observer.error(error);
          return;
        }

        const runAttempt = () => {
          silentlyRefreshJwt()
            .then((newToken) => {
              if (!newToken) {
                tryRefresh(attempt + 1);
                return;
              }
              operation.setContext({ entitlementsStaleAttempt: attempt + 1 });
              forward(operation).subscribe({
                next: (value) => observer.next(value),
                error: (err: unknown) => observer.error(err),
                complete: () => observer.complete(),
              });
            })
            .catch(() => {
              tryRefresh(attempt + 1);
            });
        };

        const delayMs = ENTITLEMENTS_STALE_RETRY_DELAYS_MS[attempt] ?? 0;
        if (delayMs > 0) {
          setTimeout(runAttempt, delayMs);
        } else {
          runAttempt();
        }
      };

      tryRefresh(initialAttempt);
    });
  }

  if (is401 || isUnauthenticated) {
    // Attempt a silent JWT refresh via /refresh-jwt and replay the
    // operation with the new token (authLink re-reads it from secure
    // storage). silentlyRefreshJwt() clears the session itself on a
    // definitive rejection, so here we just propagate the original error
    // when no fresh token comes back. This stops the 24h JWT expiry from
    // force-bouncing the user through a full Google Sign-In (LS-8103).
    return new Observable<ApolloLink.Result>((observer) => {
      silentlyRefreshJwt()
        .then((newToken) => {
          if (!newToken) {
            observer.error(error);
            return;
          }
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

  return;
});

interface GetMatchupByIdData {
  getMatchupById?: { id: number; updatedAt?: string | null } | null;
}

// A GraphQL response can be served from a CDN/Apollo-router cache. After a
// mobile network switch (e.g. WiFi → cellular mid-game), a forced refetch can
// land on a CDN-cached response that's older than what's already in the
// Apollo cache, rolling a displayed score backwards. Matchup.updatedAt is a
// server-authoritative freshness marker (auto-maintained by a DB trigger on
// every row update); this link compares it against what's already cached
// and drops an incoming response that's older, instead of letting Apollo's
// default cache write blindly overwrite the newer data with the stale
// snapshot (LS-6359).
//
// This can't be done as an InMemoryCache typePolicy `merge` function: by the
// time the (outer) Query.getMatchupById field's merge runs, the (inner)
// Matchup entity's own scalar fields have already been written into the
// same normalized cache slot the "existing" reference resolves to, so
// `existing` and `incoming` are indistinguishable — the comparison has to
// happen before the write, at the link level.
export function createStaleMatchupGuardLink(cache: InMemoryCache) {
  return new ApolloLink((operation, forward) => {
    if (operation.operationName !== 'GetMatchupById') {
      return forward(operation);
    }

    return new Observable<ApolloLink.Result>((observer) => {
      forward(operation).subscribe({
        next: (result) => {
          observer.next(dropStaleMatchupResult(result, cache, operation));
        },
        error: (err: unknown) => observer.error(err),
        complete: () => observer.complete(),
      });
    });
  });
}

function dropStaleMatchupResult(
  result: ApolloLink.Result,
  cache: InMemoryCache,
  operation: ApolloLink.Operation,
): ApolloLink.Result {
  const incoming = (result.data as GetMatchupByIdData | null | undefined)
    ?.getMatchupById;
  if (!incoming?.updatedAt) {
    return result;
  }

  let previous: GetMatchupByIdData | null;
  try {
    previous = cache.readQuery<GetMatchupByIdData>({
      query: operation.query,
      variables: operation.variables,
    });
  } catch {
    return result;
  }

  const previousMatchup = previous?.getMatchupById;
  if (
    !previousMatchup?.updatedAt ||
    incoming.updatedAt >= previousMatchup.updatedAt
  ) {
    return result;
  }

  LOGGER.warn('Dropped stale matchup refetch response', {
    matchupId: incoming.id,
    incomingUpdatedAt: incoming.updatedAt,
    cachedUpdatedAt: previousMatchup.updatedAt,
  });

  return {
    ...result,
    data: { ...result.data, getMatchupById: previousMatchup },
  };
}

export class DbClient {
  public readonly apolloClient: ApolloClient;

  constructor() {
    const httpLink = new HttpLink({
      uri: (operation) =>
        `${config.graphqlHost}?ref=${operation.operationName}`,
    });

    const authLink = setContext(async (_, prevContext) => {
      let token: string | null = null;
      try {
        token = await SecureStorageProvider.getItem(INTERNAL_JWT_KEY);
      } catch (err) {
        LOGGER.error(
          'Failed to read auth token for request',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
      return {
        headers: {
          ...(prevContext['headers'] as Record<string, unknown>),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      };
    });

    const retryLink = new RetryLink({
      delay: { initial: 300, max: 5000, jitter: true },
      attempts: {
        max: 3,
        retryIf: (error: unknown) =>
          error instanceof Error && !('statusCode' in error),
      },
    });

    const cache = new InMemoryCache();
    const staleMatchupGuardLink = createStaleMatchupGuardLink(cache);

    this.apolloClient = new ApolloClient({
      cache,
      link: from([
        staleMatchupGuardLink,
        retryLink,
        errorLink,
        authLink,
        httpLink,
      ]),
    });
  }

  public async getUserById(
    id: number,
  ): Promise<UserFragment | undefined | null> {
    const response = await this.apolloClient.query<{
      user: UserFragment | null;
    }>({
      query: GetUserById,
      variables: { id },
    });

    return response.data?.user ?? null;
  }
}
