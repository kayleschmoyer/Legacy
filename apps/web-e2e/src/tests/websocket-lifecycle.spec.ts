/**
 * League Realtime WebSocket Lifecycle — E2E Tests (LS-7625 / GAP-001)
 *
 * Complements the event-focused suites (websocket-realtime.spec.ts,
 * websocket-realtime-updates.spec.ts) by covering the *disabled* lifecycle
 * path: when `env.websocketUrl` resolves to '' (VITE_WEBSOCKET_URL unset and no
 * `window.__e2eWsUrl` override), the league page must render normally without
 * ever opening a WebSocket connection.
 *
 * Note deliberately NOT calling `injectWebSocketUrl(page)` here — that helper
 * is what the connected-path specs use to supply a non-empty URL. Omitting it
 * leaves `websocketUrl` empty, which is exactly the misconfigured/disabled
 * scenario this spec exercises.
 *
 * The reconnect-after-token-refresh path is verified at the hook/unit level
 * (apps/web/src/hooks/useLeagueWebSocketLifecycle.spec.ts) rather than E2E,
 * because it is driven by a rotation of the in-memory JWT owned by `useAuth`,
 * which the hermetic auth fixture has no supported way to rotate mid-session.
 * See the feature.md coverage notes and LS-7625 AC3.
 *
 * All GraphQL responses are mocked hermetically via route.fulfill() — no live
 * backend is required.
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ─────────────────────────────────────────────────────────────────

const LEAGUE_ID = 42;

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Silent Socket League',
  description: 'LS-7625 websocket-lifecycle disabled-URL E2E league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: null,
  numberOfTeams: 4,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: 'WSL7625',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
  sport: 'baseball',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Home Team',
    owner: 1,
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const DUES_DISABLED = {
  leagueDuesSettings: {
    __typename: 'LeagueDuesSettings',
    enabled: false,
    amountCents: 0,
  },
  leagueDuesStatus: [],
};

async function mockLeaguePage(page: import('@playwright/test').Page) {
  await createGraphQLRouter(page, {
    getleaguebyid: (route) =>
      fulfillJson(route, { data: { league: MOCK_LEAGUE } }),
    getleague: (route) => fulfillJson(route, { data: { league: MOCK_LEAGUE } }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
    getuserteamid: (route) => fulfillJson(route, { data: { userTeamId: 1 } }),
    getteammembers: (route) =>
      fulfillJson(route, { data: { teamMembers: [] } }),
    teammembers: (route) => fulfillJson(route, { data: { teamMembers: [] } }),
    getleagueactivity: (route) =>
      fulfillJson(route, { data: { leagueActivity: [] } }),
    leagueactivity: (route) =>
      fulfillJson(route, { data: { leagueActivity: [] } }),
    getleaguechatmessages: (route) =>
      fulfillJson(route, { data: { getLeagueMessages: [] } }),
    getleaguemessages: (route) =>
      fulfillJson(route, { data: { getLeagueMessages: [] } }),
    getleagueannouncements: (route) =>
      fulfillJson(route, { data: { getLeagueAnnouncements: [] } }),
    getleaguestandings: (route) =>
      fulfillJson(route, { data: { getLeagueStandings: [] } }),
    leaguestandings: (route) =>
      fulfillJson(route, { data: { getLeagueStandings: [] } }),
    getleagueduessettings: (route) =>
      fulfillJson(route, { data: DUES_DISABLED }),
    leagueduessettings: (route) => fulfillJson(route, { data: DUES_DISABLED }),
    getleagueduesstatus: (route) => fulfillJson(route, { data: DUES_DISABLED }),
    leagueduesstatus: (route) => fulfillJson(route, { data: DUES_DISABLED }),
    getpositionsforleague: (route) =>
      fulfillJson(route, { data: { leaguePositions: [] } }),
    getcurrentmatchup: (route) => fulfillJson(route, { data: null }),
    getmatchupbyid: (route) => fulfillJson(route, { data: null }),
    getmatchupsforleague: (route) => fulfillJson(route, { data: null }),
    getmatchupplayers: (route) => fulfillJson(route, { data: null }),
    getleaguescoring: (route) =>
      fulfillJson(route, { data: { leagueScoringProfile: null } }),
    leaguescoringprofile: (route) =>
      fulfillJson(route, { data: { leagueScoringProfile: null } }),
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [MOCK_LEAGUE] } }),
    getusers: (route) => fulfillJson(route, { data: { users: [] } }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('WebSocket lifecycle — disabled URL (LS-7625) @regression', () => {
  test('league page renders without opening a WebSocket when websocketUrl is empty', async ({
    page,
    leaguePage,
  }) => {
    await mockLeaguePage(page);

    // Record any WebSocket connection attempt. With an empty websocketUrl the
    // lifecycle effect returns early, so this handler must never fire.
    let wsConnectionAttempted = false;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      wsConnectionAttempted = true;
      ws.onMessage(() => {
        /* no-op */
      });
    });

    await leaguePage.gotoDetail(LEAGUE_ID, 'overview');

    // The page must load fully (settling signal) and not crash.
    await expect(page).toHaveURL(new RegExp(`/baseball/league/${LEAGUE_ID}`));
    await expect(page.getByText(MOCK_LEAGUE.name).first()).toBeVisible();
    await leaguePage.expectNoAppError();

    // No socket should have been opened — the disabled/misconfigured path.
    expect(wsConnectionAttempted).toBe(false);
  });
});
