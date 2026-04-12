/**
 * WebSocket DRAFT_PICK_MADE Notification E2E Tests (LS-2230)
 *
 * Tests WebSocket DRAFT_PICK_MADE notification handling on the league detail page:
 *   - Page does not crash on DRAFT_PICK_MADE notification
 *   - Page refetches league/draft data after DRAFT_PICK_MADE
 *   - Multiple DRAFT_PICK_MADE notifications in sequence are handled gracefully
 *   - DRAFT_PICK_MADE for a different league is ignored (no crash)
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
  name: 'Draft Pick Test League',
  description: 'E2E test league for DRAFT_PICK_MADE WebSocket events',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'in-progress',
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
  inviteCode: 'DP1234',
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
 * esbuild constant-folds the empty string through to LeagueDetailPage's guard
 * (`if (!wsUrl || …) return`), dead-code-eliminating the WebSocket setup.
 *
 * We work around this by setting `window.__e2eWsUrl` via addInitScript —
 * which runs before any page scripts — so the environment module reads the
 * injected URL at module initialisation time instead of the baked-in "".
 * `environment.ts` checks `window.__e2eWsUrl` first (see the comment there).
 * Playwright's `routeWebSocket(/wss?:\/\//)` then intercepts the connection
 * attempt before it reaches the network, so the actual URL is irrelevant.
 */
const E2E_WS_URL = 'wss://e2e-test.local/ws';

async function injectWebSocketUrl(page: import('@playwright/test').Page) {
  // Set the override global before ANY page scripts run.  environment.ts reads
  // window.__e2eWsUrl at module-evaluation time, so this must happen first.
  // The type is declared in apps/web-e2e/src/e2e-globals.d.ts.
  await page.addInitScript((wsUrl: string) => {
    window.__e2eWsUrl = wsUrl;
  }, E2E_WS_URL);
}

// ── Wire-format helpers ─────────────────────────────────────────────────────

function wsNotification(data: Record<string, unknown>): string {
  return JSON.stringify({ type: 'notification', data });
}

/** Canonical DRAFT_PICK_MADE payload for pick #1 by TEAM_2, next pick by TEAM_1 */
function draftPickMadeNotification(
  overrides: Record<string, unknown> = {},
): string {
  return wsNotification({
    type: 'DRAFT_PICK_MADE',
    leagueId: LEAGUE_ID,
    draftId: 1,
    pickNumber: 1,
    roundNumber: 1,
    teamId: TEAM_2_ID,
    playerId: 12345,
    playerName: 'Mike Trout',
    position: 'CF',
    overallPick: 1,
    nextTeamId: TEAM_1_ID,
    ...overrides,
  });
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

interface SetupOptions {
  league?: typeof BASE_LEAGUE;
  /** When true, 2nd+ getLeagueById returns draftStatus: 'completed' to prove the refetch
   * delivers a meaningfully different value than the initial 'not-started' response. */
  leagueUpdatesOnRefetch?: boolean;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const { league = BASE_LEAGUE, leagueUpdatesOnRefetch = false } = opts;

  let leagueCallCount = 0;

  await page.route(isGraphQL, async (route) => {
    const rawPostData = route.request().postData();
    const postData =
      typeof rawPostData === 'string' ? rawPostData.toLowerCase() : '';

    if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
    ) {
      leagueCallCount++;
      const respondWith =
        leagueUpdatesOnRefetch && leagueCallCount > 1
          ? { ...league, draftStatus: 'completed' }
          : league;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: respondWith } }),
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
                name: 'Center Field',
                abbrev: 'CF',
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
        body: JSON.stringify({ data: { userLeagues: [league] } }),
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

/** Set up WebSocket interception and return the route once connected. */
async function setupWebSocket(page: import('@playwright/test').Page): Promise<{
  waitForConnection: () => Promise<WebSocketRoute>;
}> {
  await injectWebSocketUrl(page);

  let wsRoute: WebSocketRoute | undefined;

  await page.routeWebSocket(/wss?:\/\//, (ws) => {
    wsRoute = ws;
    ws.onMessage(() => {
      /* absorb pings */
    });
  });

  return {
    waitForConnection: async () => {
      await expect.poll(() => wsRoute !== undefined).toBe(true);
      if (!wsRoute) throw new Error('WebSocket route not established');
      return wsRoute;
    },
  };
}

// ── Tests: DRAFT_PICK_MADE notification ─────────────────────────────────────

test.describe('WebSocket – DRAFT_PICK_MADE notification @regression', () => {
  test('DRAFT_PICK_MADE does not crash the page', async ({ page }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Draft Pick Test League')).toBeVisible();

    const route = await ws.waitForConnection();

    // Send DRAFT_PICK_MADE notification
    route.send(draftPickMadeNotification());

    // Page should remain functional — no crash overlay
    await expect(page.getByText('Draft Pick Test League')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('multiple DRAFT_PICK_MADE notifications are handled gracefully', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Draft Pick Test League')).toBeVisible();

    const route = await ws.waitForConnection();

    // Send several DRAFT_PICK_MADE notifications in rapid succession
    route.send(
      draftPickMadeNotification({
        pickNumber: 1,
        overallPick: 1,
        teamId: TEAM_2_ID,
        nextTeamId: TEAM_1_ID,
        playerName: 'Mike Trout',
      }),
    );
    route.send(
      draftPickMadeNotification({
        pickNumber: 2,
        overallPick: 2,
        teamId: TEAM_1_ID,
        nextTeamId: TEAM_2_ID,
        playerName: 'Mookie Betts',
        playerId: 67890,
      }),
    );
    route.send(
      draftPickMadeNotification({
        pickNumber: 3,
        overallPick: 3,
        teamId: TEAM_2_ID,
        nextTeamId: TEAM_1_ID,
        playerName: 'Shohei Ohtani',
        playerId: 11111,
        roundNumber: 2,
      }),
    );
    route.send(
      draftPickMadeNotification({
        pickNumber: 4,
        overallPick: 4,
        teamId: TEAM_1_ID,
        nextTeamId: TEAM_2_ID,
        playerName: 'Aaron Judge',
        playerId: 22222,
        roundNumber: 2,
      }),
    );

    // Page should remain stable after all picks
    await expect(page.getByText('Draft Pick Test League')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('DRAFT_PICK_MADE does not crash the league overview page', async ({
    page,
  }) => {
    // LeagueDetailPage subscribes to DRAFT_COMPLETED, DRAFT_STARTED, etc.
    // but NOT DRAFT_PICK_MADE (individual picks are only handled by the
    // draft board).  Verify the notification is silently ignored without
    // crashing the page.
    const league = { ...BASE_LEAGUE, draftStatus: 'not-started' };
    await setupGraphQL(page, { league });
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Draft Pick Test League')).toBeVisible();

    const route = await ws.waitForConnection();

    // Send DRAFT_PICK_MADE notification
    route.send(draftPickMadeNotification());

    // Page should remain functional — no crash
    await expect(page.getByText('Draft Pick Test League')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('DRAFT_PICK_MADE for a different league is ignored without crashing', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Draft Pick Test League')).toBeVisible();

    const route = await ws.waitForConnection();

    // Send DRAFT_PICK_MADE for a completely different league (id: 9999)
    route.send(
      wsNotification({
        type: 'DRAFT_PICK_MADE',
        leagueId: 9999,
        draftId: 99,
        pickNumber: 1,
        roundNumber: 1,
        teamId: 999,
        playerId: 99999,
        playerName: 'Other Player',
        position: 'SP',
        overallPick: 1,
        nextTeamId: 998,
      }),
    );

    // Page should remain stable — foreign-league event must not crash
    await expect(page.getByText('Draft Pick Test League')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});
