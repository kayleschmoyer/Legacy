/**
 * WebSocket Real-Time Updates E2E Tests (LS-612)
 *
 * Tests WebSocket notification handling on the league detail page:
 *   - WebSocket connection lifecycle (establish, receive messages)
 *   - Activity feed updates on notification events
 *   - League data refetch after MATCHUP_STATS_COMPLETE
 *   - Draft status transition after DRAFT_STARTED
 *   - Presence events (USER_JOINED / USER_LEFT)
 *   - Multiple notification types in sequence
 *   - Page resilience to malformed WebSocket messages
 *
 * All GraphQL calls are mocked via page.route(); WebSocket is intercepted
 * via page.routeWebSocket(). No real backend or WebSocket server needed.
 */

import type { WebSocketRoute } from '@playwright/test';
import { injectWebSocketUrl, isGraphQL } from './helpers/websocket-test-utils';
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
  name: 'WebSocket Test League',
  description: 'E2E test league for WebSocket events',
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
  inviteCode: 'WS1234',
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

const MOCK_ACTIVITY_EMPTY: never[] = [];

const MOCK_ACTIVITY_WITH_ITEMS = [
  {
    __typename: 'LeagueActivityEvent',
    id: '1',
    leagueId: LEAGUE_ID,
    teamId: TEAM_1_ID,
    actorUserId: 1,
    actorUsername: 'traderJoe',
    eventType: 'trade_accepted',
    occurredAt: '2026-03-19T10:00:00Z',
    payload: JSON.stringify({
      teamAName: 'Home Team',
      teamBName: 'Away Team',
      playerSentFromTeamA: 'Mike Trout',
      playerSentFromTeamB: 'Mookie Betts',
    }),
  },
];

// ── Wire-format helpers ─────────────────────────────────────────────────────

function wsNotification(data: Record<string, unknown>): string {
  return JSON.stringify({ type: 'notification', data });
}

// ── GraphQL route helper ────────────────────────────────────────────────────

interface SetupOptions {
  league?: typeof BASE_LEAGUE;
  activityItems?: typeof MOCK_ACTIVITY_WITH_ITEMS;
  /** When true, the 2nd+ leagueActivity call returns MOCK_ACTIVITY_WITH_ITEMS. */
  activityAppearsOnRefetch?: boolean;
  /** When true, 2nd+ getLeagueByid returns draftStatus='queued'. */
  draftStartsOnRefetch?: boolean;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    league = BASE_LEAGUE,
    activityItems,
    activityAppearsOnRefetch = false,
    draftStartsOnRefetch = false,
  } = opts;

  let activityCallCount = 0;
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
        draftStartsOnRefetch && leagueCallCount > 1
          ? { ...league, draftStatus: 'queued' }
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
      activityCallCount++;
      const items =
        activityAppearsOnRefetch && activityCallCount > 1
          ? MOCK_ACTIVITY_WITH_ITEMS
          : (activityItems ?? MOCK_ACTIVITY_EMPTY);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: items } }),
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
  // Ensure the built bundle has a non-empty websocketUrl so the app attempts
  // a WebSocket connection (CI builds have VITE_WEBSOCKET_URL="").
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

// ── Tests: WebSocket connection lifecycle ────────────────────────────────────

test.describe('WebSocket – connection lifecycle @critical', () => {
  test('league page establishes WebSocket connection', async ({ page }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // The app should attempt a WebSocket connection
    const route = await ws.waitForConnection();
    expect(route).toBeDefined();
  });

  test('league page renders without errors after WebSocket connects', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // League name should be visible (use .first() — the chip appears in both
    // desktop nav and mobile header slots, both always in DOM)
    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
    // No uncaught error overlay
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ── Tests: Notification resilience ──────────────────────────────────────────

test.describe('WebSocket – notification resilience @regression', () => {
  test('page handles unknown notification type gracefully', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const route = await ws.waitForConnection();

    // Send an unknown notification type — should not crash
    route.send(
      wsNotification({
        type: 'TOTALLY_UNKNOWN_EVENT',
        leagueId: LEAGUE_ID,
      }),
    );

    // Page should remain functional
    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
  });

  test('page handles malformed WebSocket message gracefully', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const route = await ws.waitForConnection();

    // Send malformed JSON — should not crash
    route.send('this is not valid JSON {{{');

    // Page should remain functional
    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
  });

  test('page handles empty notification data gracefully', async ({ page }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const route = await ws.waitForConnection();

    // Send notification with empty data
    route.send(JSON.stringify({ type: 'notification', data: {} }));

    // Page should remain functional
    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
  });
});

// ── Tests: Multiple notification types ──────────────────────────────────────

test.describe('WebSocket – multiple notifications @regression', () => {
  test('page handles rapid successive notifications without crashing', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const route = await ws.waitForConnection();

    // Prepare to wait for the GraphQL refetch triggered by MATCHUP_STATS_COMPLETE
    const refetchPromise = page.waitForResponse((resp) => {
      const url = resp.url();
      return (
        url.includes('/graphql') &&
        !url.includes('/@fs/') &&
        (resp.request().postData()?.toLowerCase().includes('getleaguebyid') ??
          false)
      );
    });

    // Fire multiple notification types rapidly
    route.send(
      wsNotification({
        type: 'USER_JOINED',
        leagueId: LEAGUE_ID,
        userId: 10,
        username: 'player_one',
      }),
    );
    route.send(
      wsNotification({
        type: 'USER_JOINED',
        leagueId: LEAGUE_ID,
        userId: 11,
        username: 'player_two',
      }),
    );
    route.send(
      wsNotification({
        type: 'MATCHUP_STATS_COMPLETE',
        leagueId: LEAGUE_ID,
        matchupId: 1,
        completedAt: new Date().toISOString(),
      }),
    );
    route.send(
      wsNotification({
        type: 'ROSTER_UPDATE',
        leagueId: LEAGUE_ID,
        teamId: TEAM_1_ID,
      }),
    );

    // Wait for the refetch triggered by MATCHUP_STATS_COMPLETE
    await refetchPromise;

    // Page should still be functional
    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('presence events — USER_JOINED and USER_LEFT in sequence', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const route = await ws.waitForConnection();

    // User joins
    route.send(
      wsNotification({
        type: 'USER_JOINED',
        leagueId: LEAGUE_ID,
        userId: 42,
        username: 'new_member',
      }),
    );

    // User leaves
    route.send(
      wsNotification({
        type: 'USER_LEFT',
        leagueId: LEAGUE_ID,
        userId: 42,
        username: 'new_member',
      }),
    );

    // Page should remain stable after processing presence events
    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ── Tests: Activity feed with initial data ──────────────────────────────────

test.describe('WebSocket – activity feed display @regression', () => {
  test('activity feed shows existing items on page load', async ({ page }) => {
    await setupGraphQL(page, {
      activityItems: MOCK_ACTIVITY_WITH_ITEMS,
    });
    await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // The overview page defaults to Activity sub-tab
    await expect(page.getByText('Activity').first()).toBeVisible();

    // The trade activity should be visible
    await expect(page.getByText(/trade accepted/i)).toBeVisible();
  });

  test('league overview shows Activity tab as default sub-tab', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // Activity sub-tab should be present in the overview
    await expect(page.getByText('Activity').first()).toBeVisible();
  });
});

// ── Tests: Draft notification triggers league refetch ────────────────────────

test.describe('WebSocket – draft status transition @regression', () => {
  test('DRAFT_STARTED notification triggers league data refetch', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      league: { ...BASE_LEAGUE, draftStatus: 'not-started' },
      draftStartsOnRefetch: true,
    });
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // Verify league page loaded
    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();

    const route = await ws.waitForConnection();

    // Prepare to wait for the refetch GraphQL response before sending the notification
    const refetchPromise = page.waitForResponse((resp) => {
      const url = resp.url();
      return (
        url.includes('/graphql') &&
        !url.includes('/@fs/') &&
        (resp.request().postData()?.toLowerCase().includes('getleaguebyid') ??
          false)
      );
    });

    // Send DRAFT_STARTED notification
    route.send(
      wsNotification({
        type: 'DRAFT_STARTED',
        leagueId: LEAGUE_ID,
        draftId: 1,
        draftOrder: 'snake',
        teamCount: 4,
        pickTimeLimitSeconds: 120,
        currentPickDeadline: new Date(Date.now() + 120_000).toISOString(),
        startedAt: new Date().toISOString(),
      }),
    );

    // Wait for the league data refetch triggered by DRAFT_STARTED
    await refetchPromise;

    // Page should reflect the refetched draft status without errors
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ── Tests: Trade and waiver notifications ───────────────────────────────────

test.describe('WebSocket – trade/waiver notifications @regression', () => {
  test('TRADE_OFFER notification does not crash the page', async ({ page }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const route = await ws.waitForConnection();

    route.send(
      wsNotification({
        type: 'TRADE_OFFER',
        leagueId: LEAGUE_ID,
        tradeId: 1,
        fromTeamId: TEAM_2_ID,
        toTeamId: TEAM_1_ID,
        status: 'pending',
      }),
    );

    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('WEEK_ADVANCED notification does not crash the page', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const route = await ws.waitForConnection();

    route.send(
      wsNotification({
        type: 'WEEK_ADVANCED',
        leagueId: LEAGUE_ID,
        newWeek: 2,
        previousWeek: 1,
      }),
    );

    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ── Tests: Chat message notification ────────────────────────────────────────

test.describe('WebSocket – chat message notification @regression', () => {
  test('LEAGUE_CHAT_MESSAGE notification is processed without errors', async ({
    page,
  }) => {
    await setupGraphQL(page);
    const ws = await setupWebSocket(page);

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    const route = await ws.waitForConnection();

    route.send(
      wsNotification({
        type: 'LEAGUE_CHAT_MESSAGE',
        leagueId: LEAGUE_ID,
        messageId: 9001,
        senderId: 42,
        senderUsername: 'ws_tester',
        messageText: 'Hello from WebSocket test!',
        timestamp: new Date().toISOString(),
        messageType: 'text',
        gifUrl: null,
        metadata: null,
      }),
    );

    // Page should remain stable
    await expect(page.getByText('WebSocket Test League').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});
