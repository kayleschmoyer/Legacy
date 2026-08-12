/**
 * Matchup Additional Sections E2E Tests (LS-5424)
 *
 * Covers the "Additional Sections" area of the football matchup detail page
 * (/football/league/:leagueId/matchups/:matchupId): Key Players to Watch,
 * Historical Head-to-Head, and League Context. Per the LS-5269 epic journey,
 * these subsections must render with data when present and degrade
 * gracefully when absent.
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';

// Page-object migration (LS-8451 / ADR-0016): matchup assertions speak
// `matchupPage` driver verbs. `page` is retained only for GraphQL route
// mocking (a web-only capability).

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const TEAM1_ID = 1;
const TEAM2_ID = 2;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 5,
  team1Id: TEAM1_ID,
  team2Id: TEAM2_ID,
  team1Score: 80.2,
  team2Score: 75.4,
  status: 'in_progress',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 0,
  pitcherStartsPerMatchup: 0,
  selectedGamesCount: 0,
  startTime: null,
  endTime: null,
  team1: { __typename: 'Team', id: TEAM1_ID, name: 'Alpha Squad' },
  team2: { __typename: 'Team', id: TEAM2_ID, name: 'Beta Force' },
};

const MOCK_LEAGUE = { ...mockLeague({ id: LEAGUE_ID }), sport: 'football' };

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: TEAM1_ID,
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
    id: TEAM2_ID,
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

const FOOTBALL_MATCHUP_SCORES_WITH_DATA = [
  {
    __typename: 'FootballMatchupStats',
    teamId: TEAM1_ID,
    teamName: 'Alpha Squad',
    totalPoints: 80.2,
    players: [
      {
        __typename: 'FootballMatchupPlayer',
        playerId: 101,
        playerName: 'Pat Mahomes',
        position: 'QB',
        totalPoints: 32.4,
      },
    ],
  },
  {
    __typename: 'FootballMatchupStats',
    teamId: TEAM2_ID,
    teamName: 'Beta Force',
    totalPoints: 75.4,
    players: [
      {
        __typename: 'FootballMatchupPlayer',
        playerId: 202,
        playerName: 'Justin Jefferson',
        position: 'WR',
        totalPoints: 28.1,
      },
    ],
  },
];

const HEAD_TO_HEAD_HISTORY_WITH_DATA = [
  {
    __typename: 'Matchup',
    id: '99',
    weekNumber: 2,
    leagueId: LEAGUE_ID,
    team1Id: TEAM1_ID,
    team2Id: TEAM2_ID,
    team1Score: 100.5,
    team2Score: 90.2,
    status: 'completed',
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 0,
    pitcherStartsPerMatchup: 0,
    selectedGamesCount: 0,
    startTime: null,
    endTime: null,
    team1: { __typename: 'Team', id: TEAM1_ID, name: 'Alpha Squad' },
    team2: { __typename: 'Team', id: TEAM2_ID, name: 'Beta Force' },
  },
];

const LEAGUE_STANDINGS_WITH_DATA = [
  {
    __typename: 'TeamStanding',
    teamId: String(TEAM1_ID),
    teamName: 'Alpha Squad',
    wins: 6,
    losses: 2,
    ties: 0,
    winPercentage: 0.75,
    pointsFor: 640.5,
    pointsAgainst: 590.1,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
    divisionName: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: String(TEAM2_ID),
    teamName: 'Beta Force',
    wins: 5,
    losses: 3,
    ties: 0,
    winPercentage: 0.625,
    pointsFor: 610.2,
    pointsAgainst: 601.8,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
    divisionName: null,
  },
];

/**
 * Route matchup GraphQL operations to fixtures. `additionalSectionsData`
 * controls what the three Additional Sections queries return, letting a
 * test swap between "with data" and "empty" fixtures while reusing the
 * same catch-all wiring for every other query the page fires.
 */
async function mockMatchupGraphQL(
  page: import('@playwright/test').Page,
  additionalSectionsData: {
    matchupScores: unknown[];
    teamMatchupHistory: unknown[];
    leagueStandings: unknown[];
  },
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      switch (extractOperationName(route)) {
        case 'GetMatchupById':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
          });
          break;
        case 'GetMatchupsForLeague':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { getMatchupsForLeague: [MOCK_MATCHUP] },
            }),
          });
          break;
        case 'GetCurrentWeekForLeague':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getCurrentWeekForLeague: 5 } }),
          });
          break;
        case 'GetUserTeamId':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { userTeamId: null } }),
          });
          break;
        case 'GetLeagueTeams':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
          });
          break;
        case 'GetLeagueById':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
          });
          break;
        case 'GetMatchupPlayers':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
          });
          break;
        case 'MatchupScores':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { matchupScores: additionalSectionsData.matchupScores },
            }),
          });
          break;
        case 'GetTeamMatchupHistory':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                getTeamMatchupHistory:
                  additionalSectionsData.teamMatchupHistory,
              },
            }),
          });
          break;
        case 'GetLeagueStandings':
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                getLeagueStandings: additionalSectionsData.leagueStandings,
              },
            }),
          });
          break;
        default:
          await unmockedGraphQLFallback(route);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tests — subsections render with mocked data present
// ---------------------------------------------------------------------------

test.describe('Matchup Additional Sections – with data @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockMatchupGraphQL(page, {
      matchupScores: FOOTBALL_MATCHUP_SCORES_WITH_DATA,
      teamMatchupHistory: HEAD_TO_HEAD_HISTORY_WITH_DATA,
      leagueStandings: LEAGUE_STANDINGS_WITH_DATA,
    });
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test('shows the Key Players to Watch section with top scorers', async ({
    matchupPage,
  }) => {
    const section = matchupPage.testId('key-players-section');
    await section.expectVisible();
    await matchupPage.text('Pat Mahomes').expectVisible();
    await matchupPage.text('Justin Jefferson').expectVisible();
  });

  test('shows the Historical Head-to-Head section with a prior meeting', async ({
    matchupPage,
  }) => {
    const section = matchupPage.testId('matchup-history-section');
    await section.expectVisible();
    await matchupPage.text('Week 2').expectVisible();
  });

  test('shows the League Context section with both teams standings', async ({
    matchupPage,
  }) => {
    const section = matchupPage.testId('league-context-section');
    await section.expectVisible();
    await matchupPage
      .text(/Alpha Squad/)
      .first()
      .expectVisible();
    await matchupPage
      .text(/Beta Force/)
      .first()
      .expectVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests — subsections degrade gracefully when their data is absent
// ---------------------------------------------------------------------------

test.describe('Matchup Additional Sections – empty state @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockMatchupGraphQL(page, {
      matchupScores: [],
      teamMatchupHistory: [],
      leagueStandings: [],
    });
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test('shows a placeholder when no key player data is loaded yet', async ({
    matchupPage,
  }) => {
    await matchupPage.text('No key player data available yet.').expectVisible();
  });

  test('shows a placeholder when there is no previous meeting this season', async ({
    matchupPage,
  }) => {
    await matchupPage.text('No previous meetings this season.').expectVisible();
  });

  test('shows a placeholder when standings are unavailable', async ({
    matchupPage,
  }) => {
    await matchupPage.text('Standings not yet available.').expectVisible();
  });
});
