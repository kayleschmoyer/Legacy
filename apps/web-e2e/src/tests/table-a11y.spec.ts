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

import { adminTest, expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

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
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
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

async function mockPlayerStatsGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const operation = extractOperationName(route).toLowerCase();

    if (operation === 'getcareerbattingstats') {
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
    } else if (operation === 'getcareerpitchingstatscount') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { careerPitchingStatsCount: 1 } }),
      });
    } else if (operation === 'getcareerpitchingstats') {
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

// Two premium players with the career/scoring fields the comparison table reads.
const MOCK_COMPARE_PLAYERS = [
  {
    __typename: 'Player',
    id: 1,
    firstName: 'Aaron',
    lastName: 'Judge',
    eligiblePositions: ['OF'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 850,
      avgPointsPerGame: 2.1,
      hitterScore: 80,
      pitchingScore: 0,
      fieldingScore: 5,
    },
    careerBatting: {
      games: 900,
      hits: 900,
      homeRuns: 220,
      rbi: 600,
      runs: 520,
      stolenBases: 10,
      baseOnBalls: 400,
      totalBases: 1800,
      offensiveWAR: 42.0,
    },
    averageSeasonBatting: {
      battingAverage: 0.282,
      onBasePercentage: 0.387,
      sluggingPercentage: 0.579,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 5,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 3,
      worldSeriesRings: 1,
    },
  },
  {
    __typename: 'Player',
    id: 2,
    firstName: 'Shohei',
    lastName: 'Ohtani',
    eligiblePositions: ['SP', 'DH'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 960,
      avgPointsPerGame: 2.6,
      hitterScore: 75,
      pitchingScore: 60,
      fieldingScore: 3,
    },
    careerBatting: {
      games: 760,
      hits: 640,
      homeRuns: 175,
      rbi: 480,
      runs: 400,
      stolenBases: 50,
      baseOnBalls: 310,
      totalBases: 1400,
      offensiveWAR: 38.5,
    },
    averageSeasonBatting: {
      battingAverage: 0.274,
      onBasePercentage: 0.377,
      sluggingPercentage: 0.564,
    },
    careerPitching: {
      games: 130,
      wins: 55,
      losses: 23,
      saves: 0,
      strikeouts: 1200,
      baseOnBalls: 250,
      winPercentage: 0.705,
      era: '2.94',
    },
    careerAchievements: {
      allStarSelections: 4,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 2,
      worldSeriesRings: 0,
    },
  },
];

/** Mocks the GraphQL surface needed to render the premium comparison table. */
async function mockPlayerComparisonGraphQL(
  page: import('@playwright/test').Page,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();

    if (op === 'getplayerswithstats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { players: MOCK_COMPARE_PLAYERS } }),
      });
    } else if (op === 'getmysubscription') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            mySubscription: {
              __typename: 'SubscriptionInfo',
              status: 'active',
              tier: 'premium',
              currentPeriodEnd: '2026-12-31T00:00:00.000Z',
              cancelAtPeriodEnd: false,
              trialEndsAt: null,
              gracePeriodEndsAt: null,
            },
          },
        }),
      });
    } else if (op === 'getcomparisonseasonstats') {
      // Batched season-by-season query (LS-7033) — empty so the comparison
      // table is the only <table> under assertion (season blocks render a
      // no-data message).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            slot0Batting: [],
            slot0Pitching: [],
            slot1Batting: [],
            slot1Pitching: [],
            slot2Batting: [],
            slot2Pitching: [],
            slot3Batting: [],
            slot3Pitching: [],
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    }
  });
  // Pin the current user to premium via the shared entitlement fixture
  // (LS-8058) so the premium comparison table renders. Registered after the
  // route above so its GetUserById handler runs first (Playwright LIFO); this
  // handler's else returns {data:{}} and would otherwise leave the user free.
  await useTier(page, 'premium');
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
    // Native `<table>`/`<thead>`/`<th scope>` semantics are the ≥980px
    // layout. Below that the table is a two-pane ARIA table (pinned Team +
    // horizontally scrolling stats, LS-10717) — covered by the phone-width
    // describe below.
    test.use({ viewport: DESKTOP_VIEWPORT });

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
  // Standings table below 980px — two-pane ARIA table (LS-10717)
  // -------------------------------------------------------------------------

  test.describe('Standings table — phone width', () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test.beforeEach(async ({ page }) => {
      await mockStandingsGraphQL(page);
      await page.goto(`/baseball/league/${LEAGUE_ID}/standings`);
      await page.waitForLoadState('load');
      await page.waitForSelector('[role="table"]', { timeout: 10000 });
    });

    test('standings table has an accessible name and column headers', async ({
      page,
    }) => {
      await expect(
        page.getByRole('table', { name: /League Standings/ }),
      ).toBeVisible();
      // Every column renders below 980px — none are hidden.
      for (const name of [/^W/, /^L/, /^Win%/, /^PF/, /^PA/, /^Diff/]) {
        await expect(
          page.getByRole('columnheader', { name }).first(),
        ).toBeAttached();
      }
    });

    test('every row owns resolvable cells (one logical row per team)', async ({
      page,
    }) => {
      const { rows, unresolved } = await page.evaluate(() => {
        const owners = Array.from(
          document.querySelectorAll('[role="row"][aria-owns]'),
        );
        let missing = 0;
        for (const row of owners) {
          for (const id of (row.getAttribute('aria-owns') ?? '').split(' ')) {
            if (!document.getElementById(id)) missing += 1;
          }
        }
        return { rows: owners.length, unresolved: missing };
      });
      expect(rows).toBeGreaterThan(1);
      expect(unresolved).toBe(0);
    });

    test('scrolling stats pane is a labelled, focusable region', async ({
      page,
    }) => {
      const region = page.getByRole('region', {
        name: 'Standings stats, scrolls horizontally',
      });
      await expect(region).toBeVisible();
      await expect(region).toHaveAttribute('tabindex', '0');
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
  // Player comparison table — real <table> markup (LS-7861)
  //
  // The head-to-head ComparisonTable only renders once 2+ players are selected
  // and the viewer is premium. Selecting two players exercises the shared
  // PlayerComparison component's table semantics in the prod build (the Tamagui
  // optimizer strips `role`; the `tag` prop is what produces a real <table>).
  // -------------------------------------------------------------------------

  adminTest.describe('Player comparison table semantics', () => {
    adminTest.beforeEach(async ({ page }) => {
      await mockPlayerComparisonGraphQL(page);
      await page.goto('/players/compare');
      await page.waitForLoadState('load');
      await expect(page.getByLabel('Search players to compare')).toBeVisible();

      const input = page.getByLabel('Search players to compare');
      await input.fill('Aa');
      await expect(page.getByText('Aaron Judge')).toBeVisible();
      await page.getByText('Aaron Judge').click();

      // Add a second player (retry fill+click — dropdown can close on re-render)
      await expect(async () => {
        await input.fill('Sh');
        await page.getByText('Shohei Ohtani').click({ timeout: 2000 });
      }).toPass({ timeout: 15000 });

      // The comparison table renders a real <table> once 2 players are present.
      await page.waitForSelector('table', { timeout: 10000 });
    });

    adminTest('comparison renders a real <table> element', async ({ page }) => {
      const { tableCount } = await evaluateTableA11y(page);
      expect(tableCount).toBeGreaterThan(0);
    });

    adminTest('comparison table has thead and tbody', async ({ page }) => {
      const { tableDetails } = await evaluateTableA11y(page);
      for (const detail of tableDetails) {
        if (detail.headerCount > 0) {
          expect(detail.hasThead).toBe(true);
        }
        expect(detail.hasTbody).toBe(true);
      }
    });

    adminTest('comparison header cells declare a scope', async ({ page }) => {
      const { tableDetails } = await evaluateTableA11y(page);
      for (const detail of tableDetails) {
        if (detail.headerCount > 0) {
          expect(detail.headersWithScope).toBe(detail.headerCount);
        }
      }
    });

    adminTest('comparison tables have no a11y issues', async ({ page }) => {
      const { issues } = await evaluateTableA11y(page);
      expect(issues).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-page summary: no table should have overall a11y issues
  // -------------------------------------------------------------------------

  test.describe('Cross-page table a11y summary', () => {
    // Native-table audit — the ≥980px layout (see the phone-width describe
    // above for the <980 ARIA table).
    test.use({ viewport: DESKTOP_VIEWPORT });

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
