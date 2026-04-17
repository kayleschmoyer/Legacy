import type { Route } from '@playwright/test';

import {
  leagueByIdResponse,
  leaguePositionsResponse,
  leagueScoringProfileResponse,
  leagueTeamsResponse,
  matchupsForLeagueResponse,
  userTeamIdResponse,
} from '../mocks/graphql';
import { mockDraft } from '../mocks/graphql/draft.mocks';

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
export const BASELINE_GRAPHQL_RESPONSES: Record<string, object> = {
  // ── App shell (fires on every authenticated page) ─────────────────
  getunreadnotificationcount: { data: { getUnreadNotificationCount: 0 } },
  getuserbyid: {
    data: {
      user: {
        __typename: 'User',
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accessLevel: 'none',
      },
    },
  },
  getuserleagues: { data: { userLeagues: [] } },

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
  getteamwaiverclaims: { data: { teamWaiverClaims: [] } },
  getpendingtradeoffers: { data: { pendingTradeOffers: [] } },
  getleaguetradeoffers: { data: { leagueTradeOffers: [] } },
  getteamtradeoffers: { data: { teamTradeOffers: [] } },

  // ── Draft ─────────────────────────────────────────────────────────
  getleaguedraft: { data: { getLeagueDraft: null } },
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
      },
    },
  },

  // ── Season awards (commissioner tab) ─────────────────────────────
  getleagueseasonawards: { data: { leagueSeasonAwards: [] } },
  getawardvotingperiod: { data: { awardVotingPeriod: null } },
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
        lastUpdated: new Date().toISOString(),
        games: [],
      },
    },
  },

  // ── Players ─────────────────────────────────────────────────────
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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fulfill a route with a diagnostic GraphQL error for unmocked operations.
 *
 * Use this inside GraphQL route handlers as the fallback for operations not
 * explicitly mocked by the test. Unlike `route.fallback()`, this immediately
 * surfaces missing mocks as a clear error rather than silently passing to the
 * network (which has no backend in CI).
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
export async function unmockedGraphQLFallback(route: Route): Promise<void> {
  const opName = extractOperationName(route);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      errors: [{ message: `[E2E] Unmocked GraphQL operation: ${opName}` }],
      data: null,
    }),
  });
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
