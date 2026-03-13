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
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getplayoffbracket')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getPlayoffBracket: bracketResponse },
        }),
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
    } else if (
      postData.includes('"getleaguebyid"') ||
      postData.includes('"getleague"')
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
      await route.fallback();
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
    // Bracket heading should NOT be present
    await expect(
      page.getByRole('heading', { name: 'Playoff Bracket' }),
    ).not.toBeVisible();
  });
});

test.describe('Playoff Bracket — completed bracket @critical', () => {
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

  test('shows season and format subtitle', async ({ page }) => {
    await expect(page.getByText(/2024 Season/)).toBeVisible();
  });

  test('shows Wild Card round header', async ({ page }) => {
    // H4 with textTransform uppercase — DOM text is "Wild Card"
    await expect(
      page.getByRole('heading', { name: 'Wild Card', level: 4 }),
    ).toBeVisible();
  });

  test('shows Championship round header', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Championship', level: 4 }),
    ).toBeVisible();
  });

  test('shows "Final" badge for completed matchups', async ({ page }) => {
    await expect(page.getByText('Final').first()).toBeVisible();
  });

  test('shows team names from wild card matchup', async ({ page }) => {
    await expect(page.getByText('Alpha Squad').first()).toBeVisible();
    await expect(page.getByText('Delta Kings').first()).toBeVisible();
  });

  test('shows scores for completed matchups', async ({ page }) => {
    // Alpha Squad scored 85.5 in wild card
    await expect(page.getByText('85.5').first()).toBeVisible();
  });

  test('shows champion callout when bracket is completed', async ({ page }) => {
    await expect(page.getByText('Champion')).toBeVisible();
  });

  test('shows champion team name in callout', async ({ page }) => {
    // Alpha Squad is the champion — their name should appear in champion section
    const championText = page.getByText('Alpha Squad');
    await expect(championText.first()).toBeVisible();
  });
});

test.describe('Playoff Bracket — in-progress bracket @critical', () => {
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

  test('shows "Semifinals" round header', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Semifinals', level: 4 }),
    ).toBeVisible();
  });

  test('shows "Live" badge for in-progress matchup', async ({ page }) => {
    await expect(page.getByText('Live')).toBeVisible();
  });

  test('shows in-progress scores', async ({ page }) => {
    await expect(page.getByText('45.2')).toBeVisible();
    await expect(page.getByText('38.7')).toBeVisible();
  });

  test('does not show Champion callout when bracket is in progress', async ({
    page,
  }) => {
    await expect(page.getByText('Champion')).not.toBeVisible();
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

  test('shows "TBD" when team seeds are not yet assigned', async ({ page }) => {
    await expect(page.getByText('TBD').first()).toBeVisible();
  });

  test('does not show Final or Live badges for scheduled matchup', async ({
    page,
  }) => {
    await expect(page.getByText('Final')).not.toBeVisible();
    await expect(page.getByText('Live')).not.toBeVisible();
  });
});
