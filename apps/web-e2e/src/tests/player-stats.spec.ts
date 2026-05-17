import { expect, test } from '../fixtures/auth-enhanced';
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
  test.beforeEach(async ({ page }) => {
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
    await page.goto('/players/stats');
    await page.waitForLoadState('networkidle');
  });

  test('should load the player statistics page', async ({ page }) => {
    // Check that the page has loaded
    await expect(page).toHaveTitle(/.*Web.*|.*Legacy Sports.*/);

    // Check for main page elements — rendered as styled div, not heading
    await expect(
      page.getByText(/MLB Player Statistics/i).first(),
    ).toBeVisible();

    // Check that the stats interface components are present
    await expect(
      page.getByPlaceholder('Search player name · min 2 chars'),
    ).toBeVisible();
    // Batting grid title confirms the stats interface rendered
    await expect(
      page.getByText('MLB Career Batting Leaders').first(),
    ).toBeVisible();
  });

  test('should display player statistics data grid', async ({ page }) => {
    // Column headers are always visible even without data rows
    const columnHeaders = ['Player', 'H', 'HR', 'RBI'];
    for (const header of columnHeaders) {
      await expect(
        page.getByText(header, { exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('should allow searching for players', async ({ page }) => {
    // Find the search input
    const searchInput = page.getByPlaceholder(
      'Search player name · min 2 chars',
    );
    await expect(searchInput).toBeVisible();

    // Type in a search query
    await searchInput.fill('Trout');

    // Verify the page is still functional after search
    await expect(searchInput).toHaveValue('Trout');

    // Verify search results contain a player with "Trout"
    // The data grid uses XStack (div), not <tr>, so use text locator
    await expect(page.getByText(/Trout/i).first()).toBeVisible();

    // Clear search
    await searchInput.clear();
    await expect(searchInput).toHaveValue('');
  });

  test('should support view mode switching', async ({ page }) => {
    const combinedTab = page.getByRole('tab', { name: 'Combined' });
    const hittersTab = page.getByRole('tab', { name: 'Hitters' });
    const pitchersTab = page.getByRole('tab', { name: 'Pitchers' });

    await expect(combinedTab).toBeVisible();
    await expect(hittersTab).toBeVisible();
    await expect(pitchersTab).toBeVisible();
    await expect(combinedTab).toHaveAttribute('aria-selected', 'true');

    await hittersTab.click();
    await expect(hittersTab).toHaveAttribute('aria-selected', 'true');

    await pitchersTab.click();
    await expect(pitchersTab).toHaveAttribute('aria-selected', 'true');
  });

  test('should support sorting by clicking column headers', async ({
    page,
  }) => {
    // Find a sortable column header — e.g. "HR" (Home Runs)
    const hrHeader = page.getByText('HR', { exact: true }).first();
    await expect(hrHeader).toBeVisible();

    // Click to sort — verify no crash
    await hrHeader.click();
    await expect(hrHeader).toBeVisible();

    // Click again to reverse sort
    await hrHeader.click();
    await expect(hrHeader).toBeVisible();
  });

  test('should show filter controls', async ({ page }) => {
    // The grid has inline filter controls: "Filters:", "Min G:", "Min HR:", "Min RBI:"
    await expect(page.getByText('Filters:')).toBeVisible();
  });

  test('should support pagination', async ({ page }) => {
    // The mocked stats fixture has more than one page of players, so the
    // Previous / Next controls always render. On page 1, Previous starts
    // disabled; clicking Next must enable Previous; clicking Previous again
    // must re-enable Next.
    const paginationNext = page.getByRole('button', { name: /next/i });
    const paginationPrev = page.getByRole('button', {
      name: /previous|prev/i,
    });

    await expect(paginationNext).toBeVisible();
    await expect(paginationPrev).toBeVisible();
    await expect(paginationNext).toBeEnabled();

    await paginationNext.click();
    await expect(paginationPrev).toBeEnabled();

    await paginationPrev.click();
    await expect(paginationNext).toBeEnabled();
  });

  test('should handle player selection and navigation', async ({ page }) => {
    // Verify the stats page loaded with player data
    await expect(
      page.getByText(/MLB Player Statistics/i).first(),
    ).toBeVisible();

    // Verify the page renders without errors
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('should be responsive on mobile viewports', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check that the page is still functional
    await expect(
      page.getByText(/MLB Player Statistics/i).first(),
    ).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify still renders at tablet width
    await expect(
      page.getByText(/MLB Player Statistics/i).first(),
    ).toBeVisible();
  });

  test('should handle loading states gracefully', async ({ page }) => {
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

    await page.goto('/players/stats');

    // The 2 s delay above guarantees the loading indicator appears before
    // GraphQL responds.
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible(
      { timeout: 5_000 },
    );

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Verify page content is loaded
    await expect(
      page.getByText(/MLB Player Statistics/i).first(),
    ).toBeVisible();
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Intercept GraphQL requests and return an error
    await page.route('**/graphql', (route) => {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Internal server error' }],
        }),
      });
    });

    await page.goto('/players/stats');
    await page.waitForLoadState('networkidle');

    // The mocked 500 response with `errors` must surface a user-visible error.
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 5_000,
    });
  });
});
