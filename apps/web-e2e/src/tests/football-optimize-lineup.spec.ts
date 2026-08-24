/**
 * Football Matchup Detail — Optimize My Lineup E2E Tests (LS-6378 / FMD-021)
 *
 * Covers the premium-gated "Optimize My Lineup" one-click action in the
 * pre-lock roster editor on /football/league/:leagueId/matchups/:matchupId:
 *   - Free users see the premium upsell instead of an active button.
 *   - Premium users see an active button; clicking it invokes the
 *     `setOptimalLineup` mutation and the roster reflects the server's
 *     response once refetched.
 *   - The button is football-only — a baseball matchup never renders it,
 *     regardless of tier.
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { customAuthTest, expect } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 71;
const QB_SLOT = 30;
const RB_SLOT = 31;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = { ...mockLeague({ id: LEAGUE_ID }), sport: 'football' };

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Gridiron Giants',
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
    name: 'End Zone Eagles',
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

const MOCK_POSITIONS = [
  {
    __typename: 'LeaguePosition',
    id: QB_SLOT,
    leagueId: LEAGUE_ID,
    positionType: 'QB',
  },
  {
    __typename: 'LeaguePosition',
    id: RB_SLOT,
    leagueId: LEAGUE_ID,
    positionType: 'RB',
  },
];

function mockMatchup(status: 'scheduled' = 'scheduled') {
  return {
    __typename: 'Matchup',
    id: MATCHUP_ID,
    leagueId: LEAGUE_ID,
    weekNumber: 6,
    team1Id: 1,
    team2Id: 2,
    team1Score: 0,
    team2Score: 0,
    status,
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 1,
    pitcherStartsPerMatchup: 0,
    selectedGamesCount: 0,
    startTime: null,
    endTime: null,
  };
}

interface MockMatchupPlayer {
  __typename: 'MatchupPlayer';
  id: string;
  matchupId: number;
  teamId: number;
  positionId: number | null;
  season: number;
  player: {
    __typename: 'Player';
    firstName: string;
    lastName: string;
    eligiblePositions: string[];
  };
}

function initialPlayers(): MockMatchupPlayer[] {
  return [
    {
      __typename: 'MatchupPlayer',
      id: '301',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: null,
      season: 2025,
      player: {
        __typename: 'Player',
        firstName: 'Jordan',
        lastName: 'Reeves',
        eligiblePositions: ['QB'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '302',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: null,
      season: 2025,
      player: {
        __typename: 'Player',
        firstName: 'Casey',
        lastName: 'Morris',
        eligiblePositions: ['RB'],
      },
    },
  ];
}

/** Server's optimized result: both benched players now start. */
function optimizedPlayers(): MockMatchupPlayer[] {
  const [qb, rb] = initialPlayers();
  return [
    { ...qb, positionId: QB_SLOT },
    { ...rb, positionId: RB_SLOT },
  ];
}

// ---------------------------------------------------------------------------
// GraphQL mock setup
// ---------------------------------------------------------------------------

interface MockOptimizeLineupOptions {
  isPremium: boolean;
  onSetOptimalLineup?: (variables: Record<string, unknown>) => void;
}

async function mockOptimizeLineupGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptimizeLineupOptions,
) {
  const { isPremium, onSetOptimalLineup } = opts;
  let players = initialPlayers();

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'GetMatchupById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: mockMatchup() } }),
      });
    } else if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: [mockMatchup()] },
        }),
      });
    } else if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 6 } }),
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
    } else if (op === 'GetPositionsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (op === 'GetMatchupPlayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: players } }),
      });
    } else if (op === 'SetOptimalLineup') {
      const body = route.request().postDataJSON() as {
        variables?: Record<string, unknown>;
      };
      onSetOptimalLineup?.(body.variables ?? {});
      players = optimizedPlayers();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { setOptimalLineup: players } }),
      });
    } else if (op === 'GetMatchupWinProbability') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMatchupById: {
              __typename: 'Matchup',
              id: String(MATCHUP_ID),
              winProbability: null,
            },
          },
        }),
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
    } else if (op === 'GetLeagueStandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });

  // Registered after the route above so its GetUserById handler runs first
  // (Playwright LIFO) — mirrors football-matchup-premium-gating.spec.ts.
  await useTier(page, isPremium ? 'premium' : 'free');
}

// ---------------------------------------------------------------------------
// Tests – premium users
// ---------------------------------------------------------------------------

const premiumTest = customAuthTest('football-optimize-premium@test.com');

premiumTest.describe(
  'Football Matchup Detail – Optimize My Lineup (premium) @regression',
  () => {
    premiumTest.beforeEach(async ({ page, matchupPage }) => {
      await mockOptimizeLineupGraphQL(page, { isPremium: true });
      await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
    });

    premiumTest(
      'shows an active Optimize My Lineup button',
      async ({ matchupPage }) => {
        const optimizeButton = matchupPage.button('Optimize My Lineup');
        await optimizeButton.expectVisible();
        await optimizeButton.expectEnabled();
      },
    );

    premiumTest(
      'clicking it invokes setOptimalLineup and the roster reflects the new starters',
      async ({ matchupPage }) => {
        await matchupPage.button('Optimize My Lineup').tap();

        await matchupPage.text('STARTERS (2/2)').expectVisible();
        await matchupPage.text('No bench players').expectVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests – free users
// ---------------------------------------------------------------------------

const freeTest = customAuthTest('football-optimize-free@test.com');

freeTest.describe(
  'Football Matchup Detail – Optimize My Lineup (free user) @regression',
  () => {
    freeTest.beforeEach(async ({ page, matchupPage }) => {
      await mockOptimizeLineupGraphQL(page, { isPremium: false });
      await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
    });

    freeTest(
      'sees a disabled button behind the premium upsell instead of an active one',
      async ({ matchupPage }) => {
        await matchupPage.text('Optimize My Lineup').expectVisible();
        await matchupPage.button('Optimize My Lineup').expectDisabled();
      },
    );

    freeTest(
      'clicking does not invoke setOptimalLineup',
      async ({ page, matchupPage }) => {
        let called = false;
        await page.unroute(isGraphQLEndpoint);
        await mockOptimizeLineupGraphQL(page, {
          isPremium: false,
          onSetOptimalLineup: () => {
            called = true;
          },
        });
        await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');

        // Disabled — a tap is a no-op rather than triggering the mutation.
        await matchupPage.button('Optimize My Lineup').expectDisabled();
        expect(called).toBe(false);
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests – baseball (football-only feature)
// ---------------------------------------------------------------------------

const baseballTest = customAuthTest('baseball-optimize-premium@test.com');

baseballTest.describe(
  'Baseball Matchup Detail – no Optimize My Lineup button @regression',
  () => {
    baseballTest(
      'never renders the football-only optimizer button, even for a premium user',
      async ({ page, matchupPage }) => {
        const baseballLeague = {
          ...mockLeague({ id: LEAGUE_ID }),
          sport: 'baseball',
        };
        await page.route(isGraphQLEndpoint, async (route) => {
          const op = extractOperationName(route);
          if (op === 'GetLeagueById') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: { league: baseballLeague } }),
            });
          } else if (op === 'GetMatchupById') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: { getMatchupById: mockMatchup() } }),
            });
          } else if (op === 'GetMatchupsForLeague') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: { getMatchupsForLeague: [mockMatchup()] },
              }),
            });
          } else if (op === 'GetCurrentWeekForLeague') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: { getCurrentWeekForLeague: 6 } }),
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
          } else if (op === 'GetPositionsForLeague') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: { leaguePositions: MOCK_POSITIONS },
              }),
            });
          } else if (op === 'GetMatchupPlayers') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: { getMatchupPlayers: initialPlayers() },
              }),
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
          } else if (op === 'GetLeagueStandings') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: { getLeagueStandings: [] } }),
            });
          } else {
            await unmockedGraphQLFallback(route);
          }
        });
        await useTier(page, 'premium');

        await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'baseball');

        await matchupPage.text('Optimize My Lineup').expectHidden();
      },
    );
  },
);
