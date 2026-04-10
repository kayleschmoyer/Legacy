/**
 * WebSocket Reconnect E2E Tests (LS-2229)
 *
 * Tests WebSocket connection drop and auto-reconnect behavior on the league
 * detail page:
 *   - Page remains stable after server-side WebSocket close
 *   - App attempts to reconnect after connection drop
 *   - Page handles multiple connection drops gracefully
 *
 * All GraphQL calls are mocked via page.route(); WebSocket is intercepted
 * via page.routeWebSocket(). No real backend or WebSocket server needed.
 */

import type { WebSocketRoute } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ── Constants ───────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;
const LEAGUE_URL = `/baseball/league/${LEAGUE_ID}/overview`;
const TEAM_1_ID = 1;
const TEAM_2_ID = 2;

// ── Mock Data ───────────────────────────────────────────────────────────────

const BASE_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'WebSocket Reconnect Test League',
  description: 'E2E test league for WebSocket reconnect events',
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
  inviteCode: 'WS5678',
  userMembership: { teamId: TEAM_1_ID },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: TEAM_1_ID,
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
    id: TEAM_2_ID,
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

// ── WebSocket URL injection ──────────────────────────────────────────────────

/**
 * In CI the web build has VITE_WEBSOCKET_URL="" (no env var at build time).
 * The app's environment config therefore evaluates to `websocketUrl: ""`,
 * and LeagueDetailPage's guard `if (!wsUrl || …) return` prevents any
 * WebSocket connection.
 *
 * We fix this by injecting `window.__e2eWsUrl` via addInitScript (guarded by
 * `navigator.webdriver` in the app).  Playwright's
 * `routeWebSocket(/wss?:\/\//)` will intercept the connection attempt before
 * it reaches the network, so the actual URL is irrelevant.
 */
const E2E_WS_URL = 'wss://e2e-test.local/ws';

async function injectWebSocketUrl(page: import('@playwright/test').Page) {
  await page.addInitScript((wsUrl: string) => {
    (window as Window & { __e2eWsUrl?: string }).__e2eWsUrl = wsUrl;
  }, E2E_WS_URL);
}

// ── GraphQL route helper ────────────────────────────────────────────────────

function isGraphQL(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

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
        body: JSON.stringify({ data: { userTeamId: TEAM_1_ID } }),
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

// ── WebSocket setup with reconnect tracking ─────────────────────────────────

async function setupWebSocket(page: import('@playwright/test').Page): Promise<{
  getConnectionCount: () => number;
  waitForConnection: (expectedIndex?: number) => Promise<WebSocketRoute>;
  waitForReconnect: (expectedCount: number) => Promise<void>;
}> {
  await injectWebSocketUrl(page);

  let connectionCount = 0;
  const wsRoutes: WebSocketRoute[] = [];

  await page.routeWebSocket(/wss?:\/\//, (ws) => {
    connectionCount++;
    wsRoutes.push(ws);
    ws.onMessage(() => {
      /* absorb pings */
    });
  });

  return {
    getConnectionCount: () => connectionCount,
    waitForConnection: async (expectedIndex = 0) => {
      await expect
        .poll(() => wsRoutes.length > expectedIndex, { timeout: 15000 })
        .toBe(true);
      return wsRoutes[expectedIndex];
    },
    waitForReconnect: async (expectedCount: number) => {
      await expect
        .poll(() => connectionCount >= expectedCount, { timeout: 15000 })
        .toBe(true);
    },
  };
}

// ── Tests: WebSocket connection drop and reconnect ───────────────────────────

test.describe('WebSocket – connection drop and reconnect @regression', () => {
  test('page remains stable after WebSocket is closed by server', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // Verify initial connection
    const wsRoute = await ws.waitForConnection();
    expect(wsRoute).toBeDefined();

    // Force close the WebSocket from the server side
    await wsRoute.close();

    // Page should remain functional — no error overlay
    await expect(page.getByText('WebSocket Reconnect Test League')).toBeVisible(
      { timeout: 5000 },
    );
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('app attempts to reconnect after connection drop', async ({ page }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // Wait for the first WebSocket connection
    const wsRoute = await ws.waitForConnection();
    expect(ws.getConnectionCount()).toBe(1);

    // Force close the WebSocket from the server side
    await wsRoute.close();

    // The app should attempt to reconnect (routeWebSocket fires again)
    // Use a generous timeout to accommodate backoff strategies
    await ws.waitForReconnect(2);
    expect(ws.getConnectionCount()).toBeGreaterThanOrEqual(2);

    // Page should remain stable after reconnect
    await expect(page.getByText('WebSocket Reconnect Test League')).toBeVisible(
      { timeout: 5000 },
    );
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('page handles multiple connection drops gracefully', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // First drop
    const firstRoute = await ws.waitForConnection();
    await firstRoute.close();

    // Wait for reconnect then drop again
    await ws.waitForReconnect(2);
    const secondRoute = await ws.waitForConnection(1);
    await secondRoute.close();

    // Page should still be functional after two drops
    await expect(page.getByText('WebSocket Reconnect Test League')).toBeVisible(
      { timeout: 5000 },
    );
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('page does not show error state after WebSocket disconnect', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const wsRoute = await ws.waitForConnection();

    // Force close the WebSocket
    await wsRoute.close();

    // Wait a moment for any error state to potentially appear
    await page.waitForTimeout(1000);

    // Verify no error state is shown
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    await expect(page.locator('body')).not.toContainText(
      'Something went wrong',
    );

    // League content should still be visible
    await expect(page.getByText('WebSocket Reconnect Test League')).toBeVisible(
      { timeout: 5000 },
    );
  });
});
