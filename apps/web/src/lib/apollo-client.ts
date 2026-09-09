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
import type { FieldNode } from 'graphql';
import { captureError } from '@legacy-sports/rollbar/web';
import { CSRF_HEADER, getCsrfToken } from './csrf';
import {
  decodeJwtPayload,
  silentlyRefreshJwt,
  syncUserProfileFromJwt,
} from './jwt-refresh';
import { env } from '../config/environment';

// Re-exported for backwards compatibility — these helpers moved to
// ./jwt-refresh (LS-8645) so non-Apollo modules can import the refresh helper
// without triggering this module's ApolloClient side effects.
export { decodeJwtPayload, silentlyRefreshJwt, syncUserProfileFromJwt };

const httpLink = createHttpLink({
  uri: (operation) => `${env.graphqlUrl}?ref=${operation.operationName}`,
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

// ─── Rate-limit retry link (HTTP 429 / 503) — LS-8138 ──────────────────────
// The transient-network `retryLink` above deliberately skips HTTP responses, so
// a 429 (Too Many Requests) or 503 (Service Unavailable) from a momentarily
// saturated backend surfaces as a hard query failure with no retry — the UI
// renders empty and never recovers without a manual reload. This was the
// dominant root cause of the integration-suite "content never appears" tail:
// under the shared live backend's load the browser's Apollo queries 429 with no
// retry, so matchup/roster/search content never renders (the test-harness
// `gqlFetch` calls already get Retry-After backoff via retry-with-backoff.ts,
// but the browser app did not). A 429/503 means the request was rejected
// *before* processing, so re-sending is safe even for mutations (no
// double-apply). Placed innermost (just before `httpLink`) so it absorbs the
// retries transparently below `errorLink` — a transient 429 that succeeds on
// retry never flashes the global error toast. Bounded (max 4) with capped
// exponential backoff + full jitter so it cannot become a retry storm.
const rateLimitRetryLink = new RetryLink({
  delay: { initial: 500, max: 8000, jitter: true },
  attempts: {
    max: 4,
    retryIf: (error: unknown) =>
      ServerError.is(error) &&
      (error.statusCode === 429 || error.statusCode === 503),
  },
});

// ─── Error link with token-refresh + retry ─────────────────────────────────

// ENTITLEMENTS_STALE bounded retry (LS-9067): the dominant trigger is
// transient webhook-propagation lag (Stripe entitlements bump landing after
// the JWT refresh has already re-read the row), not a genuine failure, so a
// single-shot retry fires the terminal fallback far more often than the
// underlying staleness actually warrants. Three total attempts (1 immediate +
// 2 backed off) absorb that race; worst-case added latency is bounded at
// ~3s (0 + 800 + 2000ms) — never unbounded.
const ENTITLEMENTS_STALE_MAX_ATTEMPTS = 3;
const ENTITLEMENTS_STALE_RETRY_DELAYS_MS = [0, 800, 2000];

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

  // Check for the stale-entitlements refresh signal (LS-8643/LS-8645): the token
  // is still valid but its Stripe-minted entitlement claim predates the user's
  // `entitlements_updated_at` marker, so the server rejected the request with
  // `ENTITLEMENTS_STALE` to force a silent re-mint.
  const isEntitlementsStale =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) =>
        (e.extensions?.['code'] as string | undefined) === 'ENTITLEMENTS_STALE',
    );

  // Allow callers to opt out of the global toast by passing
  // `context: { suppressGlobalError: true }` in the mutation/query options.
  const suppressGlobalError = Boolean(
    operation.getContext()['suppressGlobalError'],
  );

  // ENTITLEMENTS_STALE → silently re-mint the JWT (fresh entitlements + new
  // `iat`) and retry the operation, up to ENTITLEMENTS_STALE_MAX_ATTEMPTS
  // times with backoff. A replay that comes back stale again re-enters this
  // same branch and reads the incremented attempt count from context (a
  // bounded counter, not the old single-shot boolean). Once the budget is
  // exhausted we fail safe: clear the session (the user drops to free) and
  // prompt re-login, matching the epic LS-8638 SHARED CONTRACTS #1 client
  // contract. This code is an expected control signal, so it is never
  // surfaced as a toast or to Rollbar.
  if (isEntitlementsStale) {
    const initialAttempt = Number(
      operation.getContext()['entitlementsStaleAttempt'] ?? 0,
    );
    return new Observable<ApolloLink.Result>((observer) => {
      // A hard refresh failure (silentlyRefreshJwt resolves null — the
      // /refresh-jwt call itself failed, e.g. a transient network blip) used
      // to skip straight to the terminal fallback with zero retries. That's
      // too harsh: a momentary network hiccup isn't evidence the user's
      // entitlements are stuck, so it now consumes a retry slot within the
      // same bounded budget instead (LS-9067 follow-up). This can't rely on
      // the usual "replay via forward() re-enters errorLink" mechanism the
      // stale-again case uses above, since there's no new operation response
      // to intercept — so it loops locally via recursion, driven by the same
      // attempt counter.
      const tryRefresh = (attempt: number) => {
        if (attempt >= ENTITLEMENTS_STALE_MAX_ATTEMPTS) {
          // Budget exhausted → fail safe: fall back to free + prompt re-login.
          window.dispatchEvent(new CustomEvent('auth:session-expired'));
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
      // Expected user-facing codes — show to the user but do NOT report to
      // Rollbar. Mirrors CLIENT_FACING_CODES in the server's formatError so
      // both layers agree on what is a bug vs. an expected condition.
      const EXPECTED_CODES = new Set([
        'BAD_USER_INPUT',
        'FORBIDDEN',
        'PREMIUM_REQUIRED',
        'GAME_UNAVAILABLE',
      ]);

      const premiumError = error.errors.find(
        (e) =>
          (e.extensions?.['code'] as string | undefined) === 'PREMIUM_REQUIRED',
      );

      const isForbidden = error.errors.some(
        (e) => (e.extensions?.['code'] as string | undefined) === 'FORBIDDEN',
      );

      // The server's formatError sanitizes unexpected exceptions to the raw
      // string "Internal server error" (code: INTERNAL_SERVER_ERROR). Showing
      // that string verbatim — as observed on the mobile draft route (LS-4850)
      // — gives the user no actionable context. Swap in a friendlier message
      // that matches the warmer tone used for upstream gateway failures.
      const firstError = error.errors[0];
      const isInternalServerError =
        (firstError?.extensions?.['code'] as string | undefined) ===
          'INTERNAL_SERVER_ERROR' && !premiumError;

      // FORBIDDEN errors must not reveal admin surface area (ARV-004): swallow
      // the raw server message and show a generic access-denied string instead.
      dispatchApolloError(
        premiumError?.message ??
          (isForbidden
            ? "You don't have access to this resource."
            : isInternalServerError
              ? 'Something went wrong on our end — please try again in a moment.'
              : (firstError?.message ?? 'An unexpected error occurred')),
      );

      const isExpectedError = error.errors.every((e) =>
        EXPECTED_CODES.has(e.extensions?.['code'] as string),
      );

      if (!isExpectedError) {
        // Unexpected server errors are captured explicitly so Rollbar items
        // include the operation name for easy diagnosis.
        captureError(
          error instanceof Error ? error : new Error(String(error)),
          { context: `apollo:${operation.operationName}` },
        );
      }
    } else if (ServerError.is(error)) {
      // 502/503/504 almost always indicate the server is unreachable or
      // overloaded — surface a warmer, action-oriented sentence (the global
      // toast offers a Retry button). Other status codes (5xx other than the
      // upstream gateway family, plus unusual 4xx on the transport) keep a
      // more factual message with the code for diagnosis.
      const isUpstreamUnreachable =
        error.statusCode === 502 ||
        error.statusCode === 503 ||
        error.statusCode === 504;
      dispatchApolloError(
        isUpstreamUnreachable
          ? "We couldn't reach the server right now — please try again in a moment."
          : `Server error (${error.statusCode.toString()}): please try again.`,
      );
      // 502/503/504 are transient gateway errors — not actionable bugs.
      // Capturing them floods Rollbar without adding diagnostic value.
      if (!isUpstreamUnreachable) {
        captureError(
          error instanceof Error ? error : new Error(String(error)),
          {
            context: `apollo:${operation.operationName}`,
          },
        );
      }
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

// ─── Apollo InMemoryCache type policies ──────────────────────────────────────
// By default, Apollo derives a normalized cache ID from `__typename` plus
// `id` (or `_id`) when those fields are present. Types without those fields
// are typically embedded unless explicit keyFields are configured, which can
// otherwise lead to "Cache data may be lost" warnings, incorrect identity,
// and stale UI after mutations.
//
// Categories:
//   keyFields: [...]   → entity with a non-standard or composite key
//   keyFields: false    → not a normalizable entity (response wrapper,
//                         aggregate, embedded object, or pagination type)
// Types with an `id` field use Apollo's default and are omitted here.

// `Query.playerSeasonBatting` / `Query.playerSeasonPitching` are queried under
// multiple aliases for the same `playerId` — e.g. `arcBatting:
// playerSeasonBatting(playerId: $playerId)` in GetPlayerCareerArc alongside the
// unaliased `playerSeasonBatting(playerId: $playerId)` in GetAllPlayerSeasonStats.
// LS-6969 introduced that alias believing it would keep the two cache entries
// separate, but Apollo's default store key is derived from the field's *name*,
// not its alias (`storeKeyNameFromField` reads `field.name.value`), so every
// aliased call computes the exact same store key as the unaliased one and both
// write to the same slot — whichever query resolves last silently overwrites
// the other's (differently-shaped) result. Because `SeasonBatting` /
// `SeasonPitching` are non-normalizable (`keyFields: false` below), an
// overwrite can leave the cache holding a value missing fields the other query
// selected, so a `cache-first` read of it looks like a cache miss — which is
// what made the Player Detail Modal's derived tab default and season tables
// racy (LS-9843, LS-9830). Folding the field's alias into `keyArgs` gives each
// aliased call its own store slot, closing the gap the LS-6969 alias was
// supposed to close.
function keyArgsByAlias(argNames: string[]) {
  return {
    keyArgs: (
      args: Record<string, unknown> | null,
      { field }: { field: FieldNode | null },
    ): string => {
      const alias = field?.alias?.value ?? field?.name.value ?? '';
      const argsKey = argNames
        .map((name) => `${name}:${JSON.stringify(args?.[name] ?? null)}`)
        .join(',');
      return `${alias}(${argsKey})`;
    },
  };
}

const typePolicies = {
  Query: {
    fields: {
      playerSeasonBatting: keyArgsByAlias(['playerId']),
      playerSeasonPitching: keyArgsByAlias(['playerId']),
    },
  },

  // League.playoffEnabled flap fix (LS-9928): investigation found no query or
  // mutation ever selects `League` without `playoffEnabled` (it's included in
  // both the `League` and `AppLeague` fragments), and Apollo's default entity
  // merge already preserves any cached field a given write's selection set
  // omits — so a field can only regress to null/undefined here if some
  // operation's response explicitly carries that value (e.g. a resolver read
  // racing a not-yet-committed write on `UpdateLeagueSettings` / a WS-driven
  // `refetchLeague()`). That produced the ~70ms window where every
  // `LeagueDetailPageV2` consumer of `league.playoffEnabled` — the Standings
  // bracket gate (already fixed for other reasons in LS-9901) and the Commish
  // tab's settings panel — could transiently observe a falsy value despite
  // the server's authoritative response being `true`.
  //
  // Fix at the cache layer so every consumer gets a stable value without its
  // own defensive workaround: an incoming null/undefined is treated as
  // "unknown — keep the last known value" rather than overwriting it, while
  // an explicit `false` is always honored (a commissioner can genuinely turn
  // playoffs off) so this never masks a real change.
  League: {
    fields: {
      playoffEnabled: {
        merge(
          existing: boolean | null | undefined,
          incoming: boolean | null | undefined,
        ) {
          if (incoming === null || incoming === undefined) {
            return existing === undefined ? incoming : existing;
          }
          return incoming;
        },
      },
    },
  },

  // ── Entity types with non-standard identity ───────────────────────────

  // Join table: one membership per (league, user)
  LeagueMember: { keyFields: ['leagueId', 'userId'] },

  // Badge catalog: unique by key string
  BadgeDefinition: { keyFields: ['key'] },

  // Career/season stat types are queried as nested player data and many
  // operations do not select the fields needed to build stable cache IDs
  // (e.g. GetPlayersWithStats omits playerId, TeamMember selects only
  // games). Keep them embedded under the parent cache entry.
  CareerBatting: { keyFields: false as const },
  CareerFielding: { keyFields: false as const },
  CareerPitching: { keyFields: false as const },
  SeasonBatting: { keyFields: false as const },
  SeasonFielding: { keyFields: false as const },
  SeasonPitching: { keyFields: false as const },

  // Game-level stats: per player per game (fielding adds position since a
  // player can field multiple positions in one game)
  GameBatting: { keyFields: ['playerId', 'gameIdentifier'] },
  GameFielding: { keyFields: ['playerId', 'gameIdentifier', 'position'] },
  GamePitching: { keyFields: ['playerId', 'gameIdentifier'] },

  // League composite records
  AllTimeRecord: {
    keyFields: ['leagueId', 'recordType', 'teamId', 'seasonNumber'],
  },
  LeagueSeasonSummary: { keyFields: ['leagueId', 'seasonNumber'] },

  // Draft-scoped singletons
  AuctionState: { keyFields: ['draftId'] },
  CurrentDraftPick: { keyFields: ['draftId'] },

  // Head-to-head: unique per team pair
  HeadToHeadRecord: { keyFields: ['team1Id', 'team2Id'] },

  // Per-league contextual data
  LeagueAnalytics: { keyFields: ['leagueId'] },
  InviteCodeInfo: { keyFields: ['leagueId'] },
  SeasonResults: { keyFields: ['leagueId', 'season'] },

  // On-this-day entries: per player per game per entry type (batting/pitching)
  OnThisDayEntry: { keyFields: ['playerId', 'gameIdentifier', 'entryType'] },

  // ── Non-normalizable types (responses, aggregates, embedded) ──────────
  // These have no stable identity and should not be cached as separate
  // normalized entries. Setting keyFields: false stores them inline within
  // the parent cache entry.

  AdminRevenueStats: { keyFields: false as const },
  AdvanceLeagueWeekResponse: { keyFields: false as const },
  AppleVerifyResult: { keyFields: false as const },
  AutoAdvanceMatchupsResult: { keyFields: false as const },
  AutoProcessDraftPicksResult: { keyFields: false as const },
  AutoSelectGamesResult: { keyFields: false as const },
  AutoStartScheduledDraftsResult: { keyFields: false as const },
  AuctionBudget: { keyFields: false as const },
  AverageSeasonBatting: { keyFields: false as const },
  BillingPortalSessionResult: { keyFields: false as const },
  CareerAchievements: { keyFields: false as const },
  CareerBattingConnection: { keyFields: false as const },
  CareerBattingEdge: { keyFields: false as const },
  CheckoutSessionResult: { keyFields: false as const },
  CommissionerActionResult: { keyFields: false as const },
  CreateLeagueAndTeamsPayload: { keyFields: false as const },
  DisclosureClue: { keyFields: false as const },
  DisclosureGuessResult: { keyFields: false as const },
  DraftRecommendation: { keyFields: false as const },
  DraftRecommendationStat: { keyFields: false as const },
  DraftTeamAutoPickStatus: { keyFields: false as const },
  DraftTeamOrderEntry: { keyFields: false as const },
  EvaluateBadgesResult: { keyFields: false as const },
  GiveUpDisclosureGameResult: { keyFields: false as const },
  GoogleVerifyResult: { keyFields: false as const },
  ImpersonateUserResult: { keyFields: false as const },
  JoinLeaguePayload: { keyFields: false as const },
  MatchupMessageConnection: { keyFields: false as const },
  MatchupRecap: { keyFields: false as const },
  MatchupStatusCounts: { keyFields: false as const },
  MergeAccountsResult: { keyFields: false as const },
  MockDraftInit: { keyFields: false as const },
  PageInfo: { keyFields: false as const },
  PlayerScoring: { keyFields: false as const },
  PlayoffProjection: { keyFields: false as const },
  PlayoffQualification: { keyFields: false as const },
  PowerRanking: { keyFields: false as const },
  PrivacyPolicyStatus: { keyFields: false as const },
  ProcessWaiverClaimsResult: { keyFields: false as const },
  RecalculateMatchupScoresResult: { keyFields: false as const },
  // ScoringConfig is fetched per league but the query doesn't select
  // leagueId, so it cannot be normalized by composite key.
  ScoringConfig: { keyFields: false as const },
  Scoreboard: { keyFields: false as const },
  ScoreboardGame: { keyFields: false as const },
  ScoreboardTeam: { keyFields: false as const },
  ScoringMultiplierEntry: { keyFields: false as const },
  ScoringRule: { keyFields: false as const },
  ScoringRuleGroup: { keyFields: false as const },
  SeasonDraftGamePickHistory: { keyFields: false as const },
  SeasonDraftPick: { keyFields: false as const },
  SendDiscordLineupRemindersResult: { keyFields: false as const },
  SendDiscordScoreAlertsResult: { keyFields: false as const },
  SendDiscordWeeklyRecapsResult: { keyFields: false as const },
  SendDuesRemindersResult: { keyFields: false as const },
  StartDisclosureGameResult: { keyFields: false as const },
  SubscriberGrowthPoint: { keyFields: false as const },
  SubscriptionInfo: { keyFields: false as const },
  SubscriptionStatusCount: { keyFields: false as const },
  TeamStanding: { keyFields: false as const },
  TeamStatistics: { keyFields: false as const },
  UserDataExport: { keyFields: false as const },
  VersionInfo: { keyFields: false as const },
} as const;

// Exported so cache-level behavior (e.g. the League.playoffEnabled merge
// policy) can be unit-tested directly against InMemoryCache without spinning
// up the full ApolloClient/network stack.
export { typePolicies };

export const apolloClient = new ApolloClient({
  link: from([retryLink, errorLink, authLink, rateLimitRetryLink, httpLink]),
  cache: new InMemoryCache({ typePolicies }),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all',
    },
    query: {
      errorPolicy: 'all',
    },
  },
});
