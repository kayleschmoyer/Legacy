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

const typePolicies = {
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

export const apolloClient = new ApolloClient({
  link: from([retryLink, errorLink, authLink, httpLink]),
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
