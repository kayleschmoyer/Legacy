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
import { injectWebSocketUrl, isGraphQL } from './helpers/websocket-test-utils';
import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  extractRequestOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { FIXED_NOW_ISO, fromNowIso } from '../mocks/time';

// ── Constants ─────────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;
const LEAGUE_URL = `/baseball/league/${LEAGUE_ID}/overview`;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchup`;
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
    status: 'in_progress',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 10,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: 5,
    startTime: null,
    endTime: null,
    // Required by the Matchup fragment — Apollo silently drops cache writes
    // when fragment fields are missing from the response.
    team1: { __typename: 'Team', id: TEAM_1_ID, name: 'Home Team' },
    team2: { __typename: 'Team', id: TEAM_2_ID, name: 'Away Team' },
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

interface SetupOptions {
  /** League returned for getLeagueByid queries. */
  league?: typeof BASE_LEAGUE;
  /**
   * When non-null, the 2nd+ matchup query (getMatchupsByWeek or getMatchupById)
   * returns this matchup, simulating a refetch triggered by a WS event.
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

  // Use separate counters per query type so the first getMatchupById call
  // always returns null scores (initial state) and only subsequent calls
  // (triggered by WS events) return the updated scores.
  let matchupByIdCallCount = 0;
  let matchupsByWeekCallCount = 0;
  let leagueCallCount = 0;

  await page.route(isGraphQL, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    // LS-9866: exact equality on the extracted operation name. `postData`
    // held the whole POST body, so every test below also searched the query
    // TEXT — see the getmatchupbyid branch for what that reached.
    // `'"getleague"'` was the quote-delimited idiom, which can only hit an
    // operation named exactly GetLeague; none exists, so it was a dead branch.
    if (operation === 'getleaguebyid') {
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
      // LS-9866: 'getleagueteams' also matched GetLeagueTeamsForDM, which is
      // declared in the .graphql corpus but issued by no app code.
    } else if (operation === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operation === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (operation === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: TEAM_1_ID } }),
      });
    } else if (operation === 'getcurrentweekforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 1 } }),
      });
    } else if (operation === 'getmatchupsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: [mockMatchup()] },
        }),
      });
    } else if (operation === 'getmatchupsbyweek') {
      matchupsByWeekCallCount++;
      const m =
        matchupAfterRefetch !== null && matchupsByWeekCallCount > 1
          ? matchupAfterRefetch
          : mockMatchup();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsByWeek: [m] } }),
      });
      // LS-9866: as a substring of the POST body, 'getmatchupbyid' also
      // matched GetMatchupRecap and GetMatchupWinProbability through the query
      // TEXT — both select the `getMatchupById` root field while neither NAME
      // contains the string. This is the class that broke season-progression on
      // #7513. Neither needs this branch: GetMatchupWinProbability is served by
      // BASELINE_GRAPHQL_RESPONSES with the id-echoing payload LS-5907 requires
      // (a flat null clobbers the cached Matchup entity), and GetMatchupRecap is
      // never fired here because MatchupRecapPanel renders only for a completed
      // matchup while mockMatchup() is 'in_progress'. Narrowing also stops those
      // requests from inflating matchupByIdCallCount, which decides whether this
      // branch serves the initial or the post-refetch scores.
    } else if (operation === 'getmatchupbyid') {
      matchupByIdCallCount++;
      const m =
        matchupAfterRefetch !== null && matchupByIdCallCount > 1
          ? matchupAfterRefetch
          : mockMatchup();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: m } }),
      });
    } else if (operation === 'getmatchupplayers') {
      // Return null (not []) so computeMatchupScores hits the !players fallback
      // path and reads scores directly from matchup.team1Score/team2Score.
      // An empty array bypasses this fallback (empty arrays are truthy) and
      // the function computes 0 from the missing player stats instead.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: null } }),
      });
    } else if (
      operation === 'getleaguechatmessages' ||
      operation === 'getleaguemessages'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: [] } }),
      });
    } else if (operation === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (operation === 'getleagueactivity') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
      // LS-9866: 'leaguestandings' also matched GetUserLeagueStandings, which
      // selects a different root field and is served by the shared baseline.
    } else if (operation === 'getleaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
      // LS-9866: this payload is `{ userLeagues }`, which only GetUserLeagues
      // returns — 'getusers' matched GetUsersCount and AdminGetUsers, and
      // 'getuserleagues' also matched GetUserLeagueSummaries and
      // GetUserLeagueStandings (plus GetMyLeagues through the query text). All
      // of those select different root fields and are baseline-served.
    } else if (operation === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [league] } }),
      });
      // LS-9866: full operation name. 'getleaguescoring' was a prefix of it and
      // 'leaguescoringprofile' also matched the UpdateLeagueScoringProfile
      // mutation, which this null payload never answered.
    } else if (operation === 'getleaguescoringprofile') {
      // Returning null causes MatchupScoreboard to fall back to the raw
      // team1Score/team2Score fields on the matchup (no calculation needed).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
      // LS-9866: the GetPendingTradeOffers branch was deleted — no operation of
      // that name exists in the corpus, and no operation's query text contains
      // 'pendingtradeoffers' either, so it could never fire.
    } else if (operation === 'getteamwaiverclaims') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
    } else if (operation === 'getleagueannouncements') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('WebSocket real-time updates @critical', () => {
  // TODO: Chat panel (role="log"), scoreboard region, and draft status badge
  // are not present on the league overview page in the current UI. These tests
  // need to be updated once the WebSocket real-time UI is redesigned.
  test('chat message arrival — new message appears without page reload', async ({
    page,
  }) => {
    // 1. Inject WS URL so the app opens a socket even in CI (VITE_WEBSOCKET_URL="")
    await injectWebSocketUrl(page);

    // 2. GraphQL mocks (empty chat history)
    await setupGraphQL(page);

    // 3. Intercept the WebSocket connection before navigation.
    let wsRoute: WebSocketRoute | undefined;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      wsRoute = ws;
      ws.onMessage(() => {
        /* no-op */
      });
    });

    // 4. Navigate to the league overview
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('load');

    // 5. Switch to the Chat sub-tab so LeagueChatTab mounts (default is Activity)
    await page.getByRole('tab', { name: /^chat$/i }).click();

    // 6. Confirm the chat log element rendered
    await expect(
      page.getByRole('log', { name: /chat messages/i }),
    ).toBeVisible();

    // 7. Wait for the app to open the WebSocket connection
    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    // 8. Push a chat message from the "server"
    const messageText = 'Real-time message via WebSocket!';
    wsRoute.send(
      wsNotification({
        type: 'LEAGUE_CHAT_MESSAGE',
        leagueId: LEAGUE_ID,
        messageId: 9001,
        senderId: 42,
        senderUsername: 'ws_tester',
        messageText,
        timestamp: FIXED_NOW_ISO,
        messageType: 'text',
        gifUrl: null,
        metadata: null,
      }),
    );

    // 9. The message must appear in the chat log without a page refresh
    await expect(
      page.getByRole('log', { name: /chat messages/i }),
    ).toContainText(messageText);
  });

  test('matchup score update — MATCHUP_STATS_COMPLETE triggers score refresh', async ({
    page,
  }) => {
    // 1. Inject WS URL so the app opens a socket even in CI (VITE_WEBSOCKET_URL="")
    await injectWebSocketUrl(page);

    // After the WS event, the mocked GraphQL returns updated scores.
    // computeMatchupScores falls back to raw team1Score/team2Score when no
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

    // 2. Navigate to the Matchup tab where ScoreboardHero renders
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');

    // ScoreboardHero has role="region" aria-label="Week 1 scoreboard"
    const scoreboard = page.getByRole('region', { name: /week 1 scoreboard/i });
    await expect(scoreboard).toBeVisible();

    // Wait for the 'Live' chip — this confirms getMatchupById resolved and Apollo
    // wrote the initial data to cache (status 'in_progress' → MatchupStatus.InProgress
    // → chip label 'Live'). Without this, waitForResponse could catch the first
    // getMatchupById call (initial load) instead of the WS-triggered refetch.
    await expect(scoreboard).toContainText('Live');

    // Confirm initial scores are 0.00 (team1Score/team2Score are null in initial mock)
    await expect(scoreboard).toContainText('0.00');

    // 3. Wait for WS connection
    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    // 4. Push MATCHUP_STATS_COMPLETE — triggers MatchupTab refetch
    const refetchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/graphql') &&
        !resp.url().includes('/@fs/') &&
        // Match the operation NAME, not the body: a body-wide
        // `includes('getmatchupbyid')` also matches GetMatchupWinProbability,
        // whose response would settle this promise instead of the refetch
        // (LS-9866).
        extractRequestOperationName(resp.request()).toLowerCase() ===
          'getmatchupbyid',
    );
    wsRoute.send(
      wsNotification({
        type: 'MATCHUP_STATS_COMPLETE',
        leagueId: LEAGUE_ID,
        matchupId: 1,
        completedAt: FIXED_NOW_ISO,
      }),
    );

    // 5. Wait for the getMatchupById refetch to resolve, then check scores.
    // Scores are formatted with toFixed(2): 42.5 → "42.50", 38.0 → "38.00"
    await refetchPromise;
    await expect(scoreboard).toContainText('42.50');
    await expect(scoreboard).toContainText('38.00');
  });

  test('draft-started notification — status badge updates from Pre-Draft to Draft Queued', async ({
    page,
  }) => {
    // 1. Inject WS URL so the app opens a socket even in CI (VITE_WEBSOCKET_URL="")
    await injectWebSocketUrl(page);

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

    // Confirm the initial draft status chip is in the pre-draft state. Assert by
    // testid + visible label rather than the brittle
    // `[data-status="not-started"]` selector: the league hero renders the
    // pre-draft state with `data-status="pre-draft"`, so the exact-value selector
    // never matched. "Pre-Draft" is the stable contract (matches the
    // football-hub spec's pattern). LS-7845.
    await expect(page.getByTestId('draft-status-chip')).toContainText(
      /Pre-Draft/i,
    );

    // 2. Wait for WS connection. `expect.poll` only confirms *some* connection
    // has been observed — useLeagueWebSocketLifecycle no longer tears down and
    // recreates the socket once the async JWT refresh resolves (LS-7856), so
    // there is exactly one connection per page load and `wsRoute` is
    // unambiguous by construction. Still, guard against sending before the
    // final connection is up.
    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    // 3. Push DRAFT_STARTED — LeagueWSPageHandler calls refetchLeague().
    // Register the refetch wait *before* sending (mirroring the "matchup score
    // update" test above) so the test fails fast and clearly if the event
    // never reaches the app, instead of hitting the generic toContainText
    // timeout below.
    const refetchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/graphql') &&
        !resp.url().includes('/@fs/') &&
        extractRequestOperationName(resp.request()).toLowerCase() ===
          'getleaguebyid',
    );
    wsRoute.send(
      wsNotification({
        type: 'DRAFT_STARTED',
        leagueId: LEAGUE_ID,
        draftId: 1,
        draftOrder: 'snake',
        teamCount: 4,
        pickTimeLimitSeconds: 120,
        currentPickDeadline: fromNowIso(120_000),
        startedAt: FIXED_NOW_ISO,
      }),
    );

    // 4. After the refetch resolves the badge should change to "Draft Queued"
    // (DraftStatusChip maps 'queued' → 'Draft Queued'). Scope to the chip testid
    // so the assertion targets the hero badge specifically. LS-7845.
    await refetchPromise;
    await expect(page.getByTestId('draft-status-chip')).toContainText(
      'Draft Queued',
    );
  });
});
