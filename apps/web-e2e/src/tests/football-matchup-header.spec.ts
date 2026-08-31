/**
 * Football Matchup Header E2E Tests (LS-5426)
 *
 * Covers the matchup header/scoreboard area on
 * /football/league/:leagueId/matchups/:matchupId, per the parent QA epic
 * LS-5269's "Matchup Header" journey: back-to-league control, week/period
 * label, both team names, both scores, and each team's W-L-T record.
 *
 * Ports the baseball coverage in matchup-detail.spec.ts to the football
 * route (previously untested — every existing matchup-detail spec hard-codes
 * `/baseball/...`), and adds coverage for the new record field wired into
 * MatchupScoreboardView.
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

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
const MATCHUP_URL = `/football/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;
const TEAM1_ID = 1;
const TEAM2_ID = 2;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Test Football League',
  description: 'E2E football matchup header test',
  owner: 1,
  sport: 'football',
  defensiveFormat: 'dst',
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: MATCHUP_ID,
  numberOfTeams: 2,
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
  inviteCode: 'FBHEADER1',
  userMembership: { teamId: TEAM1_ID },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: 1,
  totalMatchups: 17,
  playoffEnabled: true,
  playoffFormat: '4-team',
  playoffMultiWeek: false,
  frozenAt: null,
  lmNote: null,
  tradeDeadlineWeek: null,
  currentWeekNumber: 3,
};

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 3,
  team1Id: TEAM1_ID,
  team2Id: TEAM2_ID,
  team1Score: 102.4,
  team2Score: 96.8,
  status: 'in_progress',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: 1,
  selectedGamesCount: 1,
  startTime: null,
  endTime: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: TEAM1_ID,
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
    id: TEAM2_ID,
    name: 'Blitz Brigade',
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

const MOCK_MATCHUPS_FOR_LEAGUE = [MOCK_MATCHUP];

const MOCK_STANDINGS = [
  {
    __typename: 'TeamStanding',
    teamId: String(TEAM1_ID),
    teamName: 'Gridiron Giants',
    wins: 7,
    losses: 3,
    ties: 1,
    winPercentage: 0.682,
    pointsFor: 950.4,
    pointsAgainst: 880.1,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
    divisionName: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: String(TEAM2_ID),
    teamName: 'Blitz Brigade',
    wins: 5,
    losses: 5,
    ties: 0,
    winPercentage: 0.5,
    pointsFor: 900.2,
    pointsAgainst: 910.6,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
    divisionName: null,
  },
];

async function mockFootballMatchupGraphQL(
  page: import('@playwright/test').Page,
) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route);

      if (op === 'GetMatchupById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
        });
      } else if (op === 'GetMatchupsForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsForLeague: MOCK_MATCHUPS_FOR_LEAGUE },
          }),
        });
      } else if (op === 'GetCurrentWeekForLeague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
        });
      } else if (op === 'GetUserTeamId') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: TEAM1_ID } }),
        });
      } else if (op === 'GetLeagueTeams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
        });
      } else if (op === 'GetLeagueStandings') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getLeagueStandings: MOCK_STANDINGS },
          }),
        });
      } else if (op === 'MatchupScores') {
        // Football-only live-scoring query fired by MatchupAdditionalSections;
        // an empty list is a valid, minimal response for this header-only test.
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
}

// ---------------------------------------------------------------------------
// Tests — matchup header (LS-5426, epic LS-5269 "Matchup Header" journey)
// ---------------------------------------------------------------------------

test.describe('Football Matchup Header @smoke', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockFootballMatchupGraphQL(page);
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test('navigates to the football matchup detail route without errors', async ({
    page,
    matchupPage,
  }) => {
    await expect(page).toHaveURL(MATCHUP_URL);
    await matchupPage.expectNoAppError();
  });

  test('shows the Matchup Details heading and Back to League control', async ({
    matchupPage,
  }) => {
    await matchupPage.heading(/matchup details/i).expectVisible();
    await matchupPage.button(/back to league/i).expectVisible();
  });

  test('clicking Back to League navigates to the football league page', async ({
    page,
    matchupPage,
  }) => {
    await matchupPage.goBackToLeague();
    await expect(page).toHaveURL(`/football/league/${LEAGUE_ID}`);
  });

  test('shows the week/period label', async ({ matchupPage }) => {
    await matchupPage.weekLabel(MOCK_MATCHUP.weekNumber).expectVisible();
  });

  test('shows both team names and scores in the scoreboard region', async ({
    matchupPage,
  }) => {
    // The region's accessible name embeds both team names, bound to the
    // mocked GetLeagueTeams response — a bare `matchupPage.text(name)` check
    // is redundant here and strict-mode-ambiguous (the team name also
    // appears in MatchupAdditionalSections' Key Players / History panels).
    await matchupPage
      .scoreboardRegion(
        `Week ${MOCK_MATCHUP.weekNumber} scoreboard: ${MOCK_TEAMS[0].name} vs ${MOCK_TEAMS[1].name}`,
      )
      .expectVisible();
    await matchupPage
      .text(MOCK_MATCHUP.team1Score.toFixed(2))
      .first()
      .expectVisible();
    await matchupPage
      .text(MOCK_MATCHUP.team2Score.toFixed(2))
      .first()
      .expectVisible();
  });

  test("shows each team's W-L-T record", async ({ matchupPage }) => {
    await matchupPage
      .testId(`team-record-${TEAM1_ID}`)
      .expectContainsText('7-3-1');
    await matchupPage
      .testId(`team-record-${TEAM2_ID}`)
      .expectContainsText('5-5');
  });
});
