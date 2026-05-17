/**
 * Roster Management E2E Tests
 *
 * Covers the League Roster Management tab at /baseball/league/:id/roster.
 * Tests the lineup slots, bench/bullpen regions, player name display,
 * and UI state management.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** URL predicate for the GraphQL API endpoint */

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E roster management test league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 5,
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
];

/** League positions — one slot per type for minimal lineup */
const MOCK_LEAGUE_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 1, positionType: 'SP' },
  { __typename: 'LeaguePosition', id: 2, leagueId: 1, positionType: 'C' },
  { __typename: 'LeaguePosition', id: 3, leagueId: 1, positionType: '1B' },
  { __typename: 'LeaguePosition', id: 4, leagueId: 1, positionType: 'CF' },
  { __typename: 'LeaguePosition', id: 5, leagueId: 1, positionType: 'UTIL' },
];

/** Team members — some in lineup (positionId set), some on bench (positionId null) */
const MOCK_TEAM_MEMBERS = [
  {
    __typename: 'TeamMember',
    id: 101,
    playerId: 501,
    positionId: 1, // SP slot → in lineup
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    player: {
      __typename: 'Player',
      id: 501,
      firstName: 'Gerrit',
      lastName: 'Cole',
      brefId: 'colege01',
      eligiblePositions: ['SP'],
      seasonsPlayed: 10,
      careerBatting: null,
    },
  },
  {
    __typename: 'TeamMember',
    id: 102,
    playerId: 502,
    positionId: 3, // 1B slot → in lineup
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    player: {
      __typename: 'Player',
      id: 502,
      firstName: 'Freddie',
      lastName: 'Freeman',
      brefId: 'freemfr01',
      eligiblePositions: ['1B'],
      seasonsPlayed: 12,
      careerBatting: { __typename: 'CareerBatting', games: 1800 },
    },
  },
  {
    __typename: 'TeamMember',
    id: 103,
    playerId: 503,
    positionId: null, // bench
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    salary: null,
    player: {
      __typename: 'Player',
      id: 503,
      firstName: 'Mookie',
      lastName: 'Betts',
      brefId: 'bettsmo01',
      eligiblePositions: ['CF', 'RF'],
      seasonsPlayed: 9,
      careerBatting: { __typename: 'CareerBatting', games: 1100 },
    },
  },
];

async function mockRosterGraphQL(
  page: import('@playwright/test').Page,
  opts: { emptyRoster?: boolean; membersError?: boolean } = {},
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getteammembers')) {
      if (opts.membersError) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Failed to load roster' }],
            data: { teamMembers: null },
          }),
        });
      } else if (opts.emptyRoster) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { teamMembers: [] } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { teamMembers: MOCK_TEAM_MEMBERS } }),
        });
      }
    } else if (postData.includes('getpositionsforleague')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { leaguePositions: MOCK_LEAGUE_POSITIONS },
        }),
      });
    } else if (postData.includes('getmatchupplayers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
    } else if (postData.includes('getleagueteams')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
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
      await unmockedGraphQLFallback(route);
    }
  });
}

test.describe('Roster Management — navigation @smoke', () => {
  test('navigates to the roster tab without errors', async ({ page }) => {
    await mockRosterGraphQL(page);
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/baseball/league/1/roster');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Roster Management – layout @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockRosterGraphQL(page);
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');
  });

  test('shows "My Roster" heading', async ({ page }) => {
    await expect(page.getByText('My Roster').first()).toBeVisible();
  });

  test('shows Lineup quickstat', async ({ page }) => {
    const rosterRegion = page.getByRole('region', {
      name: /roster management/i,
    });
    await expect(
      rosterRegion.getByText('Lineup', { exact: true }).first(),
    ).toBeVisible();
  });

  test('shows Bench quickstat', async ({ page }) => {
    const rosterRegion = page.getByRole('region', {
      name: /roster management/i,
    });
    await expect(
      rosterRegion.getByText('Bench', { exact: true }).first(),
    ).toBeVisible();
  });

  test('shows Open quickstat', async ({ page }) => {
    const rosterRegion = page.getByRole('region', {
      name: /roster management/i,
    });
    await expect(
      rosterRegion.getByText('Open', { exact: true }).first(),
    ).toBeVisible();
  });
});

test.describe('Roster Management – player data @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockRosterGraphQL(page);
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');
  });

  test('shows player in SP lineup slot', async ({ page }) => {
    // Gerrit Cole is assigned to positionId 1 (SP)
    await expect(page.getByText('Gerrit Cole')).toBeVisible();
  });

  test('shows player in infield lineup slot (1B)', async ({ page }) => {
    // Freddie Freeman is assigned to the 1B slot
    await expect(page.getByText('Freddie Freeman')).toBeVisible();
  });

  test('shows bench player not in lineup', async ({ page }) => {
    // Mookie Betts has positionId:null → on bench
    await expect(page.getByText('Mookie Betts')).toBeVisible();
  });

  test('shows SP position type label', async ({ page }) => {
    await expect(page.getByText('SP').first()).toBeVisible();
  });
});

test.describe('Roster Management – bench/bullpen regions @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockRosterGraphQL(page);
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');
  });

  test('shows Bench region', async ({ page }) => {
    await expect(page.getByRole('region', { name: /bench/i })).toBeVisible();
  });
});

test.describe('Roster Management — empty roster @regression', () => {
  test('shows empty roster state gracefully', async ({ page }) => {
    await mockRosterGraphQL(page, { emptyRoster: true });
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');

    // Page should not crash
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    // Roster heading should still appear
    await expect(page.getByText('My Roster').first()).toBeVisible();
  });

  test('shows empty bench message when no bench players', async ({ page }) => {
    await mockRosterGraphQL(page, { emptyRoster: true });
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');

    await expect(page.getByText('Bench is empty')).toBeVisible();
  });
});

test.describe('Roster Management — aria attributes for lineup slots @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockRosterGraphQL(page);
    await page.goto('/baseball/league/1/roster');
    await page.waitForLoadState('load');
  });

  test('roster slot for occupied position has correct aria-label', async ({
    page,
  }) => {
    // Gerrit Cole at SP
    await expect(
      page.getByRole('button', { name: /Gerrit Cole at SP/i }),
    ).toBeVisible();
  });

  test('empty lineup slot has aria-label indicating open slot', async ({
    page,
  }) => {
    // Positions C, CF, UTIL have no assigned player → open slots
    await expect(
      page.getByRole('button', { name: /open slot/i }).first(),
    ).toBeVisible();
  });
});
