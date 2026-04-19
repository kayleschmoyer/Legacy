/**
 * WebSocket Authentication Failure E2E Tests (LS-2228)
 *
 * Tests that the league page handles WebSocket authentication failures
 * gracefully without crashing or showing uncaught error overlays:
 *   - WebSocket closed immediately with 4001 (Unauthorized)
 *   - WebSocket closed immediately with 4003 (Forbidden)
 *   - WebSocket closed immediately with normal close code (1000)
 *   - Unauthenticated user navigating to a protected page
 *
 * All GraphQL calls are mocked via page.route(); WebSocket is intercepted
 * via page.routeWebSocket(). No real backend or WebSocket server needed.
 */

import { injectWebSocketUrl, isGraphQL } from './helpers/websocket-test-utils';
import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ── Constants ───────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;
const LEAGUE_URL = `/baseball/league/${LEAGUE_ID}/overview`;

// ── Mock Data ───────────────────────────────────────────────────────────────

const BASE_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Auth Test League',
  description: 'E2E test league for WebSocket auth failure scenarios',
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
  inviteCode: 'AUTH01',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
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
  {
    __typename: 'Team',
    id: 2,
    name: 'Away Team',
    owner: 2,
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

// ── GraphQL route helper ────────────────────────────────────────────────────

async function setupGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQL, async (route) => {
    const rawPostData = route.request().postData();
    const postData =
      typeof rawPostData === 'string' ? rawPostData.toLowerCase() : '';

    if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: BASE_LEAGUE } }),
      });
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            leaguePositions: [
              {
                __typename: 'LeaguePosition',
                id: 1,
                name: 'Catcher',
                abbrev: 'C',
              },
            ],
          },
        }),
      });
    } else if (postData.includes('getuserteamid')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (postData.includes('getcurrentweekforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 1 } }),
      });
    } else if (postData.includes('getmatchupsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: [] } }),
      });
    } else if (postData.includes('getmatchupplayers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
    } else if (
      postData.includes('getleaguechatmessages') ||
      postData.includes('getleaguemessages')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: [] } }),
      });
    } else if (
      postData.includes('getleagueactivity') ||
      postData.includes('leagueactivity')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (
      postData.includes('getleaguestandings') ||
      postData.includes('leaguestandings')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (
      postData.includes('getuserleagues') ||
      postData.includes('getusers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [BASE_LEAGUE] } }),
      });
    } else if (
      postData.includes('getleaguescoring') ||
      postData.includes('leaguescoringprofile')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else if (
      postData.includes('getpendingtradeoffers') ||
      postData.includes('pendingtradeoffers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
    } else if (
      postData.includes('getteamwaiverclaims') ||
      postData.includes('teamwaiverclaims')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
    } else if (postData.includes('getleagueannouncements')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else if (
      postData.includes('getteammembers') ||
      postData.includes('teammembers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests: WebSocket auth failures ──────────────────────────────────────────

test.describe('WebSocket – authentication failures @regression', () => {
  test('page handles WebSocket close with unauthorized code (4001) gracefully', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await injectWebSocketUrl(page);

    let connectionAttempted = false;

    // Intercept WS and immediately close with 4001 (Unauthorized)
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      connectionAttempted = true;
      void ws.close({ code: 4001, reason: 'Unauthorized' });
    });

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // Assert the app actually attempted to open a WebSocket connection
    await expect.poll(() => connectionAttempted, { timeout: 5000 }).toBe(true);

    // League content should still render despite WS auth failure
    await expect(page.getByText('Auth Test League').first()).toBeVisible();
    // No uncaught error overlay
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('page handles WebSocket close with forbidden code (4003) gracefully', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await injectWebSocketUrl(page);

    let connectionAttempted = false;

    // Intercept WS and immediately close with 4003 (Forbidden)
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      connectionAttempted = true;
      void ws.close({ code: 4003, reason: 'Forbidden' });
    });

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // Assert the app actually attempted to open a WebSocket connection
    await expect.poll(() => connectionAttempted, { timeout: 5000 }).toBe(true);

    // League content should still render despite WS auth failure
    await expect(page.getByText('Auth Test League').first()).toBeVisible();
    // No uncaught error overlay
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('page handles immediate WebSocket close (normal closure) gracefully', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await injectWebSocketUrl(page);

    let connectionAttempted = false;

    // Intercept WS and immediately close with normal code 1000
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      connectionAttempted = true;
      void ws.close({ code: 1000, reason: 'Normal Closure' });
    });

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // Assert the app actually attempted to open a WebSocket connection
    await expect.poll(() => connectionAttempted, { timeout: 5000 }).toBe(true);

    // League content should still render even when WS closes immediately
    await expect(page.getByText('Auth Test League').first()).toBeVisible();
    // No uncaught error overlay
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ── Tests: Unauthenticated access ───────────────────────────────────────────

test.describe('WebSocket – unauthenticated page access @regression', () => {
  unauthTest(
    'unauthenticated user navigating to a protected league page does not crash',
    async ({ page }) => {
      // No GraphQL or WebSocket mocks needed — the app should redirect before
      // attempting any API calls. If it does make requests, the base API
      // isolation fixture handles them.
      await page.goto(LEAGUE_URL);
      await page.waitForLoadState('load');

      // The page should not have crashed with an unhandled JS error — that is
      // the only invariant we assert here.  The existing unauth E2E specs show
      // that protected routes render the public landing page without a redirect
      // to /login, so asserting on the URL would be fragile.
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    },
  );
});
