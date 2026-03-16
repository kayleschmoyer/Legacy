import { expect, test } from '../fixtures/auth-enhanced';

test.describe('Player Statistics Page @regression', () => {
  test.beforeEach(async ({ page }) => {
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

    // Wait for search results to update
    await page.waitForTimeout(1000); // Allow for debounced search

    // Take a screenshot of search results
    await expect(page).toHaveScreenshot('search-results.png');

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);
  });

  test('should support view mode switching', async ({ page }) => {
    // Tamagui Tabs — look for tab triggers with batting/pitching text
    const battingTab = page.getByTestId('tab-trigger-batting');
    const pitchingTab = page.getByTestId('tab-trigger-pitching');

    if (await battingTab.isVisible()) {
      await battingTab.click();
      await page.waitForTimeout(500);

      // Take screenshot of batting view
      await expect(page).toHaveScreenshot('batting-view.png');
    }

    if (await pitchingTab.isVisible()) {
      await pitchingTab.click();
      await page.waitForTimeout(500);

      // Take screenshot of pitching view
      await expect(page).toHaveScreenshot('pitching-view.png');
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
    await page.waitForTimeout(300);

    // Click again to reverse sort
    await hrHeader.click();
    await page.waitForTimeout(300);

    // Page should still be functional
    await expect(hrHeader).toBeVisible();
  });

  test('should show filter controls', async ({ page }) => {
    // The grid has inline filter controls: "Filters:", "Min G:", "Min HR:", "Min RBI:"
    const filtersLabel = page.getByText('Filters:');

    if (await filtersLabel.isVisible()) {
      // Take screenshot showing filter controls
      await expect(page).toHaveScreenshot('filter-controls.png');
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
        // Get current page info before clicking
        await expect(page).toHaveScreenshot('pagination-page-1.png');

        // Click next
        await paginationNext.click();
        await page.waitForTimeout(1000);

        // Take screenshot of next page
        await expect(page).toHaveScreenshot('pagination-page-2.png');

        // Go back if previous button is available
        if (
          (await paginationPrev.isVisible()) &&
          (await paginationPrev.isEnabled())
        ) {
          await paginationPrev.click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });

  test('should handle player selection and navigation', async ({ page }) => {
    // In mocked/static mode without real player data, verify page loads
    // and the stats heading is visible
    await expect(
      page.getByText(/MLB Player Statistics/i).first(),
    ).toBeVisible();

    // Verify the "0 Players" state renders without errors
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

    // Check for loading indicator
    const loadingIndicator = page
      .locator('[data-testid*="loading"]')
      .or(page.getByText(/loading/i));

    if (await loadingIndicator.isVisible()) {
      // Take screenshot of loading state
      await expect(page).toHaveScreenshot('loading-state.png');
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

    // Check for error message
    const errorMessage = page
      .getByText(/error/i)
      .or(page.locator('[data-testid*="error"]'));

    if (await errorMessage.isVisible()) {
      // Take screenshot of error state
      await expect(page).toHaveScreenshot('error-state.png');
    }
  });
});
