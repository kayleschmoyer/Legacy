/**
 * Playoff Bracket E2E Tests
 *
 * Covers the PlayoffBracketDisplay component rendered on the Standings tab
 * within the League Detail page (/baseball/league/:id/standings).
 *
 * All GraphQL queries are stubbed via Playwright route handlers that return
 * canned responses based on the operation name in the request body.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** URL predicate for the GraphQL API endpoint */

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E playoff bracket test league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 10,
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
  waiverType: 'standard',
  // LS-4171: V2 StandingsTab gates the bracket section on
  // `league.playoffEnabled`. Without this flag the bracket never renders.
  playoffEnabled: true,
  playoffFormat: '4-team',
  playoffMultiWeek: false,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 3,
    name: 'Gamma Stars',
    owner: 3,
    leagueId: 1,
    waiverOrder: 3,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 4,
    name: 'Delta Kings',
    owner: 4,
    leagueId: 1,
    waiverOrder: 4,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_STANDINGS = [
  {
    __typename: 'TeamStanding',
    teamId: 1,
    teamName: 'Alpha Squad',
    wins: 8,
    losses: 2,
    ties: 0,
    winPercentage: 0.8,
    pointsFor: 620,
    pointsAgainst: 480,
    avatarUrl: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 2,
    teamName: 'Beta Force',
    wins: 6,
    losses: 4,
    ties: 0,
    winPercentage: 0.6,
    pointsFor: 570,
    pointsAgainst: 530,
    avatarUrl: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 3,
    teamName: 'Gamma Stars',
    wins: 4,
    losses: 6,
    ties: 0,
    winPercentage: 0.4,
    pointsFor: 510,
    pointsAgainst: 590,
    avatarUrl: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 4,
    teamName: 'Delta Kings',
    wins: 2,
    losses: 8,
    ties: 0,
    winPercentage: 0.2,
    pointsFor: 450,
    pointsAgainst: 650,
    avatarUrl: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

/** A completed bracket with all three rounds */
const MOCK_BRACKET_COMPLETED = {
  __typename: 'PlayoffBracket',
  id: 1,
  leagueId: 1,
  season: 2024,
  format: '4-team',
  startWeek: 9,
  endWeek: 11,
  championTeamId: 1,
  status: 'completed',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-11-01T00:00:00Z',
  championTeam: { __typename: 'Team', id: 1, name: 'Alpha Squad' },
  matchups: [
    {
      __typename: 'PlayoffMatchup',
      id: 1,
      bracketId: 1,
      round: 'wildcard',
      matchupNumber: 1,
      highSeedTeamId: 1,
      lowSeedTeamId: 4,
      winnerTeamId: 1,
      highSeedScore: 85.5,
      lowSeedScore: 62.3,
      weekNumber: 9,
      status: 'completed',
      isMultiWeek: false,
      highSeedTeam: { __typename: 'Team', id: 1, name: 'Alpha Squad' },
      lowSeedTeam: { __typename: 'Team', id: 4, name: 'Delta Kings' },
      winnerTeam: { __typename: 'Team', id: 1, name: 'Alpha Squad' },
    },
    {
      __typename: 'PlayoffMatchup',
      id: 2,
      bracketId: 1,
      round: 'wildcard',
      matchupNumber: 2,
      highSeedTeamId: 2,
      lowSeedTeamId: 3,
      winnerTeamId: 3,
      highSeedScore: 70.1,
      lowSeedScore: 78.9,
      weekNumber: 9,
      status: 'completed',
      isMultiWeek: false,
      highSeedTeam: { __typename: 'Team', id: 2, name: 'Beta Force' },
      lowSeedTeam: { __typename: 'Team', id: 3, name: 'Gamma Stars' },
      winnerTeam: { __typename: 'Team', id: 3, name: 'Gamma Stars' },
    },
    {
      __typename: 'PlayoffMatchup',
      id: 3,
      bracketId: 1,
      round: 'finals',
      matchupNumber: 1,
      highSeedTeamId: 1,
      lowSeedTeamId: 3,
      winnerTeamId: 1,
      highSeedScore: 91.2,
      lowSeedScore: 74.6,
      weekNumber: 11,
      status: 'completed',
      isMultiWeek: false,
      highSeedTeam: { __typename: 'Team', id: 1, name: 'Alpha Squad' },
      lowSeedTeam: { __typename: 'Team', id: 3, name: 'Gamma Stars' },
      winnerTeam: { __typename: 'Team', id: 1, name: 'Alpha Squad' },
    },
  ],
};

/** A bracket that is in progress (semifinals round) */
const MOCK_BRACKET_IN_PROGRESS = {
  __typename: 'PlayoffBracket',
  id: 2,
  leagueId: 1,
  season: 2024,
  format: '4-team',
  startWeek: 9,
  endWeek: 11,
  championTeamId: null,
  status: 'in_progress',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-10-15T00:00:00Z',
  championTeam: null,
  matchups: [
    {
      __typename: 'PlayoffMatchup',
      id: 4,
      bracketId: 2,
      round: 'semifinals',
      matchupNumber: 1,
      highSeedTeamId: 1,
      lowSeedTeamId: 4,
      winnerTeamId: null,
      highSeedScore: 45.2,
      lowSeedScore: 38.7,
      weekNumber: 10,
      status: 'in_progress',
      isMultiWeek: false,
      highSeedTeam: { __typename: 'Team', id: 1, name: 'Alpha Squad' },
      lowSeedTeam: { __typename: 'Team', id: 4, name: 'Delta Kings' },
      winnerTeam: null,
    },
  ],
};

/** A scheduled bracket (no scores yet, TBD seeds) */
const MOCK_BRACKET_SCHEDULED = {
  __typename: 'PlayoffBracket',
  id: 3,
  leagueId: 1,
  season: 2024,
  format: '4-team',
  startWeek: 12,
  endWeek: 14,
  championTeamId: null,
  status: 'scheduled',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  championTeam: null,
  matchups: [
    {
      __typename: 'PlayoffMatchup',
      id: 5,
      bracketId: 3,
      round: 'wildcard',
      matchupNumber: 1,
      highSeedTeamId: null,
      lowSeedTeamId: null,
      winnerTeamId: null,
      highSeedScore: null,
      lowSeedScore: null,
      weekNumber: 12,
      status: 'scheduled',
      isMultiWeek: false,
      highSeedTeam: null,
      lowSeedTeam: null,
      winnerTeam: null,
    },
  ],
};

/** Install base GraphQL route handlers without playoff bracket */
async function mockStandingsGraphQL(
  page: import('@playwright/test').Page,
  bracketResponse: object | null = null,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getplayoffbracket') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getPlayoffBracket: bracketResponse },
        }),
      });
    } else if (operation === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (operation === 'getleaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: MOCK_STANDINGS } }),
      });
    } else if (operation === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (operation === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (operation === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (operation === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Playoff Bracket — no bracket state @smoke', () => {
  test('standings tab renders without errors when no bracket exists', async ({
    page,
  }) => {
    await mockStandingsGraphQL(page, null);
    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/baseball/league/1/standings');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    // Standings should still render
    await expect(page.getByText('Alpha Squad')).toBeVisible();
    // The shared PlayoffBracket component is hidden entirely when no bracket
    // data exists (same as legacy V1 — no empty-state placeholder is shown).
    await expect(
      page.getByRole('heading', { name: 'Playoff Bracket' }),
    ).not.toBeVisible();
  });
});

// LS-7810: The V2 StandingsTab now uses the shared PlayoffBracket component
// from @legacy-sports/shared-components (the inline BracketView was removed).
// The shared component renders human-readable round labels (`Wild Card`,
// `Semifinals`, `Championship`) and shows `TBD` for unassigned seeds.

test.describe('Playoff Bracket – completed bracket @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockStandingsGraphQL(page, MOCK_BRACKET_COMPLETED);
    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');
  });

  test('shows "Playoff Bracket" heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Playoff Bracket' }),
    ).toBeVisible();
  });

  test('shows wildcard round header', async ({ page }) => {
    await expect(page.getByText('Wild Card', { exact: true })).toBeVisible();
  });

  test('shows finals round header', async ({ page }) => {
    await expect(page.getByText('Championship', { exact: true })).toBeVisible();
  });

  test('shows team names from wild card matchup', async ({ page }) => {
    await expect(page.getByText('Alpha Squad').first()).toBeVisible();
    await expect(page.getByText('Delta Kings').first()).toBeVisible();
  });

  test('shows scores for completed matchups', async ({ page }) => {
    // Alpha Squad scored 85.5 in the wild card matchup.
    await expect(page.getByText('85.5').first()).toBeVisible();
  });
});

test.describe('Playoff Bracket – in-progress bracket @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockStandingsGraphQL(page, MOCK_BRACKET_IN_PROGRESS);
    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');
  });

  test('shows Playoffs Bracket heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Playoff Bracket' }),
    ).toBeVisible();
  });

  test('shows semifinals round header', async ({ page }) => {
    await expect(page.getByText('Semifinals', { exact: true })).toBeVisible();
  });

  test('shows in-progress scores', async ({ page }) => {
    await expect(page.getByText('45.2')).toBeVisible();
    await expect(page.getByText('38.7')).toBeVisible();
  });
});

test.describe('Playoff Bracket — scheduled bracket @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockStandingsGraphQL(page, MOCK_BRACKET_SCHEDULED);
    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');
  });

  test('shows bracket heading for scheduled bracket', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Playoff Bracket' }),
    ).toBeVisible();
  });

  test('shows TBD placeholder when team seeds are not yet assigned', async ({
    page,
  }) => {
    // The shared PlayoffBracket renders 'TBD' for unassigned seeds.
    await expect(page.getByText('TBD').first()).toBeVisible();
  });
});

// LS-5960: regression guard — now that LeagueService.createLeague includes
// playoffEnabled in .returning(), the Apollo cache always has the real value.
// The bracket query is skipped when playoffEnabled is false/null, and fires
// only when playoffEnabled is true.
test.describe('Playoff Bracket — playoffEnabled flag @regression', () => {
  test('does not render bracket section when playoffEnabled is null', async ({
    page,
  }) => {
    const leagueWithNullFlag = {
      ...MOCK_LEAGUE,
      playoffEnabled: null,
      playoffFormat: null,
      playoffMultiWeek: null,
    };
    await page.route(isGraphQLEndpoint, async (route) => {
      const operation = extractOperationName(route).toLowerCase();
      if (operation === 'getleagueteams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
      } else if (operation === 'getleaguestandings') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getLeagueStandings: MOCK_STANDINGS },
          }),
        });
      } else if (operation === 'getpositionsforleague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
        });
      } else if (operation === 'getleaguebyid') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league: leagueWithNullFlag } }),
        });
      } else if (operation === 'getuserteamid') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else if (operation === 'getuserleagues') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { userLeagues: [leagueWithNullFlag] },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });
    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');

    // Bracket query is skipped when playoffEnabled is null — heading must not appear.
    await expect(
      page.getByRole('heading', { name: 'Playoff Bracket' }),
    ).not.toBeVisible();
  });
});
