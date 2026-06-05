import type { Page, Route } from '@playwright/test';

import {
  leagueByIdResponse,
  leaguePositionsResponse,
  leagueScoringProfileResponse,
  leagueTeamsResponse,
  matchupsForLeagueResponse,
  userTeamIdResponse,
} from '../mocks/graphql';
import { mockDraft } from '../mocks/graphql/draft.mocks';
import { unmockedGraphQLFallback as routerUnmockedFallback } from '../mocks/graphql/router';
import { FIXED_NOW_ISO } from '../mocks/time';
import { deepFreeze } from '../mocks/deep-freeze';

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
 * Map of lowercased operationName → GraphQL response body.
 *
 * To add a new baseline mock, add an entry here. The key must be the
 * exact operationName (lowercased) that appears in the request's JSON body.
 */
export const BASELINE_GRAPHQL_RESPONSES: Record<string, object> = deepFreeze({
  // ── App shell (fires on every authenticated page) ─────────────────
  getunreadnotificationcount: { data: { getUnreadNotificationCount: 0 } },
  // Mirrors the `User` GraphQL fragment (apps/web/src/api/db/users/Users.graphql).
  // themePreference must be present so ThemeContext's ThemeServerSync (LS-4913)
  // hydrates cleanly; null means "server has no stored preference", so it does
  // NOT clobber the locally-selected theme that the theme specs assert on.
  getuserbyid: {
    data: {
      user: {
        __typename: 'User',
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accessLevel: 'none',
        avatarUrl: null,
        subscriptionTier: null,
        discordId: null,
        discordUsername: null,
        themePreference: null,
      },
    },
  },
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
  getuserleagues: { data: { userLeagues: [] } },
  getpublicleagues: { data: { publicLeagues: [] } },

  // ── Home page ─────────────────────────────────────────────────────
  getuserleaguesummaries: { data: { getUserLeagueSummaries: [] } },
  getarchiveduserleaguesummaries: {
    data: { getArchivedUserLeagueSummaries: [] },
  },
  getonthisday: { data: { onThisDay: [] } },
  getonthisdayevents: { data: { onThisDayEvents: [] } },

  // ── League detail (fires when visiting /baseball/league/:id) ──────
  getleaguebyid: leagueByIdResponse(),
  getleagueteams: leagueTeamsResponse(),
  getpositionsforleague: leaguePositionsResponse(),
  getuserteamid: userTeamIdResponse(),
  getteammembers: { data: { teamMembers: [] } },
  getcurrentweekforleague: { data: { getCurrentWeekForLeague: null } },
  getmatchupsforleague: matchupsForLeagueResponse(),
  getmatchupbyid: { data: { matchup: null } },
  getmatchupplayers: { data: { matchupPlayers: [] } },
  getcurrentmatchup: { data: { currentMatchup: null } },
  getleaguestandings: { data: { getLeagueStandings: [] } },
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
  getteambyid: { data: { teamById: null } },

  // ── Matchups (week-based) ─────────────────────────────────────────
  getmatchupsbyweek: { data: { getMatchupsByWeek: [] } },

  // ── Invite code ───────────────────────────────────────────────────
  validateinvitecode: { data: { validateInviteCode: null } },

  // ── Preferences ─────────────────────────────────────────────────
  getusernotificationpreferences: {
    data: { getUserNotificationPreferences: null },
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
  getallplayers: { data: { players: [] } },
  getplayerswithstats: { data: { playersWithStats: [] } },
  searchplayers: { data: { searchPlayers: [] } },
  getallplayerseasonstats: { data: { allPlayerSeasonStats: null } },
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
});

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
 * @example
 * await page.route(isGraphQLEndpoint, async (route) => {
 *   const op = route.request().postData()?.toLowerCase() ?? '';
 *   if (op.includes('getmyleague')) {
 *     await route.fulfill({ ... });
 *     return;
 *   }
 *   await unmockedGraphQLFallback(route);
 * });
 */
export const unmockedGraphQLFallback = routerUnmockedFallback;

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
 * Extract the GraphQL operationName from a Playwright Route's POST body.
 * Falls back to the `?ref=` query parameter, or returns `'unknown'`.
 */
export function extractOperationName(route: Route): string {
  const postData = route.request().postData() ?? '';
  try {
    const body = JSON.parse(postData) as { operationName?: string };
    if (body.operationName) return body.operationName;
  } catch {
    // Not JSON — fall through to raw scan
  }

  // Fallback: try to extract from ?ref= query parameter
  const url = route.request().url();
  const refMatch = /[?&]ref=([^&]+)/.exec(url);
  if (refMatch) return refMatch[1];

  return 'unknown';
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
