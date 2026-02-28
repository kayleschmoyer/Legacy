/**
 * Management Page UI Tests
 *
 * Covers the League Management page (/management).
 * Does not trigger destructive mutations — only validates static UI elements.
 */

import { expect, test } from '@playwright/test';

test.describe('Management Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/management');
    await page.waitForLoadState('load');
  });

  test('loads the management page without errors', async ({ page }) => {
    await expect(page).toHaveURL('/management');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('shows League Management heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /league management/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows Danger Zone section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /danger zone/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows Delete All Leagues button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /delete all leagues/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('clicking Delete All Leagues opens a confirmation dialog', async ({
    page,
  }) => {
    const deleteBtn = page.getByRole('button', {
      name: /delete all leagues/i,
    });
    await deleteBtn.click();

    // A confirmation dialog / alert should appear (either native or custom)
    // The component opens a confirm dialog or shows an inline confirm button
    const confirmText = page
      .getByText(/are you sure|confirm|cannot be undone/i)
      .first();
    await expect(confirmText).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Players Page (/players)
// ---------------------------------------------------------------------------

test.describe('Players Landing Page', () => {
  test('loads the players page', async ({ page }) => {
    await page.goto('/players');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/players');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ---------------------------------------------------------------------------
// Player Stats Page (/players/stats)
// ---------------------------------------------------------------------------

test.describe('Player Stats Page — static elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/players/stats');
    await page.waitForLoadState('load');
  });

  test('shows the MLB Player Statistics heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /player statistics/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('shows the player search input', async ({ page }) => {
    await expect(page.getByPlaceholder('Search players...')).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows a Refresh button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible({
      timeout: 30000,
    });
  });

  test('search input accepts text', async ({ page }) => {
    const input = page.getByPlaceholder('Search players...');
    await expect(input).toBeVisible({ timeout: 30000 });
    await input.fill('Trout');
    await expect(input).toHaveValue('Trout');
  });

  test('search input can be cleared', async ({ page }) => {
    const input = page.getByPlaceholder('Search players...');
    await expect(input).toBeVisible({ timeout: 30000 });
    await input.fill('Aaron');
    await input.clear();
    await expect(input).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// 404 / Not Found — unknown routes
// ---------------------------------------------------------------------------

test.describe('Unknown Routes', () => {
  test('navigating to an unknown route does not crash the app', async ({
    page,
  }) => {
    await page.goto('/this-route-does-not-exist');
    await page.waitForLoadState('load');

    // The app should still render its shell (header etc.) without a JS crash
    await expect(page.getByText('Legacy Sports')).toBeVisible({
      timeout: 30000,
    });
  });
});
