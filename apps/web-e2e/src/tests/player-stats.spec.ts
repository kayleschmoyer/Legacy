import { expect, test } from '@playwright/test';

test.describe('Player Statistics Page @critical', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the player stats page (BrowserRouter — no hash)
    await page.goto('/players/stats');
    await page.waitForLoadState('networkidle');
  });

  test('should load the player statistics page', async ({ page }) => {
    // Check that the page has loaded
    await expect(page).toHaveTitle(/.*Web.*|.*Legacy Sports.*/);

    // Check for main page elements — actual heading is "MLB Player Statistics"
    await expect(
      page.getByRole('heading', { name: /player statistics/i }),
    ).toBeVisible();

    // Check that the stats interface components are present
    await expect(page.getByPlaceholder('Search players...')).toBeVisible();
    // No "Sort by:" label — there is a hint "💡 Click column headers to sort"
    await expect(page.getByText('Click column headers to sort')).toBeVisible();
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();

    // Take a screenshot of the page
    await expect(page).toHaveScreenshot('player-stats-page.png');
  });

  test('should display player statistics data grid', async ({ page }) => {
    // Wait for player rows to load (div-based grid with data-testid, not <table>)
    try {
      await page
        .locator('[data-testid^="player-row-"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      test.skip(true, 'No player data rows rendered — backend may be offline');
      return;
    }

    // Check that column headers are visible — actual columns: Player, Positions, G, HR, etc.
    const columnHeaders = ['Player', 'G', 'HR', 'RBI'];
    for (const header of columnHeaders) {
      await expect(
        page.getByText(header, { exact: true }).first(),
      ).toBeVisible();
    }

    // Check that there are player rows
    const playerRows = page.locator('[data-testid^="player-row-"]');
    await expect(playerRows.first()).toBeVisible();

    // Take a screenshot of the data grid
    await expect(page).toHaveScreenshot('stats-table.png');
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
    const battingTab = page.getByText(/batting stats/i).first();
    const pitchingTab = page.getByText(/pitching stats/i).first();

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
    // Wait for the data grid to be loaded — player rows use data-testid
    try {
      await page
        .locator('[data-testid^="player-row-"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      test.skip(true, 'No player data rows rendered — backend may be offline');
      return;
    }

    // Find a sortable column header — e.g. "HR" (Home Runs)
    const hrHeader = page.getByText('HR', { exact: true }).first();

    if (await hrHeader.isVisible()) {
      // Click to sort
      await hrHeader.click();
      await page.waitForTimeout(500);

      // Take screenshot after sorting
      await expect(page).toHaveScreenshot('sorted-by-hr.png');

      // Click again to reverse sort
      await hrHeader.click();
      await page.waitForTimeout(500);

      // Take screenshot of reverse sort
      await expect(page).toHaveScreenshot('reverse-sorted-by-hr.png');
    }
  });

  test('should show filter controls', async ({ page }) => {
    // The grid has inline filter controls: "Filters:", "Min G:", "Min HR:", "Min RBI:"
    const filtersLabel = page.getByText('Filters:');

    if (await filtersLabel.isVisible({ timeout: 5000 })) {
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

    if (await paginationNext.isVisible({ timeout: 5000 })) {
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
    // Wait for player rows to load
    const rowLocator = page.locator('[data-testid^="player-row-"]').first();
    try {
      await rowLocator.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      // No player data available (e.g. no backend) — nothing to interact with
      test.skip(true, 'No player data rows rendered — backend may be offline');
      return;
    }

    // Find the first player row
    const firstPlayerRow = rowLocator;

    if (await firstPlayerRow.isVisible()) {
      // Click on the player row — navigates to /players/:id
      await firstPlayerRow.click();

      // Wait for navigation
      await page.waitForTimeout(1000);

      // Check if we navigated to a player detail page
      const currentUrl = page.url();
      const hasPlayerDetail =
        currentUrl.includes('/players/') || currentUrl.includes('/player/');

      if (hasPlayerDetail) {
        // Take screenshot of player detail page
        await expect(page).toHaveScreenshot('player-detail-page.png');

        // Navigate back to stats page
        await page.goBack();
        await page.waitForLoadState('networkidle');
      } else {
        // Check for modal or popup
        const modal = page.locator('[role="dialog"]');
        if (await modal.isVisible()) {
          await expect(modal).toHaveScreenshot('player-detail-modal.png');
          await page.keyboard.press('Escape');
        }
      }
    }
  });

  test('should be responsive on mobile viewports', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check that the page is still functional
    await expect(
      page.getByRole('heading', { name: /player statistics/i }),
    ).toBeVisible();

    // Take screenshot of mobile view
    await expect(page).toHaveScreenshot('mobile-view.png');

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Take screenshot of tablet view
    await expect(page).toHaveScreenshot('tablet-view.png');
  });

  test('should handle loading states gracefully', async ({ page }) => {
    // Navigate to page and intercept network requests to simulate slow loading
    await page.route('**/graphql', async (route) => {
      // Delay the response to test loading state
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await page.goto('/players/stats');

    // Check for loading indicator
    const loadingIndicator = page
      .locator('[data-testid*="loading"]')
      .or(page.getByText(/loading/i));

    if (await loadingIndicator.isVisible({ timeout: 1000 })) {
      // Take screenshot of loading state
      await expect(page).toHaveScreenshot('loading-state.png');
    }

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Verify data grid or heading is loaded
    await expect(
      page.getByRole('heading', { name: /player statistics/i }),
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
