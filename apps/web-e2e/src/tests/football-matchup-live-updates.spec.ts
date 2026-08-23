/**
 * Football Matchup Detail — Live Score Updates via WebSocket (LS-5425)
 *
 * Covers /football/league/:leagueId/matchups/:matchupId:
 *   - A live MATCHUP_STATS_COMPLETE notification for the displayed matchup
 *     triggers a refetch and the scoreboard re-renders with the updated
 *     score, without a page reload.
 *
 * Ported from apps/web-e2e/src/tests/matchup-detail.spec.ts's GraphQL mock
 * setup (baseball route) and apps/web-e2e/src/tests/websocket-realtime.spec.ts's
 * "matchup score update" test (WebSocket mocking mechanics), navigating to
 * the football matchup detail route instead.
 *
 * Reconnect-refetch coverage for this page (AC2) lives at the unit level
 * (apps/web/src/pages/matchup/MatchupDetailPage.spec.tsx,
 * apps/web/src/features/matchup/MatchupScoreboard.spec.tsx) rather than here
 * — this codebase's own precedent (see the comment atop
 * websocket-lifecycle.spec.ts) is that a WebSocket reconnect is not reliably
 * simulated at the Playwright layer via routeWebSocket close/reopen.
 */

import type { Request, WebSocketRoute } from '@playwright/test';
import { injectWebSocketUrl } from './helpers/websocket-test-utils';
import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function mockMatchup(team1Score: number, team2Score: number) {
  return {
    __typename: 'Matchup',
    id: MATCHUP_ID,
    leagueId: LEAGUE_ID,
    weekNumber: 3,
    team1Id: 1,
    team2Id: 2,
    team1Score,
    team2Score,
    status: 'in_progress',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 7,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: 4,
    startTime: null,
    endTime: null,
    winProbability: null,
  };
}

const MOCK_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  sport: 'football',
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mirrors extractOperationName's JSON-body parsing (shared-mocks.ts), but
// against a Request rather than a Route — page.waitForResponse's predicate
// only has the Response (and its .request()), not a Route to intercept.
// A precise operationName match avoids matching an unrelated operation whose
// query text happens to contain "getmatchupbyid" as a substring.
function graphQLOperationName(request: Request): string {
  try {
    const body = JSON.parse(request.postData() ?? '') as {
      operationName?: string;
    };
    return body.operationName ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function wsNotification(data: Record<string, unknown>): string {
  return JSON.stringify({ type: 'notification', data });
}

async function mockMatchupGraphQL(
  page: import('@playwright/test').Page,
  opts: { initialMatchup: ReturnType<typeof mockMatchup> },
) {
  let currentMatchup = opts.initialMatchup;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route);

      if (op === 'GetMatchupById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupById: currentMatchup } }),
        });
      } else if (op === 'GetMatchupsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsForLeague: [currentMatchup] },
          }),
        });
      } else if (op === 'GetCurrentWeekForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
        });
      } else if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
        });
      } else if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else if (op === 'GetMatchupPlayers') {
        // Return null (not []) so computeMatchupScores hits the !players
        // fallback path and reads scores directly from
        // matchup.team1Score/team2Score, mirroring
        // websocket-realtime.spec.ts's precedent. An empty array is truthy
        // and bypasses that fallback, computing 0 from missing player stats.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupPlayers: null } }),
        });
      } else if (op === 'GetLeagueStandings') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getLeagueStandings: [] } }),
        });
      } else if (op === 'MatchupScores') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { matchupScores: [] } }),
        });
      } else if (op === 'GetTeamMatchupHistory') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getTeamMatchupHistory: [] } }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    },
  );

  return {
    // Flip the matchup returned by every subsequent GetMatchupById /
    // GetMatchupsForLeague response, simulating the server-side score
    // update that a MATCHUP_STATS_COMPLETE push signals the client to fetch.
    setMatchupAfterRefetch: (updated: ReturnType<typeof mockMatchup>) => {
      currentMatchup = updated;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Football Matchup Detail — live score updates @critical', () => {
  test('MATCHUP_STATS_COMPLETE for the displayed matchup refetches and re-renders the score without a page reload', async ({
    page,
    matchupPage,
  }) => {
    // 1. Inject WS URL so the app opens a socket even in CI.
    await injectWebSocketUrl(page);

    // 2. GraphQL mocks — initial load shows 0-0.
    const { setMatchupAfterRefetch } = await mockMatchupGraphQL(page, {
      initialMatchup: mockMatchup(0, 0),
    });

    // 3. Intercept the WebSocket connection before navigation.
    let wsRoute: WebSocketRoute | undefined;
    await page.routeWebSocket(/wss?:\/\//, (ws) => {
      wsRoute = ws;
      ws.onMessage(() => {
        /* no-op */
      });
    });

    // 4. Navigate to the football matchup detail route (not baseball).
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
    await page.waitForLoadState('load');

    const scoreboard = matchupPage.scoreboardRegion(/week 3 scoreboard/i);
    await scoreboard.expectVisible();
    await scoreboard.expectContainsText('0.00');

    // 5. Wait for the app to open the WebSocket connection.
    await expect.poll(() => wsRoute !== undefined).toBe(true);
    if (!wsRoute) throw new Error('WebSocket route not established');

    // 6. The next GetMatchupById/GetMatchupsForLeague response carries the
    // updated score — simulating the server having recalculated it.
    setMatchupAfterRefetch(mockMatchup(42.5, 38.0));

    // 7. Push MATCHUP_STATS_COMPLETE for this exact matchup.
    const refetchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/graphql') &&
        !resp.url().includes('/@fs/') &&
        graphQLOperationName(resp.request()) === 'GetMatchupById',
    );
    wsRoute.send(
      wsNotification({
        type: 'MATCHUP_STATS_COMPLETE',
        leagueId: LEAGUE_ID,
        matchupId: MATCHUP_ID,
        completedAt: new Date().toISOString(),
      }),
    );

    // 8. The scoreboard re-renders with the updated score — no page reload.
    await refetchPromise;
    await scoreboard.expectContainsText('42.50');
    await scoreboard.expectContainsText('38.00');
  });
});
