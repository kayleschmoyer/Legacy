/**
 * Football Home — Upcoming / Active Matchup Highlight (LS-5407)
 *
 * QA epic: "Football Home" (LS-5267). Journey under test: a manager
 * mid-season sees this week's matchup highlighted on Football Home so they
 * know who they're playing without digging into the league.
 *
 *   - A football league with an active/upcoming matchup in the mock shows the
 *     matchup highlight card with both team names and the matchup week.
 *   - The card is absent when no matchup is scheduled.
 *
 * All GraphQL responses are mocked via route.fulfill() (never route.continue()).
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';

const FOOTBALL_LEAGUE_ID = 55;
const MATCHUP_ID = 900;

const FOOTBALL_LEAGUE_WITH_MATCHUP = {
  ...mockLeague({
    id: FOOTBALL_LEAGUE_ID,
    name: 'Highlight Test League',
    draftStatus: 'completed',
    currentMatchup: MATCHUP_ID,
    currentWeekNumber: 6,
    playerPool: 'all',
  }),
  sport: 'football',
};

const FOOTBALL_LEAGUE_NO_MATCHUP = {
  ...mockLeague({
    id: FOOTBALL_LEAGUE_ID,
    name: 'No Matchup League',
    draftStatus: 'not-started',
    currentMatchup: null,
    currentWeekNumber: null,
    playerPool: 'all',
  }),
  sport: 'football',
};

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: FOOTBALL_LEAGUE_ID,
  weekNumber: 6,
  team1Id: 1,
  team2Id: 2,
  team1Score: null,
  team2Score: null,
  status: 'scheduled',
  statsLoadingStatus: 'pending',
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: 0,
  selectedGamesCount: 1,
  startTime: null,
  endTime: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Highlight Home Team',
    owner: 1,
    leagueId: FOOTBALL_LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Highlight Away Team',
    owner: 2,
    leagueId: FOOTBALL_LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
  },
];

async function mockFootballHome(
  page: import('@playwright/test').Page,
  { withMatchup }: { withMatchup: boolean },
) {
  const league = withMatchup
    ? FOOTBALL_LEAGUE_WITH_MATCHUP
    : FOOTBALL_LEAGUE_NO_MATCHUP;

  await createGraphQLRouter(page, {
    getuserleagues: (route) =>
      fulfillJson(route, {
        data: { userLeagues: [league], userLeagueCount: 1 },
      }),
    getmatchupbyid: (route) =>
      fulfillJson(route, {
        data: { getMatchupById: withMatchup ? MOCK_MATCHUP : null },
      }),
    getleagueteams: (route) =>
      fulfillJson(route, { data: { leagueTeams: MOCK_TEAMS } }),
  });
}

test.describe('Football Home — matchup highlight card @regression', () => {
  test('shows the matchup highlight card with both team names and the week when a league has an active/upcoming matchup', async ({
    page,
  }) => {
    await mockFootballHome(page, { withMatchup: true });
    await page.goto('/football');
    await page.waitForLoadState('load');

    const card = page.getByTestId('matchup-highlight-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('Highlight Home Team');
    await expect(card).toContainText('Highlight Away Team');
    await expect(card).toContainText('Week 6');
  });

  test('does not show the matchup highlight card when no matchup is scheduled', async ({
    page,
  }) => {
    await mockFootballHome(page, { withMatchup: false });
    await page.goto('/football');
    await page.waitForLoadState('load');

    await expect(page.getByTestId('football-screen')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('matchup-highlight-card')).toHaveCount(0);
  });
});
