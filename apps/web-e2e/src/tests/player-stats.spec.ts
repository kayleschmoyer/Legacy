import { expect, test } from '@playwright/test';

test.describe('Player Statistics Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the player stats page
    await page.goto('/players/stats');
    await page.waitForLoadState('networkidle');
  });

  test('should load the player statistics page', async ({ page }) => {
    // Check that the page has loaded with correct title
    await expect(page).toHaveTitle(/.*Player Statistics.*|.*Legacy Sports.*/);

    // Check for main page elements
    await expect(
      page.getByRole('heading', { name: /player statistics/i }),
    ).toBeVisible();

    // Check that the stats table is present
    await expect(
      page.locator(
        '[data-testid="player-stats-table"], .player-stats-table, table',
      ),
    ).toBeVisible();

    // Take a screenshot of the page
    await expect(page).toHaveScreenshot('player-stats-page.png');
  });

  test('should display player statistics table', async ({ page }) => {
    // Wait for the table to load
    await page.waitForSelector('table, [role="table"], .stats-table', {
      timeout: 10000,
    });

    // Check that table headers are present
    const tableHeaders = ['Name', 'Team', 'Position'];
    for (const header of tableHeaders) {
      await expect(
        page.getByRole('columnheader', { name: new RegExp(header, 'i') }),
      ).toBeVisible();
    }

    // Check that there are player rows
    const playerRows = page.locator('tbody tr, [role="row"]:not(:first-child)');
    await expect(playerRows.first()).toBeVisible();

    // Take a screenshot of the table
    await expect(
      page.locator('table, [role="table"]').first(),
    ).toHaveScreenshot('stats-table.png');
  });

  test('should allow searching for players', async ({ page }) => {
    // Find the search input
    const searchInput = page
      .getByPlaceholder(/search.*player/i)
      .or(page.getByRole('textbox', { name: /search/i }))
      .or(page.locator('input[type="text"]').first());

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
    // Look for view mode buttons or selector
    const viewModeSelector = page
      .getByRole('button', { name: /batting/i })
      .or(page.getByRole('button', { name: /pitching/i }))
      .or(page.getByRole('button', { name: /combined/i }))
      .or(page.locator('[data-testid*="view"], select').first());

    if (await viewModeSelector.isVisible()) {
      // Try switching to batting view
      const battingButton = page
        .getByRole('button', { name: /batting/i })
        .or(page.locator('[value="batting"], option[value="batting"]').first());

      if (await battingButton.isVisible()) {
        await battingButton.click();
        await page.waitForTimeout(500);

        // Take screenshot of batting view
        await expect(page).toHaveScreenshot('batting-view.png');
      }

      // Try switching to pitching view
      const pitchingButton = page
        .getByRole('button', { name: /pitching/i })
        .or(
          page.locator('[value="pitching"], option[value="pitching"]').first(),
        );

      if (await pitchingButton.isVisible()) {
        await pitchingButton.click();
        await page.waitForTimeout(500);

        // Take screenshot of pitching view
        await expect(page).toHaveScreenshot('pitching-view.png');
      }
    }
  });

  test('should support sorting by clicking column headers', async ({
    page,
  }) => {
    // Wait for the table to be fully loaded
    await page.waitForSelector('table th, [role="columnheader"]');

    // Find sortable column headers (they should be clickable)
    const nameHeader = page
      .getByRole('columnheader', { name: /name/i })
      .or(
        page
          .locator(
            'th:has-text("Name"), [role="columnheader"]:has-text("Name")',
          )
          .first(),
      );

    if (await nameHeader.isVisible()) {
      // Click to sort by name
      await nameHeader.click();
      await page.waitForTimeout(500);

      // Take screenshot after sorting
      await expect(page).toHaveScreenshot('sorted-by-name.png');

      // Click again to reverse sort
      await nameHeader.click();
      await page.waitForTimeout(500);

      // Take screenshot of reverse sort
      await expect(page).toHaveScreenshot('reverse-sorted-by-name.png');
    }
  });

  test('should open filter dialog when filter button is clicked', async ({
    page,
  }) => {
    // Look for filter button
    const filterButton = page
      .getByRole('button', { name: /filter/i })
      .or(page.getByText('Filters'))
      .or(
        page
          .locator('[data-testid*="filter"], button:has-text("Filter")')
          .first(),
      );

    if (await filterButton.isVisible()) {
      await filterButton.click();

      // Wait for dialog to open
      await page.waitForTimeout(500);

      // Check for filter dialog
      const dialog = page
        .getByRole('dialog')
        .or(page.locator('.dialog, .modal, [data-testid*="dialog"]'));

      if (await dialog.isVisible()) {
        // Take screenshot of filter dialog
        await expect(dialog).toHaveScreenshot('filter-dialog.png');

        // Close the dialog
        const closeButton = dialog.getByRole('button', {
          name: /close|cancel/i,
        });

        if (await closeButton.isVisible()) {
          await closeButton.click();
        } else {
          await page.keyboard.press('Escape');
        }
      }
    }
  });

  test('should support pagination', async ({ page }) => {
    // Look for pagination controls
    const paginationNext = page
      .getByRole('button', { name: /next/i })
      .or(page.locator('button:has-text("Next"), [aria-label*="next"]'));

    const paginationPrev = page
      .getByRole('button', { name: /previous|prev/i })
      .or(
        page.locator(
          'button:has-text("Previous"), button:has-text("Prev"), [aria-label*="previous"]',
        ),
      );

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
    // Wait for player rows to load
    await page.waitForSelector('tbody tr, [role="row"]:not(:first-child)');

    // Find the first player row
    const firstPlayerRow = page
      .locator('tbody tr, [role="row"]:not(:first-child)')
      .first();

    if (await firstPlayerRow.isVisible()) {
      // Get the player name for verification
      const playerNameCell = firstPlayerRow
        .locator('td, [role="cell"]')
        .first();
      const playerName = await playerNameCell.textContent();

      // Click on the player row
      await firstPlayerRow.click();

      // Wait for navigation or action
      await page.waitForTimeout(1000);

      // Check if we navigated to a player detail page or opened a modal
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
        const modal = page.locator('.modal, [role="dialog"], .popup');
        if (await modal.isVisible()) {
          await expect(modal).toHaveScreenshot('player-detail-modal.png');

          // Close modal
          const closeButton = modal.getByRole('button', { name: /close/i });
          if (await closeButton.isVisible()) {
            await closeButton.click();
          } else {
            await page.keyboard.press('Escape');
          }
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
      .locator('.loading, .spinner, [data-testid*="loading"]')
      .or(page.getByText(/loading/i));

    if (await loadingIndicator.isVisible({ timeout: 1000 })) {
      // Take screenshot of loading state
      await expect(page).toHaveScreenshot('loading-state.png');
    }

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Verify the table is loaded
    await expect(page.locator('table, [role="table"]')).toBeVisible();
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
      .or(page.locator('.error, [data-testid*="error"]'));

    if (await errorMessage.isVisible()) {
      // Take screenshot of error state
      await expect(page).toHaveScreenshot('error-state.png');
    }
  });
});
