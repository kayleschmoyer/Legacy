/**
 * Navigation Links & Dropdowns E2E Tests
 *
 * Covers the desktop header navigation:
 *   - NavPillTabs (Players, Stats, Minigames links)
 *   - User Profile menu (items: Profile Settings, Subscription, Sign Out)
 *   - Help & support menu (Escape key closes it)
 *
 * All tests use the /about page as the base URL — it renders without GraphQL
 * and the header is always visible.
 */

import { expect, test } from '../fixtures/auth-enhanced';

const BASE = '/about';

// ---------------------------------------------------------------------------
// Nav pill tabs (replaced the old Sports/Players dropdowns)
// ---------------------------------------------------------------------------

test.describe('Navigation – Nav pill tabs @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('load');
  });

  test('renders the Players pill link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /^players$/i })).toBeVisible();
  });

  test('renders the Stats pill link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /^stats$/i })).toBeVisible();
  });

  test('renders the Minigames pill link', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /^minigames$/i }),
    ).toBeVisible();
  });

  test('clicking Players navigates to /players', async ({ page }) => {
    await page.getByRole('link', { name: /^players$/i }).click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/players/);
  });

  test('clicking Stats navigates to /players/stats', async ({ page }) => {
    await page.getByRole('link', { name: /^stats$/i }).click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/players\/stats/);
  });

  test('clicking Minigames navigates to /games', async ({ page }) => {
    await page.getByRole('link', { name: /^minigames$/i }).click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/games/);
  });
});

// ---------------------------------------------------------------------------
// User Profile dropdown
// ---------------------------------------------------------------------------

test.describe('Navigation – User Profile dropdown @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('load');
  });

  test('opens user profile menu on click', async ({ page }) => {
    const profileButton = page.locator('[data-testid="user-profile-trigger"]');
    await profileButton.click();

    const dropdown = page.locator('[data-testid="user-profile-dropdown"]');
    await expect(dropdown).toBeVisible({ timeout: 10000 });
  });

  test('user profile menu shows Profile Settings item', async ({ page }) => {
    await page.locator('[data-testid="user-profile-trigger"]').click();

    const dropdown = page.locator('[data-testid="user-profile-dropdown"]');
    await expect(dropdown.getByText('Profile Settings')).toBeVisible({
      timeout: 10000,
    });
  });

  test('clicking Profile Settings navigates to /profile/settings', async ({
    page,
  }) => {
    await page.locator('[data-testid="user-profile-trigger"]').click();

    const dropdown = page.locator('[data-testid="user-profile-dropdown"]');
    await dropdown.getByText('Profile Settings').click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/profile\/settings/);
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

test.describe('Navigation – keyboard accessibility @regression', () => {
  test('Escape key closes the Help & support dropdown', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /help & support/i }).click();
    const menu = page.getByRole('menu', { name: /help & support/i });
    await expect(menu).toBeVisible({ timeout: 10000 });

    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible({ timeout: 5000 });
  });
});
