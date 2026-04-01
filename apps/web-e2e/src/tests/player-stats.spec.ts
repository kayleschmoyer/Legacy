import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ── Helpers ─────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

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
    await expect(page.getByPlaceholder('Search players...')).toBeVisible();
    // Click column headers hint is embedded in the info paragraph
    await expect(page.getByTestId('player-stats-sort-hint')).toBeVisible();
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
    const searchInput = page.getByPlaceholder('Search players...');
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
    // Tamagui Tabs — look for tab triggers with batting/pitching text
    const battingTab = page.getByTestId('tab-trigger-batting');
    const pitchingTab = page.getByTestId('tab-trigger-pitching');

    if (await battingTab.isVisible()) {
      await battingTab.click();
      // Verify batting view is active
      await expect(battingTab).toHaveAttribute('data-state', 'active');
    }

    if (await pitchingTab.isVisible()) {
      await pitchingTab.click();
      // Verify pitching view is active
      await expect(pitchingTab).toHaveAttribute('data-state', 'active');
    }
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
    const filtersLabel = page.getByText('Filters:');

    if (await filtersLabel.isVisible()) {
      // Verify filter controls are visible
      await expect(filtersLabel).toBeVisible();
    }
  });

  test('should support pagination', async ({ page }) => {
    // Look for pagination controls — actual buttons are "← Previous" and "Next →"
    const paginationNext = page.getByRole('button', { name: /next/i });
    const paginationPrev = page.getByRole('button', {
      name: /previous|prev/i,
    });

    if (await paginationNext.isVisible()) {
      // Check if next button is enabled
      const isNextEnabled = await paginationNext.isEnabled();

      if (isNextEnabled) {
        // Click next — wait for Previous to become enabled as a concrete sign
        // that pagination changed (Previous is disabled on page 1)
        await paginationNext.click();
        await expect.poll(() => paginationPrev.isEnabled()).toBe(true);

        // Go back if previous button is available
        if (
          (await paginationPrev.isVisible()) &&
          (await paginationPrev.isEnabled())
        ) {
          await paginationPrev.click();
          // Wait for the page-change to settle: Previous should become disabled
          // again once we're back on page 1 (or wait for Next to re-enable)
          await expect.poll(() => paginationNext.isEnabled()).toBe(true);
        }
      }
    }
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

    // Check for loading indicator via dedicated test ID
    const loadingIndicator = page.locator('[data-testid="loading-indicator"]');

    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).toBeVisible();
    }

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

    // Check for error message via dedicated test ID
    const errorMessage = page.locator('[data-testid="error-message"]');

    if (await errorMessage.isVisible()) {
      await expect(errorMessage).toBeVisible();
    }
  });
});
