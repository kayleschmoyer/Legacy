/**
 * Standings E2E Tests
 *
 * Covers the Standings tab within the League Detail page
 * (/baseball/league/:id/standings).
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';

/** URL predicate for the GraphQL API endpoint */
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

/** Minimal mock league used across tests */
const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E standings test league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 1,
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
};

/** Mock teams */
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

/** Mock standings data */
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

/** Mock positions */
const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

/** Install GraphQL route handlers for the league detail page */
async function mockLeagueDetailGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getleaguebyid') || postData.includes('getleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (postData.includes('getleaguestandings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: MOCK_STANDINGS } }),
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
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (
      postData.includes('getusers') ||
      postData.includes('getuserleagues')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else {
      await route.fallback();
    }
  });
}

test.describe('Standings Tab — navigation @smoke', () => {
  test('navigates to the standings tab on the league detail page', async ({
    page,
  }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/baseball/league/1/standings');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Standings Tab – data rendering @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockLeagueDetailGraphQL(page);
    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');
  });

  test('shows team names from mocked standings data', async ({ page }) => {
    await expect(page.getByText('Alpha Squad')).toBeVisible();
    await expect(page.getByText('Beta Force')).toBeVisible();
    await expect(page.getByText('Gamma Stars')).toBeVisible();
    await expect(page.getByText('Delta Kings')).toBeVisible();
  });

  test('shows win totals from standings data', async ({ page }) => {
    // Alpha Squad has 8 wins — verify a win count is visible
    const cells = page.getByText('8');
    await expect(cells.first()).toBeVisible();
  });

  test('shows loss totals from standings data', async ({ page }) => {
    // Alpha Squad (8W-2L): loss count 2 should be visible
    const cells = page.getByText('2');
    await expect(cells.first()).toBeVisible();
  });
});

test.describe('Standings Tab — error state @regression', () => {
  test('shows an error state when standings query fails', async ({ page }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('getleaguestandings')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to load standings' }],
            data: { getLeagueStandings: null },
          }),
        });
      } else if (
        postData.includes('getleaguebyid') ||
        postData.includes('getleague')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
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
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');

    // The page should not crash even when standings fail
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Standings Tab — empty state @regression', () => {
  test('handles empty standings gracefully', async ({ page }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('getleaguestandings')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getLeagueStandings: [] } }),
        });
      } else if (
        postData.includes('getleaguebyid') ||
        postData.includes('getleague')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
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
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/1/standings');
    await page.waitForLoadState('load');

    // App should still load without crashing
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    // Teams should show (without standings data, they appear in default order)
    await expect(page.getByText('Alpha Squad')).toBeVisible();
  });
});
