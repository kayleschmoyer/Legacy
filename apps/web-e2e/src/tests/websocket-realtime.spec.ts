/**
 * WebSocket Real-Time Updates E2E Tests (LS-693)
 *
 * Covers three live-update scenarios driven purely by injected WebSocket
 * notifications (no real backend required):
 *
 *   1. Chat message arrival — LEAGUE_CHAT_MESSAGE → message appears in the
 *      chat log without a page refresh.
 *
 *   2. Live matchup score update — MATCHUP_STATS_COMPLETE triggers a GraphQL
 *      refetch; the scoreboard re-renders with fresh scores.
 *
 *   3. Draft-started notification — DRAFT_STARTED triggers a league refetch;
 *      the draft status badge transitions from "Pre-Draft" → "Queued".
 *
 * All GraphQL calls are mocked via page.route(); only the WebSocket channel
 * carries the live events (via page.routeWebSocket()).
 *
 * WHY routeWebSocket works here
 * ─────────────────────────────
 * The app reads `VITE_WEBSOCKET_URL` (baked in at build time from .env) and
 * opens a WebSocket to that URL when a league page loads.  Playwright's
 * routeWebSocket() intercepts all WS connections matching the pattern before
 * they reach the real server, simulating the server from the test side.
 */

import type { WebSocketRoute } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from '../fixtures/auth-enhanced';

// ── Constants ─────────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;
const LEAGUE_URL = `/baseball/league/${LEAGUE_ID}/overview`;
const TEAM_1_ID = 1; // matches the test JWT (user id=1)
const TEAM_2_ID = 2;

// ── Mock Data ─────────────────────────────────────────────────────────────────

const BASE_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Live Sports League',
  description: 'WS test league',
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
  inviteCode: 'TEST1234',
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

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
];

function mockMatchup(
  team1Score: number | null = null,
  team2Score: number | null = null,
) {
  return {
    __typename: 'Matchup',
    id: '1',
    weekNumber: 1,
    leagueId: LEAGUE_ID,
    team1Id: TEAM_1_ID,
    team2Id: TEAM_2_ID,
    team1Score,
    team2Score,
    status: 'in-progress',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 10,
    spStartsPerMatchup: 2,
    selectedGamesCount: 5,
    startTime: null,
    endTime: null,
  };
}

// ── Wire-format helpers ────────────────────────────────────────────────────────

/**
 * Wrap a notification payload in the wire format consumed by WebSocketClient:
 *   { type: 'notification', data: { type: 'UPPER_SNAKE_CASE', ...payload } }
 */
function wsNotification(data: Record<string, unknown>): string {
  return JSON.stringify({ type: 'notification', data });
}

// ── GraphQL route helper ───────────────────────────────────────────────────────

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
  /** League returned for getLeagueByid queries. */
  league?: typeof BASE_LEAGUE;
  /**
   * When non-null, the 2nd+ call to getMatchupsForLeague returns this matchup
   * (simulating a refetch triggered by a WS event).
   */
  matchupAfterRefetch?: ReturnType<typeof mockMatchup> | null;
  /**
   * When true, the 2nd+ call to getLeagueByid returns draftStatus='queued'
   * (simulating a DRAFT_STARTED event followed by a refetch).
   */
  draftStartsOnRefetch?: boolean;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    league = BASE_LEAGUE,
    matchupAfterRefetch = null,
    draftStartsOnRefetch = false,
  } = opts;

  let matchupCallCount = 0;
  let leagueCallCount = 0;

  await page.route(isGraphQL, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

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
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
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
      matchupCallCount++;
      const m =
        matchupAfterRefetch !== null && matchupCallCount > 1
          ? matchupAfterRefetch
          : mockMatchup();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: [m] } }),
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
      postData.includes('getteammembers') ||
      postData.includes('teammembers')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
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
      // Returning null causes MatchupScoreboard to fall back to the raw
      // team1Score/team2Score fields on the matchup (no calculation needed).
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
    } else {
      await route.fallback();
    }
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('WebSocket real-time updates @critical', () => {
  test('chat message arrival — new message appears without page reload', async ({
    page,
  }) => {
    // 1. GraphQL mocks (empty chat history)
    await setupGraphQL(page);

    // 2. Intercept the WebSocket connection before navigation.
    //    We capture the route reference so we can push a message later.
    // wsRoute is undefined until the app opens the WebSocket connection;
    // we poll for it becoming non-undefined before sending messages.
    let wsRoute: WebSocketRoute | undefined;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      wsRoute = ws;
      // Silently absorb heartbeat pings and other browser→server traffic.
      ws.onMessage(() => {
        /* no-op */
      });
    });

    // 3. Navigate to the league overview (the chat panel lives here)
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // 4. Confirm the chat panel rendered
    await expect(
      page.getByRole('log', { name: /chat messages/i }),
    ).toBeVisible();

    // 5. Wait for the app to open the WebSocket connection
    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    // 6. Push a chat message from the "server"
    const messageText = 'Real-time message via WebSocket!';
    wsRoute.send(
      wsNotification({
        type: 'LEAGUE_CHAT_MESSAGE',
        leagueId: LEAGUE_ID,
        messageId: 9001,
        senderId: 42,
        senderUsername: 'ws_tester',
        messageText,
        timestamp: new Date().toISOString(),
        messageType: 'text',
        gifUrl: null,
        metadata: null,
      }),
    );

    // 7. The message must appear in the chat log without a page refresh
    await expect(
      page.getByRole('log', { name: /chat messages/i }),
    ).toContainText(messageText);
  });

  test('matchup score update — MATCHUP_STATS_COMPLETE triggers score refresh', async ({
    page,
  }) => {
    // After the WS event, the mocked GraphQL returns updated scores.
    // MatchupScoreboard falls back to raw team1Score/team2Score when no
    // scoring profile is configured (which is the case in our mock).
    const updatedMatchup = mockMatchup(42.5, 38.0);

    await setupGraphQL(page, { matchupAfterRefetch: updatedMatchup });

    let wsRoute: WebSocketRoute | undefined;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      wsRoute = ws;
      ws.onMessage(() => {
        /* no-op */
      });
    });

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // The scoreboard renders because we have a matchup for week 1 and userTeamId=1
    const scoreboard = page.getByRole('region', { name: /week 1 scoreboard/i });
    await expect(scoreboard).toBeVisible();

    // Confirm initial state shows 0.00 (no scores yet)
    await expect(scoreboard).toContainText('0.00');

    // Wait for WS connection
    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    // Push MATCHUP_STATS_COMPLETE — triggers refetchMatchupsRef.current?.()
    // and refetchCurrentWeekRef.current?.()
    wsRoute.send(
      wsNotification({
        type: 'MATCHUP_STATS_COMPLETE',
        leagueId: LEAGUE_ID,
        matchupId: 1,
        completedAt: new Date().toISOString(),
      }),
    );

    // The refetch returns updatedMatchup; scoreboard must show the new scores.
    // Scores are formatted with toFixed(2): 42.5 → "42.50", 38.0 → "38.00"
    await expect(scoreboard).toContainText('42.50');
    await expect(scoreboard).toContainText('38.00');
  });

  test('draft-started notification — status badge updates from Pre-Draft to Queued', async ({
    page,
  }) => {
    // League starts as 'not-started'; the 2nd league query (triggered by the
    // DRAFT_STARTED event) returns 'queued'.
    await setupGraphQL(page, {
      league: { ...BASE_LEAGUE, draftStatus: 'not-started' },
      draftStartsOnRefetch: true,
    });

    let wsRoute: WebSocketRoute | undefined;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      wsRoute = ws;
      ws.onMessage(() => {
        /* no-op */
      });
    });

    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // Confirm the initial draft status badge says "Pre-Draft"
    await expect(page.getByText('Pre-Draft')).toBeVisible();

    // Wait for WS connection
    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    // Push DRAFT_STARTED — triggers handleDraftStarted() → backgroundRefetch()
    wsRoute.send(
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

    // After the refetch resolves, the badge should change to "Queued"
    await expect(page.getByText('Queued')).toBeVisible();
  });
});
