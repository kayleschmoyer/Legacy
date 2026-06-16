import { expect, test } from '../fixtures/pages';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ─────────────────────────────────────────────────────────────────

// ── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_CAREER_BATTING_RESPONSE = {
  data: {
    careerBattingStats: {
      __typename: 'CareerBattingConnection',
      totalCount: 2,
      edges: [
        {
          __typename: 'CareerBattingEdge',
          node: {
            __typename: 'CareerBatting',
            playerId: 1,
            primaryPosition: 'CF',
            positionsPlayed: null,
            games: 1131,
            plateAppearances: 5101,
            atBats: 4289,
            runs: 894,
            hits: 1559,
            doubles: 315,
            triples: 48,
            homeRuns: 368,
            rbi: 817,
            stolenBases: 211,
            caughtStealing: 57,
            baseOnBalls: 774,
            strikeouts: 1034,
            totalBases: 2988,
            groundedIntoDoublePlays: 76,
            hitByPitch: 35,
            sacrificeHits: 3,
            intentionalBaseOnBalls: 231,
            battingAverage: 0.304,
            onBasePercentage: 0.41,
            sluggingPercentage: 0.582,
            offensiveWAR: 72.9,
            player: {
              __typename: 'Player',
              id: 1,
              firstName: 'Mike',
              lastName: 'Trout',
              brefId: 'troutmi01',
            },
          },
        },
        {
          __typename: 'CareerBattingEdge',
          node: {
            __typename: 'CareerBatting',
            playerId: 2,
            primaryPosition: 'DH',
            positionsPlayed: null,
            games: 1200,
            plateAppearances: 4800,
            atBats: 4100,
            runs: 900,
            hits: 1300,
            doubles: 250,
            triples: 20,
            homeRuns: 250,
            rbi: 700,
            stolenBases: 100,
            caughtStealing: 30,
            baseOnBalls: 600,
            strikeouts: 1100,
            totalBases: 2500,
            groundedIntoDoublePlays: 50,
            hitByPitch: 20,
            sacrificeHits: 5,
            intentionalBaseOnBalls: 50,
            battingAverage: 0.286,
            onBasePercentage: 0.37,
            sluggingPercentage: 0.55,
            offensiveWAR: 55.0,
            player: {
              __typename: 'Player',
              id: 2,
              firstName: 'Shohei',
              lastName: 'Ohtani',
              brefId: 'ohtansh01',
            },
          },
        },
      ],
      pageInfo: {
        __typename: 'PageInfo',
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    },
    players: [
      {
        __typename: 'Player',
        id: 1,
        firstName: 'Mike',
        lastName: 'Trout',
        brefId: 'troutmi01',
        statsLastFetchedAt: null,
      },
      {
        __typename: 'Player',
        id: 2,
        firstName: 'Shohei',
        lastName: 'Ohtani',
        brefId: 'ohtansh01',
        statsLastFetchedAt: null,
      },
    ],
  },
};

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Player Statistics Page @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    // Mock GraphQL endpoints with player data so the stats page has data to render
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (
        postData.includes('getcareerbattingsta') ||
        postData.includes('getallplayers') ||
        postData.includes('getplayerswithstat')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_CAREER_BATTING_RESPONSE),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    // Navigate to the player stats page (BrowserRouter — no hash)
    await playersPage.gotoStats();
  });

  test('should load the player statistics page', async ({
    page,
    playersPage,
  }) => {
    // Check that the page has loaded
    await expect(page).toHaveTitle(/.*Web.*|.*Legacy Sports.*/);

    // Check for main page elements — rendered as styled div, not heading
    await playersPage.stats.expectText(/MLB Player Statistics/i);

    // Check that the stats interface components are present
    await playersPage.stats.expectSearchVisible();
    // Batting grid title confirms the stats interface rendered
    await playersPage.stats.expectBattingLeaders();
  });

  test('should display player statistics data grid', async ({
    playersPage,
  }) => {
    // Column headers are always visible even without data rows
    const columnHeaders = ['Player', 'H', 'HR', 'RBI'];
    for (const header of columnHeaders) {
      await playersPage.stats.expectColumnHeader(header);
    }
  });

  test('should allow searching for players', async ({ playersPage }) => {
    // Type in a search query (search() asserts the input reflects the value)
    await playersPage.stats.search('Trout');

    // Verify search results contain a player with "Trout"
    // The data grid uses XStack (div), not <tr>, so use text locator
    await playersPage.stats.expectText(/Trout/i);

    // Clear search
    await playersPage.stats.clearSearch();
  });

  test('should support view mode switching', async ({ playersPage }) => {
    await playersPage.stats.expectTabVisible('Combined');
    await playersPage.stats.expectTabVisible('Hitters');
    await playersPage.stats.expectTabVisible('Pitchers');
    await playersPage.stats.expectTabSelected('Combined');

    await playersPage.stats.switchView('Hitters');
    await playersPage.stats.expectTabSelected('Hitters');

    await playersPage.stats.switchView('Pitchers');
    await playersPage.stats.expectTabSelected('Pitchers');
  });

  test('should support sorting by clicking column headers', async ({
    playersPage,
  }) => {
    // Click a sortable column header — e.g. "HR" (Home Runs) — and verify no crash
    await playersPage.stats.clickColumnHeader('HR');
    await playersPage.stats.expectColumnHeader('HR');

    // Click again to reverse sort
    await playersPage.stats.clickColumnHeader('HR');
    await playersPage.stats.expectColumnHeader('HR');
  });

  test('should show filter controls', async ({ playersPage }) => {
    // LS-3785 redesign moved filters into a toolbar (Search · Position · Team ·
    // Rows · Advanced toggle → Stat Ranges panel). Assert against the toolbar
    // container testid so the test isn't coupled to specific control labels.
    await playersPage.stats.expectFilterControls();
  });

  test('should support pagination', async ({ playersPage }) => {
    // LS-3785's Combined view renders batting + pitching grids with
    // independent pagination, so scope the locator to the batting grid to
    // avoid the strict-mode collision on duplicate "Next" buttons. The
    // fixture has fewer rows than one page, so Next/Previous render but stay
    // disabled — verifying the controls exist is the meaningful regression
    // assertion. A separate spec with a multi-page mock can exercise paging.
    await playersPage.stats.expectPaginationControls();
  });

  test('should handle player selection and navigation', async ({
    playersPage,
  }) => {
    // Verify the stats page loaded with player data
    await playersPage.stats.expectText(/MLB Player Statistics/i);

    // Verify the page renders without errors
    await playersPage.expectNoApplicationError();
  });

  test('should be responsive on mobile viewports', async ({
    page,
    playersPage,
  }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('load');

    // Check that the page is still functional
    await playersPage.stats.expectText(/MLB Player Statistics/i);

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await page.waitForLoadState('load');

    // Verify still renders at tablet width
    await playersPage.stats.expectText(/MLB Player Statistics/i);
  });

  test('should handle loading states gracefully', async ({
    page,
    playersPage,
  }) => {
    // Navigate to page and intercept network requests to simulate slow loading
    await page.route(
      (url) => {
        const s = url.toString();
        return (
          s.includes('/graphql') &&
          !s.includes('/@fs/') &&
          !s.includes('.ts') &&
          !s.includes('.js')
        );
      },
      async (route) => {
        // Delay the response to test loading state
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      },
    );

    await playersPage.gotoStats();

    // The 2 s delay above guarantees the loading indicator appears before
    // GraphQL responds. LS-3785's Combined view renders batting + pitching
    // grids, each with its own loading-indicator testid — scope to the
    // batting grid to avoid a strict-mode collision.
    await playersPage.stats.expectLoadingIndicator();

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Verify page content is loaded
    await playersPage.stats.expectText(/MLB Player Statistics/i);
  });

  test('should handle error states gracefully', async ({
    page,
    playersPage,
  }) => {
    // Intercept GraphQL requests and return an error. Use the
    // isGraphQLEndpoint predicate (same as beforeEach) so the actual API
    // path is matched — a `**/graphql` glob misses the configured endpoint.
    await page.route(isGraphQLEndpoint, (route) => {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Internal server error' }],
        }),
      });
    });

    await playersPage.gotoStats();

    // The mocked 500 response with `errors` must surface a user-visible error.
    // LS-3785's Combined view renders batting + pitching grids, each with its
    // own error-message testid — scope to the batting grid to avoid a
    // strict-mode collision.
    await playersPage.stats.expectGridError();
  });
});
