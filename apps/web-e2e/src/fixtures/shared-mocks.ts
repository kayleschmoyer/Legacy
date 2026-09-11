import type { Page, Request, Route } from '@playwright/test';
import { ENTITLEMENTS } from '@legacy-sports/utils';

import {
  leagueByIdResponse,
  leagueNameResponse,
  leaguePositionsResponse,
  leagueScoringProfileResponse,
  leagueTeamsResponse,
  matchupsForLeagueResponse,
  userTeamIdResponse,
  viewerMembershipResponse,
} from '../mocks/graphql';
import { mockDraft } from '../mocks/graphql/draft.mocks';
import {
  isGraphQLEndpoint,
  unmockedGraphQLFallback as routerUnmockedFallback,
} from '../mocks/graphql/router';
import { FIXED_NOW_ISO } from '../mocks/time';
import { deepFreeze } from '../mocks/deep-freeze';

// ---------------------------------------------------------------------------
// Entitlement tiers — the one-stop entitlement fixture API (LS-8056)
//
// A hermetic spec's entitlement state is driven entirely by the `GetUserById`
// GraphQL response: `useIsPremium()` reads `subscriptionTier` (and treats an
// `accessLevel: 'admin'` user as premium), and AdminPage gates the /admin tools
// on the same response's `accessLevel`. Both are sourced server-side — NOT from
// the client JWT — so pinning these two fields is what actually flips a user's
// entitlement in the app. See apps/web/src/hooks/useIsPremium.ts.
//
// `premium` is the DEFAULT: the baseline `getuserbyid` mock below is built from
// the premium tier, so most specs need no opt-in at all. A spec switches to
// `free` or `admin` in one line with `useTier(page, 'free' | 'admin')` (see
// helper below) before navigating.
// ---------------------------------------------------------------------------

/**
 * The entitlement tiers a hermetic spec can mock:
 *   - `premium` — paid subscriber; sees all premium-gated content (DEFAULT).
 *   - `free`    — no subscription; hits premium gates / upgrade CTAs.
 *   - `admin`   — admin role; treated as premium AND can reach /admin tools.
 */
export type EntitlementTier = 'premium' | 'free' | 'admin';

/**
 * The `subscriptionTier` + `accessLevel` pair for each tier — the single
 * source of truth folded in from the LS-8010 ad-hoc premium mock.
 */
const TIER_USER_FIELDS: Record<
  EntitlementTier,
  { subscriptionTier: 'premium' | null; accessLevel: 'none' | 'admin' }
> = {
  premium: { subscriptionTier: 'premium', accessLevel: 'none' },
  free: { subscriptionTier: null, accessLevel: 'none' },
  admin: { subscriptionTier: 'premium', accessLevel: 'admin' },
};

/**
 * The `myEntitlements` lookup_key set for each tier — the JWT-derived entitlement
 * claim the server's `myEntitlements` resolver returns (LS-8645). Premium and
 * admin currently unlock the full catalog; free has an empty claim. Mirrors the
 * server: admins are all-entitled for reads, free users mint an empty claim.
 */
const TIER_ENTITLEMENTS: Record<EntitlementTier, string[]> = {
  premium: Object.values(ENTITLEMENTS),
  free: [],
  admin: Object.values(ENTITLEMENTS),
};

/**
 * Build a `MyEntitlements` response for an entitlement tier. `useHasEntitlement`
 * (apps/web/src/hooks/useIsPremium.ts) reads this to drive per-entitlement
 * feature gates, so a hermetic spec's gate state must be seeded here alongside
 * the `GetUserById` tier (they move together via `useTier`).
 */
export function tierEntitlementsResponse(tier: EntitlementTier) {
  return { data: { myEntitlements: TIER_ENTITLEMENTS[tier] } };
}

/**
 * Build a `GetUserById` response for an entitlement tier. The shape mirrors the
 * `User` fragment in apps/web/src/api/db/users/Users.graphql.
 */
export function tierUserByIdResponse(tier: EntitlementTier) {
  const { subscriptionTier, accessLevel } = TIER_USER_FIELDS[tier];
  return {
    data: {
      user: {
        __typename: 'User',
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accessLevel,
        avatarUrl: null,
        subscriptionTier,
        themePreference: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Baseline GraphQL mock responses
//
// Every E2E test gets these automatically via the _apiIsolation auto-fixture.
// They handle the "ambient" queries the app fires on any page load so that
// individual tests only need to mock operations specific to their scenario.
//
// Tests can override any operation by registering their own page.route()
// handler — Playwright's LIFO chain means the test handler runs first.
// If the test's handler calls route.fallback() for an operation it doesn't
// care about, the request cascades back here.
// ---------------------------------------------------------------------------

/**
 * Map of lowercased operationName → GraphQL response body, or a function of
 * the request's variables that returns one (for ops whose safe default
 * depends on an id — see `getmatchupwinprobability` below).
 *
 * To add a new baseline mock, add an entry here. The key must be the
 * exact operationName (lowercased) that appears in the request's JSON body.
 */
export const BASELINE_GRAPHQL_RESPONSES: Record<
  string,
  | Record<string, unknown>
  | ((variables: Record<string, unknown>) => Record<string, unknown>)
> = deepFreeze({
  // ── App shell (fires on every authenticated page) ─────────────────
  getunreadnotificationcount: { data: { getUnreadNotificationCount: 0 } },
  // Mirrors the `User` GraphQL fragment (apps/web/src/api/db/users/Users.graphql),
  // built from the `premium` tier so PREMIUM is the default entitlement: the many
  // league-detail / draft specs keep seeing ungated content after LS-5030 without
  // any opt-in. A spec switches to free/admin in one line via `useTier(page, …)`.
  // `themePreference` is null so ThemeContext's ThemeServerSync (LS-4913) hydrates
  // without clobbering the locally-selected theme the theme specs assert on.
  getuserbyid: tierUserByIdResponse('premium'),
  // Per-entitlement claim set read by `useHasEntitlement` (LS-8645). Built from
  // the `premium` tier so PREMIUM is the default entitlement, matching the
  // `getuserbyid` baseline above — a spec flips both in one line via
  // `useTier(page, …)`.
  myentitlements: tierEntitlementsResponse('premium'),
  // ThemeServerSync best-effort pushes the user's theme choice to the server on
  // every change (LS-4913). Without this baseline mock the hermetic API-isolation
  // fixture flags it as an unmocked operation and fails every theme spec.
  updateusertheme: {
    data: {
      updateUserTheme: {
        __typename: 'User',
        id: 1,
        themePreference: null,
      },
    },
  },
  // GetUserLeagues also fetches userLeagueCount (LS-9101) — the authoritative
  // total the free-tier league-cap gate reads instead of userLeagues.length.
  getuserleagues: { data: { userLeagues: [], userLeagueCount: 0 } },
  // Football Home's top/trending-players preview fires FootballPlayers on every
  // /football load (LS-5411). An empty connection renders the preview section's
  // loading-then-empty transition cleanly without asserting on player content —
  // specs that need actual preview data register their own override.
  footballplayers: {
    data: {
      footballPlayers: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
  // The canonical /players?sport=nfl desktop surface mounts
  // FootballStatsDataGrid, which fires FootballPlayerStatsGrid on every load
  // (LS-9366 — the LS-9077 route fold made this the default players view and
  // LS-9347 removed the page-wide PremiumGate in front of it). Same
  // footballPlayers root field as the FootballPlayers baseline above but a
  // different selection set: the grid also reads totalCount. Empty connection
  // renders the grid's EmptyCard cleanly; specs that assert on grid rows
  // register their own override.
  footballplayerstatsgrid: {
    data: {
      footballPlayers: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 0,
      },
    },
  },
  // GetMyLeagues fetches the same userLeagueCount field (LS-9101).
  getmyleagues: { data: { myLeagues: [], userLeagueCount: 0 } },
  getpublicleagues: { data: { publicLeagues: [] } },
  // ProfileSettingsPage fires MyIdentities on load (useMyIdentitiesQuery, LS-7825).
  // An empty array renders the "No linked providers found." branch cleanly; an
  // absent myIdentities field crashes the page (identitiesData.myIdentities.length
  // throws), so any spec navigating to /profile/settings without its own mock —
  // including @critical navigation smoke tests — needs this baseline.
  myidentities: { data: { myIdentities: [] } },

  // ── Home page ─────────────────────────────────────────────────────
  getuserleaguesummaries: { data: { getUserLeagueSummaries: [] } },
  // Standings split off the summaries query (LS-9528) — the home and leagues
  // screens now fire this in parallel on every load, so it needs a baseline.
  getuserleaguestandings: { data: { getUserLeagueStandings: [] } },
  getarchiveduserleaguesummaries: {
    data: { getArchivedUserLeagueSummaries: [] },
  },
  getonthisday: { data: { onThisDay: [] } },
  getonthisdayevents: { data: { onThisDayEvents: [] } },
  // LS-5809: home page queries mock-draft usage to gate the CTA for free users.
  // Default to unlimited so the Start Mock Draft button renders enabled.
  getmymockdraftusage: {
    data: {
      getMyMockDraftUsage: {
        __typename: 'MockDraftUsage',
        used: 0,
        limit: null,
        remaining: null,
        isUnlimited: true,
      },
    },
  },

  // ── League detail (fires when visiting /baseball/league/:id) ──────
  getleaguebyid: leagueByIdResponse(),
  getleagueteams: leagueTeamsResponse(),
  getpositionsforleague: leaguePositionsResponse(),
  getuserteamid: userTeamIdResponse(),
  getviewermembership: viewerMembershipResponse(),
  getleaguename: leagueNameResponse(),
  getteammembers: { data: { teamMembers: [] } },
  getcurrentweekforleague: { data: { getCurrentWeekForLeague: null } },
  getmatchupsforleague: matchupsForLeagueResponse(),
  getmatchupbyid: { data: { matchup: null } },
  getmatchupplayers: { data: { matchupPlayers: [] } },
  // MatchupWinProbabilityPanel fires this on every matchup-detail render
  // (LS-5907 — win probability is now a server-gated field). This query
  // reuses the exact `getMatchupById(id)` root field that `GetMatchupById`
  // (the page's main data query) also uses, so Apollo's InMemoryCache
  // normalizes both under the SAME store key (cache identity is fieldName +
  // args — GraphQL aliases are not part of the key, and neither is the
  // operationName). A flat `{ getMatchupById: null }` response is NOT safe
  // here: because the value can't be identified as an entity (no
  // __typename/id), Apollo can't merge it — it overwrites that store key
  // outright, nulling out whatever the main query already cached and
  // breaking every spec that navigates to the matchup page (LS-5907 CI
  // regression: shard 2/3 "Matchup not found"). Echo the requested id with
  // `winProbability: null` instead — Apollo recognizes `Matchup:<id>` as the
  // already-cached entity and merges the field in without clobbering it.
  getmatchupwinprobability: (variables: Record<string, unknown>) => ({
    data: {
      getMatchupById: {
        __typename: 'Matchup',
        id: variables.id,
        winProbability: null,
      },
    },
  }),
  getcurrentmatchup: { data: { currentMatchup: null } },
  getleaguestandings: { data: { getLeagueStandings: [] } },
  getplayoffprojections: { data: { getPlayoffProjections: [] } },
  // MatchupRosterComparison's football scoring path (LS-9612) fires this on
  // every football matchup view with a weekNumber (both the standalone
  // matchup detail page and the league-detail Matchup tab) — MatchupAdditionalSections
  // already fired it on the former. An empty result renders sensible
  // defaults (0 actual/projected per player, real team totals of 0) for
  // specs that don't test football scoring directly.
  matchupscores: { data: { matchupScores: [] } },
  getleaguescoringprofile: leagueScoringProfileResponse(),
  getleagueactivity: { data: { leagueActivity: [] } },
  getleaguechatmessages: { data: { leagueChatMessages: [] } },
  getleagueannouncements: { data: { leagueAnnouncements: [] } },
  // AwardVotingPanel fires this on the overview tab — null means no active voting period
  getawardvotingperiod: { data: { awardVotingPeriod: null } },
  getteamwaiverclaims: { data: { teamWaiverClaims: [] } },
  getpendingtradeoffers: { data: { pendingTradeOffers: [] } },
  getleaguetradeoffers: { data: { leagueTradeOffers: [] } },
  getteamtradeoffers: { data: { teamTradeOffers: [] } },

  // ── Draft ─────────────────────────────────────────────────────────
  getleaguedraft: { data: { getLeagueDraft: null } },
  // GetLiveDraftLeagueDraft is a superset of GetLeagueDraft used by the draft
  // board page — same resolver, null response means no active draft.
  getlivedraftleaguedraft: { data: { getLeagueDraft: null } },
  getdraftteamorder: { data: { draftTeamOrder: [] } },
  initializedraft: {
    data: {
      initializeDraft: mockDraft({ status: 'queued', leagueId: 1 }),
    },
  },
  getdraftplayerstats: {
    data: { careerBattingStats: { edges: [], totalCount: 0 } },
  },
  getdraftpitchingstats: { data: { careerPitchingStats: [] } },
  getdraftpitcherstats: { data: { careerPitchingStats: [] } },
  getdraftteamautopickstatuses: {
    data: { getDraftTeamAutoPickStatuses: [] },
  },

  // ── Subscription ──────────────────────────────────────────────────
  getmysubscription: { data: { mySubscription: null } },
  getstripeprices: {
    data: {
      stripePrices: {
        monthlyPriceCents: 499,
        annualTotalCents: 3999,
        monthlyPriceId: 'price_monthly_test',
        annualPriceId: 'price_annual_test',
        trialPeriodDays: 0,
      },
    },
  },

  // ── Season awards (commissioner tab) ─────────────────────────────
  getleagueseasonawards: { data: { leagueSeasonAwards: [] } },
  getawardvoteresults: { data: { awardVoteResults: [] } },
  getmyawardvotes: { data: { myAwardVotes: [] } },

  // ── Trade block ───────────────────────────────────────────────────
  getleaguetradeblock: { data: { leagueTradeBlock: [] } },

  // ── Playoff bracket ───────────────────────────────────────────────
  getplayoffbracket: { data: { playoffBracket: null } },

  // ── Player stats ──────────────────────────────────────────────────
  getcareerbattingstats: { data: { careerBattingStats: [] } },
  getcareerpitchingstats: { data: { careerPitchingStats: [] } },
  getcareerpitchingstatscount: { data: { careerPitchingStatsCount: 0 } },

  // ── Admin ─────────────────────────────────────────────────────────
  admingetusers: { data: { users: [] } },

  // ── Team / league members ─────────────────────────────────────────
  getteamleaguemembers: { data: { teamLeagueMembers: [] } },
  getteambyid: { data: { team: null } },

  // ── Matchups (week-based) ─────────────────────────────────────────
  getmatchupsbyweek: { data: { getMatchupsByWeek: [] } },

  // ── Invite code ───────────────────────────────────────────────────
  validateinvitecode: { data: { validateInviteCode: null } },

  // ── Preferences ─────────────────────────────────────────────────
  getusernotificationpreferences: {
    data: { getUserNotificationPreferences: null },
  },
  // User display preferences (stats format, LS-7138). Default to no
  // server-stored prefs so the client falls back to localStorage — preserving
  // the existing localStorage-driven test expectations.
  getuserpreferences: { data: { getUserPreferences: null } },
  updateuserpreferences: {
    data: {
      updateUserPreferences: {
        __typename: 'UserPreference',
        id: 1,
        userId: 1,
        statsFormat: 'standard',
        createdAt: FIXED_NOW_ISO,
        updatedAt: FIXED_NOW_ISO,
      },
    },
  },

  // ── Scoreboard ticker (fires on every page load via app shell) ──
  getscoreboard: {
    data: {
      scoreboard: {
        __typename: 'Scoreboard',
        date: '2026-04-01',
        lastUpdated: FIXED_NOW_ISO,
        games: [],
      },
    },
  },

  // ── Players ─────────────────────────────────────────────────────
  getplayercount: { data: { playerCount: 22184 } },
  // Football bye-week + SoS badges (LS-8045) — empty array keeps badges hidden
  // in non-entitled / default hermetic sessions; entitled specs supply their own mock.
  getnflteamseasonmetadata: { data: { nflTeamSeasonMetadata: [] } },
  getallplayers: { data: { players: [] } },
  getplayerswithstats: { data: { playersWithStats: [] } },
  searchplayers: { data: { searchPlayers: [] } },
  getallplayerseasonstats: { data: { allPlayerSeasonStats: null } },
  getcomparisonseasonstats: {
    data: {
      slot0Batting: [],
      slot0Pitching: [],
      slot1Batting: [],
      slot1Pitching: [],
      slot2Batting: [],
      slot2Pitching: [],
      slot3Batting: [],
      slot3Pitching: [],
    },
  },
  getplayercareerarc: {
    data: { player: null, playerSeasonBatting: [], playerSeasonPitching: [] },
  },

  // ── Waiver / trade (league pages) ──────────────────────────────
  getwaiverorder: { data: { waiverOrder: [] } },

  // ── Dues ────────────────────────────────────────────────────────
  getleagueduesstatus: {
    data: { leagueDuesSettings: null, leagueDuesStatus: [] },
  },

  // ── History tab ─────────────────────────────────────────────────
  getleaguehistory: { data: { getLeagueHistory: [] } },
  getalltimerecords: { data: { getAllTimeRecords: [] } },

  // ── Minigames hub (MinigamesHub, mounts on /games) ─────────────────
  // GetSeasonDraftGames, GetDisclosureGameBestScore and GetMinigamesStats
  // fire from MinigamesHub (lib/shared-components/src/features/minigames-hub/
  // MinigamesHub.tsx). Baselined per LS-9840 so any spec that happens to
  // reach /games without its own mock (e.g. via redirect or shared
  // navigation) doesn't get flagged by API isolation as leaking unmocked
  // requests; specs that assert on hub content (minigames-hub.spec.ts)
  // register their own override.
  getseasondraftgames: { data: { seasonDraftGames: [] } },
  getdisclosuregamebestscore: { data: { disclosureGameBestScore: null } },
  getminigamesstats: {
    data: {
      minigamesStats: {
        __typename: 'MinigamesStats',
        playerSeasons: 1_000_000,
        earliestYear: 1871,
        playersTracked: 20_000,
      },
    },
  },
});

/**
 * Resolve a `BASELINE_GRAPHQL_RESPONSES` entry into a plain response body,
 * invoking it with `variables` if it's a function. Prefer this over indexing
 * `BASELINE_GRAPHQL_RESPONSES[op]` directly — a raw index can return a
 * function (JSON.stringify(fn) silently serializes to `undefined`).
 */
export function resolveBaselineResponse(
  op: string,
  variables: Record<string, unknown> = {},
): object | undefined {
  const entry = BASELINE_GRAPHQL_RESPONSES[op];
  return typeof entry === 'function' ? entry(variables) : entry;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cascade an unmatched GraphQL route to the next handler in the Playwright
 * LIFO chain (typically the `_apiIsolation` auto-fixture).
 *
 * Use this inside GraphQL route handlers as the else/fallback branch for
 * operations not explicitly mocked by the test. The `_apiIsolation` fixture
 * (layer 1) handles ambient queries from BASELINE_GRAPHQL_RESPONSES (e.g.
 * `getUserById`, `getUnreadNotificationCount`) and records any truly unmocked
 * operations as a post-test assertion error so nothing slips through silently.
 *
 * Route on the extracted operation name with EXACT equality — never on a
 * substring of the raw post body. `postData.includes('getmyleague')` also
 * matches `GetMyLeagueStandings`, so the first branch wins and fulfills the
 * route with the wrong response shape, which resolves rather than errors
 * (LS-9794).
 *
 * @example
 * await page.route(isGraphQLEndpoint, async (route) => {
 *   const operation = extractOperationName(route).toLowerCase();
 *   if (operation === 'getmyleague') {
 *     await route.fulfill({ ... });
 *     return;
 *   }
 *   await unmockedGraphQLFallback(route);
 * });
 */
export const unmockedGraphQLFallback = routerUnmockedFallback;

/**
 * Pin the current user's entitlement tier for the rest of the test, then
 * cascade every other GraphQL operation to the shared baseline.
 *
 * This is the one-line entitlement switch for hermetic specs (LS-8056):
 *
 * ```ts
 * // premium is the DEFAULT — most specs need no call at all
 * await useTier(page, 'free');   // exercise a premium gate / upgrade CTA
 * await useTier(page, 'admin');  // admin role: treated as premium + /admin tools
 * await page.goto('/baseball/league/1');
 * ```
 *
 * Premium status is sourced server-side from two operations: `GetUserById`
 * (`useIsPremium()` reads `subscriptionTier` / `accessLevel`) and `MyEntitlements`
 * (`useHasEntitlement()` reads the per-entitlement claim set, LS-8645) — NOT the
 * client JWT — so overriding those two operations is enough to flip the
 * entitlement the app sees. Every other ambient operation falls through to
 * BASELINE_GRAPHQL_RESPONSES.
 *
 * Must be called BEFORE `page.goto()`.
 */
export async function useTier(
  page: Page,
  tier: EntitlementTier,
): Promise<void> {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();
    if (op === 'getuserbyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tierUserByIdResponse(tier)),
      });
      return;
    }
    if (op === 'myentitlements') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tierEntitlementsResponse(tier)),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

/**
 * Seed GrowthBook feature flags before the app bundle loads.
 *
 * `GrowthBookProvider` reads `window.__gbSeededFeatures` at module-load time
 * (apps/web/src/context/GrowthBookProvider.tsx), so the seed must be injected
 * via `addInitScript` *before* `page.goto()`.
 *
 * The `football_enabled` flag gates the football rollout (LS-4767) — including
 * the football sport tab on the Create League page, which is filtered out of
 * the SportSwitcher when the flag is off. CI has no `VITE_GROWTHBOOK_CLIENT_KEY`
 * so every flag defaults off; any test that needs the football tab visible must
 * call this helper first. Use `enableFootball(page)` for the common case.
 *
 * @example
 * await seedFeatureFlags(page, { football_enabled: { defaultValue: true } });
 * await page.goto('/football/league/create');
 */
export async function seedFeatureFlags(
  page: Page,
  features: Record<string, { defaultValue: unknown }>,
): Promise<void> {
  await page.addInitScript((seeded) => {
    (window as unknown as { __gbSeededFeatures: unknown }).__gbSeededFeatures =
      seeded;
  }, features);
}

/**
 * Convenience wrapper that turns on the `football_enabled` flag (LS-4767) so the
 * football sport tab renders. Must be called before `page.goto()`.
 */
export async function enableFootball(page: Page): Promise<void> {
  await seedFeatureFlags(page, { football_enabled: { defaultValue: true } });
}

/**
 * Extract the GraphQL operationName from a Playwright Request's POST body.
 * Falls back to the `?ref=` query parameter, or returns `'unknown'`.
 *
 * The request-level form exists for `page.waitForResponse` predicates, which
 * are handed a Response rather than a Route (LS-9866). Route handlers should
 * call `extractOperationName(route)` below.
 */
export function extractRequestOperationName(request: Request): string {
  const postData = request.postData() ?? '';
  try {
    const body = JSON.parse(postData) as { operationName?: string };
    if (body.operationName) return body.operationName;
  } catch {
    // Not JSON — fall through to raw scan
  }

  // Fallback: try to extract from ?ref= query parameter
  const refMatch = /[?&]ref=([^&]+)/.exec(request.url());
  if (refMatch) return refMatch[1];

  return 'unknown';
}

/**
 * Extract the GraphQL operationName from a Playwright Route's POST body.
 * Falls back to the `?ref=` query parameter, or returns `'unknown'`.
 */
export function extractOperationName(route: Route): string {
  return extractRequestOperationName(route.request());
}

/** GraphQL request variables, parsed from the route's POST body (`{}` if absent/unparseable). */
export function extractOperationVariables(
  route: Route,
): Record<string, unknown> {
  const postData = route.request().postData() ?? '';
  try {
    const body = JSON.parse(postData) as {
      variables?: Record<string, unknown>;
    };
    return body.variables ?? {};
  } catch {
    return {};
  }
}

/**
 * Case-insensitive filter mirroring the server-side `GetAllUsers` search
 * (by username, email, or id). Shared by the admin-console / admin-dashboard
 * specs so the `/admin/users` search tests get realistic filtered results from
 * their mocks instead of the full user list.
 */
export function filterUsers<
  T extends {
    id: number;
    username?: string | null;
    email?: string | null;
  },
>(users: readonly T[], search: string): T[] {
  if (!search) return [...users];
  const q = search.toLowerCase();
  return users.filter(
    (u) =>
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      String(u.id).includes(q),
  );
}
