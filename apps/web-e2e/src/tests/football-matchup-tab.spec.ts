/**
 * Football Matchup Tab E2E Tests (LS-5418)
 *
 * Covers the Matchup tab on the Football League Detail page
 * (/football/league/:leagueId/matchup):
 *   - Both team panels render with player rows and a score for each side
 *   - Roster rows use football position slots (QB/RB/WR/TE/FLEX/K/DST)
 *   - Clicking a player opens the football player detail modal
 *   - Live score updates (WebSocket-driven MATCHUP_STATS_COMPLETE) refresh
 *     the scoreboard without a full page reload
 *
 * All GraphQL calls are mocked via page.route(); the WebSocket connection is
 * intercepted via page.routeWebSocket(). No live backend is required.
 */

import type { WebSocketRoute } from '@playwright/test';
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
const MATCHUP_ID = 500;
const MATCHUP_URL = `/football/league/${LEAGUE_ID}/matchup`;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Gridiron League',
  description: 'E2E football matchup-tab test league',
  sport: 'football',
  owner: 1,
  maxRosterSize: 16,
  draftStatus: 'completed',
  currentMatchup: MATCHUP_ID,
  numberOfTeams: 2,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: null,
  maxPitchers: null,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: 'GRID1234',
  userMembership: { teamId: 1 },
  minCareerGames: null,
  minCareerSeasons: null,
  waiverType: 'standard',
  currentWeekNumber: 1,
  totalMatchups: 14,
  gamesPerMatchup: null,
  pitcherStartsPerMatchup: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Gridiron Giants',
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
    name: 'End Zone Eagles',
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
  {
    __typename: 'LeaguePosition',
    id: 1,
    leagueId: LEAGUE_ID,
    positionType: 'QB',
  },
  {
    __typename: 'LeaguePosition',
    id: 2,
    leagueId: LEAGUE_ID,
    positionType: 'RB',
  },
  {
    __typename: 'LeaguePosition',
    id: 3,
    leagueId: LEAGUE_ID,
    positionType: 'WR',
  },
  {
    __typename: 'LeaguePosition',
    id: 4,
    leagueId: LEAGUE_ID,
    positionType: 'TE',
  },
  {
    __typename: 'LeaguePosition',
    id: 5,
    leagueId: LEAGUE_ID,
    positionType: 'FLEX',
  },
  {
    __typename: 'LeaguePosition',
    id: 6,
    leagueId: LEAGUE_ID,
    positionType: 'K',
  },
  {
    __typename: 'LeaguePosition',
    id: 7,
    leagueId: LEAGUE_ID,
    positionType: 'DST',
  },
];

function makeMatchup(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Matchup',
    id: String(MATCHUP_ID),
    leagueId: LEAGUE_ID,
    weekNumber: 1,
    team1Id: 1,
    team2Id: 2,
    team1Score: 84.5,
    team2Score: 79.2,
    status: 'in_progress',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: null,
    pitcherStartsPerMatchup: null,
    selectedGamesCount: null,
    startTime: null,
    endTime: null,
    ...overrides,
  };
}

const CURRENT_MATCHUP = makeMatchup();

function makeMatchupPlayer(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    __typename: 'MatchupPlayer',
    id: 1,
    matchupId: MATCHUP_ID,
    playerId: 100,
    teamId: 1,
    positionId: 1,
    numberOfGames: 1,
    season: 2025,
    games: [],
    seasonBatting: null,
    seasonPitching: null,
    seasonFielding: null,
    player: {
      __typename: 'Player',
      id: 100,
      firstName: 'Pat',
      lastName: 'Thrower',
      brefId: null,
      eligiblePositions: ['QB'],
    },
    ...overrides,
  };
}

const MOCK_MATCHUP_PLAYERS = [
  makeMatchupPlayer({
    id: 1,
    playerId: 100,
    teamId: 1,
    positionId: 1,
    player: {
      __typename: 'Player',
      id: 100,
      firstName: 'Pat',
      lastName: 'Thrower',
      brefId: null,
      eligiblePositions: ['QB'],
    },
  }),
  makeMatchupPlayer({
    id: 2,
    playerId: 200,
    teamId: 2,
    positionId: 1,
    player: {
      __typename: 'Player',
      id: 200,
      firstName: 'Chris',
      lastName: 'Signal',
      brefId: null,
      eligiblePositions: ['QB'],
    },
  }),
];

// ---------------------------------------------------------------------------
// GraphQL mock setup
// ---------------------------------------------------------------------------

interface MockOptions {
  currentMatchup?: Record<string, unknown>;
  matchupPlayers?: Record<string, unknown>[];
}

async function mockFootballMatchupGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const {
    currentMatchup = CURRENT_MATCHUP,
    matchupPlayers = MOCK_MATCHUP_PLAYERS,
  } = opts;

  let matchupByIdCallCount = 0;
  let matchupPlayersCallCount = 0;

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();

    if (op === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (op === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'getcurrentweekforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 1 } }),
      });
    } else if (op === 'getmatchupsbyweek') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsByWeek: [currentMatchup] } }),
      });
    } else if (op === 'getmatchupsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: [currentMatchup] },
        }),
      });
    } else if (op === 'getmatchupbyid') {
      matchupByIdCallCount++;
      // Second+ call simulates the WS-triggered refetch after MATCHUP_STATS_COMPLETE.
      // Status flips to 'completed' too: computeMatchupScores only reads the
      // matchup's raw team1Score/team2Score fields directly for a completed
      // matchup — otherwise it derives score client-side from player stats,
      // so the raw score bump below wouldn't be reflected in the UI.
      const respondWith =
        matchupByIdCallCount > 1
          ? {
              ...currentMatchup,
              status: 'completed',
              team1Score: 91.4,
              team2Score: 79.2,
            }
          : currentMatchup;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: respondWith } }),
      });
    } else if (op === 'getmatchupplayers') {
      matchupPlayersCallCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: matchupPlayers } }),
      });
      void matchupPlayersCallCount;
    } else if (op === 'getleaguescoringprofile') {
      // No scoring profile mocked — MatchupScoreboard falls back to the
      // matchup's server-stored team1Score/team2Score fields.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else if (op === 'getleagueactivity') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (op === 'getleaguechatmessages') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: [] } }),
      });
    } else if (op === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (op === 'footballplayer') {
      const requestedId = (() => {
        try {
          const body = JSON.parse(route.request().postData() ?? '{}') as {
            variables?: { id?: number };
          };
          return body.variables?.id ?? null;
        } catch {
          return null;
        }
      })();
      const player = MOCK_MATCHUP_PLAYERS.find(
        (mp) => (mp.player as { id: number }).id === requestedId,
      )?.player;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            footballPlayer: player
              ? {
                  ...player,
                  position: 'QB',
                  isDst: false,
                  nflTeam: 'KC',
                  pfrId: null,
                  headshotUrl: null,
                  previousTeams: null,
                  projectedFantasyPoints: null,
                  adpRank: null,
                  careerStats: null,
                }
              : null,
          },
        }),
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

function wsNotification(data: Record<string, unknown>): string {
  return JSON.stringify({ type: 'notification', data });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Football Matchup Tab — rendering @smoke', () => {
  test.beforeEach(async ({ page, leaguePage }) => {
    await mockFootballMatchupGraphQL(page);
    await leaguePage.gotoDetail(LEAGUE_ID, 'matchup', 'football');
  });

  test('navigates to the matchup tab without error', async ({
    page,
    leaguePage,
  }) => {
    await expect(page).toHaveURL(MATCHUP_URL);
    await leaguePage.expectNoAppError();
  });

  test('shows both team panels with scores', async ({ leaguePage }) => {
    await leaguePage.text('Gridiron Giants').first().expectVisible();
    await leaguePage.text('End Zone Eagles').first().expectVisible();
    await leaguePage.text('84.5', { exact: false }).first().expectVisible();
    await leaguePage.text('79.2', { exact: false }).first().expectVisible();
  });

  test('shows player rows for both teams in the roster comparison', async ({
    leaguePage,
  }) => {
    await leaguePage.text('Pat Thrower').expectVisible();
    await leaguePage.text('Chris Signal').expectVisible();
  });

  test('shows the football QB position slot label', async ({ leaguePage }) => {
    await leaguePage.text('QB', { exact: true }).first().expectVisible();
  });
});

test.describe('Football Matchup Tab — player click @regression', () => {
  test('clicking a player opens the football player detail modal', async ({
    page,
    leaguePage,
  }) => {
    await mockFootballMatchupGraphQL(page);
    await leaguePage.gotoDetail(LEAGUE_ID, 'matchup', 'football');

    await leaguePage.text('Pat Thrower').expectVisible();
    await leaguePage.text('Pat Thrower').tap();

    // FootballPlayerDetailModal renders the resolved player's name as its
    // (visually hidden) dialog title once the footballPlayer query resolves.
    // Scoped to the accessible name: an unrelated native <dialog> element is
    // also present on the page, so an unscoped role query is ambiguous.
    await expect(
      page.getByRole('dialog', { name: 'Player details' }),
    ).toBeVisible();
  });
});

test.describe('Football Matchup Tab — live score updates @regression', () => {
  test('MATCHUP_STATS_COMPLETE notification refreshes the score without a full page reload', async ({
    page,
    leaguePage,
  }) => {
    await mockFootballMatchupGraphQL(page);
    const ws = await setupWebSocket(page);

    await leaguePage.gotoDetail(LEAGUE_ID, 'matchup', 'football');
    await leaguePage.text('84.5', { exact: false }).first().expectVisible();

    // A full page reload would tear down and re-establish the WS connection —
    // track navigations so the update-without-reload assertion is enforced,
    // not just implied by "we never called page.reload()".
    let navigationCount = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigationCount++;
    });

    const route = await ws.waitForConnection();

    const refetchPromise = page.waitForResponse((resp) => {
      const url = resp.url();
      if (!url.includes('/graphql') || url.includes('/@fs/')) return false;
      try {
        const body = JSON.parse(resp.request().postData() ?? '{}') as {
          operationName?: string;
        };
        return body.operationName?.toLowerCase() === 'getmatchupbyid';
      } catch {
        return false;
      }
    });

    route.send(
      wsNotification({
        type: 'MATCHUP_STATS_COMPLETE',
        leagueId: LEAGUE_ID,
        matchupId: MATCHUP_ID,
        completedAt: '2026-08-10T00:00:00.000Z',
      }),
    );

    await refetchPromise;

    // Updated score (91.4) appears in place, no navigation occurred.
    await leaguePage.text('91.4', { exact: false }).first().expectVisible();
    expect(navigationCount).toBe(0);
    await leaguePage.expectNoAppError();
  });
});
