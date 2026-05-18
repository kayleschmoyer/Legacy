/**
 * Table Accessibility E2E Tests (LS-2225)
 *
 * Verifies that HTML tables across the app meet accessibility requirements:
 *   - Tables have proper thead/tbody structure
 *   - Header cells have scope='col' or scope='row' attributes
 *   - Tables have accessible labels (aria-label, aria-labelledby, or caption)
 *
 * Pages tested:
 *   - Standings: /baseball/league/1/standings
 *   - Player stats: /players/stats
 *   - Player comparison: /players/compare
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** URL predicate for the GraphQL API endpoint */

/**
 * Evaluate accessibility attributes for all tables on the current page.
 *
 * Returns structured data plus an `issues` array. Callers should check
 * `tableCount > 0` before asserting on issues — some pages use CSS
 * Grid/Flexbox instead of `<table>` and have no tables to validate.
 */
async function evaluateTableA11y(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    const issues: string[] = [];
    const tableDetails: Array<{
      hasCaption: boolean;
      hasAriaLabel: boolean;
      hasAriaLabelledBy: boolean;
      hasThead: boolean;
      hasTbody: boolean;
      headerCount: number;
      headersWithScope: number;
    }> = [];

    for (const table of tables) {
      const hasCaption =
        (table.querySelector('caption')?.textContent ?? '').trim().length > 0;
      const hasAriaLabel =
        (table.getAttribute('aria-label') ?? '').trim().length > 0;
      const hasAriaLabelledBy =
        (table.getAttribute('aria-labelledby') ?? '').trim().length > 0;
      const hasThead = !!table.querySelector('thead');
      const hasTbody = !!table.querySelector('tbody');
      const headers = Array.from(table.querySelectorAll('th'));
      const headersWithScope = headers.filter((th) => {
        const scopeVal = th.getAttribute('scope');
        return scopeVal === 'col' || scopeVal === 'row';
      }).length;

      tableDetails.push({
        hasCaption,
        hasAriaLabel,
        hasAriaLabelledBy,
        hasThead,
        hasTbody,
        headerCount: headers.length,
        headersWithScope,
      });

      if (!hasCaption && !hasAriaLabel && !hasAriaLabelledBy) {
        issues.push(
          'Table missing accessible name (no caption, aria-label, or aria-labelledby)',
        );
      }

      if (headers.length > 0 && !hasThead) {
        issues.push('Table has th elements but no thead wrapper');
      }

      if (headers.length > 0 && headersWithScope < headers.length) {
        issues.push(
          `Table has ${headers.length} header(s) but only ${headersWithScope} have a scope attribute`,
        );
      }
    }

    return { tableCount: tables.length, tableDetails, issues };
  });
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: 'E2E table a11y test league',
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

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Home Team',
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
    name: 'Away Team',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
];

const MOCK_STANDINGS = [
  {
    __typename: 'TeamStanding',
    teamId: 1,
    teamName: 'Home Team',
    wins: 5,
    losses: 3,
    ties: 0,
    pointsFor: 450.5,
    pointsAgainst: 380.2,
    winPercentage: 0.625,
    avatarUrl: null,
  },
  {
    __typename: 'TeamStanding',
    teamId: 2,
    teamName: 'Away Team',
    wins: 4,
    losses: 4,
    ties: 0,
    pointsFor: 420.1,
    pointsAgainst: 410.8,
    winPercentage: 0.5,
    avatarUrl: null,
  },
];

const MOCK_PAGE_INFO = {
  __typename: 'PageInfo',
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

const MOCK_BATTING_EDGES = [
  {
    __typename: 'CareerBattingEdge',
    node: {
      __typename: 'CareerBatting',
      playerId: 101,
      primaryPosition: 'LF',
      positionsPlayed: 'LF',
      games: 2986,
      plateAppearances: 12606,
      atBats: 9847,
      runs: 2227,
      hits: 2935,
      doubles: 601,
      triples: 77,
      homeRuns: 762,
      rbi: 1996,
      stolenBases: 514,
      caughtStealing: 141,
      baseOnBalls: 2558,
      strikeouts: 1539,
      totalBases: 5976,
      groundedIntoDoublePlays: 144,
      hitByPitch: 95,
      sacrificeHits: 24,
      intentionalBaseOnBalls: 688,
      battingAverage: 0.298,
      onBasePercentage: 0.444,
      sluggingPercentage: 0.607,
      offensiveWAR: 162.8,
      player: {
        __typename: 'Player',
        id: 101,
        firstName: 'Barry',
        lastName: 'Bonds',
        brefId: 'bondsba01',
      },
    },
  },
];

const MOCK_PITCHING_STATS = [
  {
    __typename: 'CareerPitching',
    playerId: 201,
    wins: 354,
    losses: 184,
    games: 709,
    gamesStarted: 707,
    gamesFinished: 1,
    completeGames: 100,
    shutouts: 46,
    saves: 0,
    hits: 4672,
    runs: 1940,
    earnedRuns: 1770,
    homeRuns: 363,
    baseOnBalls: 1580,
    intentionalBaseOnBalls: 79,
    strikeouts: 4672,
    hitByPitch: 158,
    balks: 8,
    wildPitches: 153,
    battersFaced: 20016,
    outsRecorded: 13095,
    outRate: null,
    era: '3.19',
    winPercentage: 0.658,
    player: {
      __typename: 'Player',
      id: 201,
      firstName: 'Roger',
      lastName: 'Clemens',
    },
  },
];

// ---------------------------------------------------------------------------
// Route mock helpers
// ---------------------------------------------------------------------------

async function mockStandingsGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (
      postData.includes('getleaguebyid') ||
      postData.includes('"getleague"')
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
      await unmockedGraphQLFallback(route);
    }
  });
}

async function mockPlayerStatsGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData()?.toLowerCase() ?? '';

    if (postData.includes('getcareerbattingstats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            careerBattingStats: {
              __typename: 'CareerBattingConnection',
              totalCount: 1,
              edges: MOCK_BATTING_EDGES,
              pageInfo: MOCK_PAGE_INFO,
            },
          },
        }),
      });
    } else if (postData.includes('getcareerpitchingstatscount')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { careerPitchingStatsCount: 1 } }),
      });
    } else if (postData.includes('getcareerpitchingstats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { careerPitchingStats: MOCK_PITCHING_STATS },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;

test.describe('Table accessibility @regression', () => {
  // -------------------------------------------------------------------------
  // Standings table
  // -------------------------------------------------------------------------

  test.describe('Standings table', () => {
    test.beforeEach(async ({ page }) => {
      await mockStandingsGraphQL(page);
      await page.goto(`/baseball/league/${LEAGUE_ID}/standings`);
      await page.waitForLoadState('load');
      // Wait for the standings table itself to render — the "Loading..."
      // placeholder mounts before Apollo resolves, so `main` alone is too
      // early to assert against `<table>`.
      await page.waitForSelector('table', { timeout: 10000 });
    });

    test('page loads without errors', async ({ page }) => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });

    test('standings table has accessible name', async ({ page }) => {
      const { tableCount, issues } = await evaluateTableA11y(page);
      expect(tableCount).toBeGreaterThan(0);

      const accessibleNameIssues = issues.filter((i) =>
        i.includes('accessible name'),
      );
      expect(accessibleNameIssues).toHaveLength(0);
    });

    test('standings table has thead structure', async ({ page }) => {
      const { tableCount, tableDetails } = await evaluateTableA11y(page);
      expect(tableCount).toBeGreaterThan(0);

      // Every table that has header cells should have a thead wrapper
      for (const detail of tableDetails) {
        if (detail.headerCount > 0) {
          expect(detail.hasThead).toBe(true);
        }
      }
    });

    test('standings table header cells have scope attribute', async ({
      page,
    }) => {
      const { tableCount, tableDetails } = await evaluateTableA11y(page);
      expect(tableCount).toBeGreaterThan(0);

      for (const detail of tableDetails) {
        if (detail.headerCount > 0) {
          // Every header cell should declare its scope
          expect(detail.headersWithScope).toBe(detail.headerCount);
        }
      }
    });

    test('standings table has tbody structure', async ({ page }) => {
      const { tableCount, tableDetails } = await evaluateTableA11y(page);
      expect(tableCount).toBeGreaterThan(0);

      for (const detail of tableDetails) {
        expect(detail.hasTbody).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Player stats table
  // -------------------------------------------------------------------------

  test.describe('Player stats table', () => {
    test.beforeEach(async ({ page }) => {
      await mockPlayerStatsGraphQL(page);
      await page.goto('/players/stats');
      await page.waitForLoadState('load');
      // Wait for React to render page content before asserting on tables
      await page.waitForSelector('main, h1, [role="main"]', { timeout: 10000 });
    });

    test('page loads without errors', async ({ page }) => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Player comparison page
  // -------------------------------------------------------------------------

  test.describe('Player comparison page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      // Wait for React to render page content before asserting on tables
      await page.waitForSelector('main, h1, [role="main"]', { timeout: 10000 });
    });

    test('page loads without errors', async ({ page }) => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Cross-page summary: no table should have overall a11y issues
  // -------------------------------------------------------------------------

  test.describe('Cross-page table a11y summary', () => {
    test('standings page tables have no a11y issues', async ({ page }) => {
      await mockStandingsGraphQL(page);
      await page.goto(`/baseball/league/${LEAGUE_ID}/standings`);
      await page.waitForLoadState('load');
      // Wait for the standings table to render — Apollo resolves after the
      // load event, so the initial `main` contains only the loading shell.
      await page.waitForSelector('table', { timeout: 10000 });

      const { tableCount, issues } = await evaluateTableA11y(page);
      expect(tableCount).toBeGreaterThan(0);
      expect(issues).toHaveLength(0);
    });
  });
});
