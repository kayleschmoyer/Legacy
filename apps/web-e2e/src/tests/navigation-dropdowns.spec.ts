/**
 * Navigation Dropdowns E2E Tests (LS-607)
 *
 * Covers the three header dropdowns:
 *   - Sports menu (button labelled "Sports", items: Baseball, Football)
 *   - Players menu (button labelled "Players", items: All Players, Stats, Compare)
 *   - User Profile menu (items: Profile Settings, Subscription, Sign Out)
 *
 * All tests use the /about page as the base URL — it renders without GraphQL
 * and the header is always visible.
 */

import { expect, test } from '../fixtures/auth-enhanced';

const BASE = '/about';

// ---------------------------------------------------------------------------
// Sports dropdown
// ---------------------------------------------------------------------------

test.describe('Navigation – Sports dropdown @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('load');
  });

  test('renders the Sports trigger button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /sports/i })).toBeVisible();
  });

  test('opens sports menu on click', async ({ page }) => {
    const sportsButton = page.getByRole('button', { name: /sports/i });
    await sportsButton.click();

    const menu = page.locator('#sports-menu');
    await expect(menu).toBeVisible({ timeout: 10000 });
  });

  test('sports menu contains Baseball link', async ({ page }) => {
    await page.getByRole('button', { name: /sports/i }).click();

    await expect(
      page.locator('#sports-menu').getByText('Baseball'),
    ).toBeVisible({ timeout: 10000 });
  });

  test('sports menu contains Football link', async ({ page }) => {
    await page.getByRole('button', { name: /sports/i }).click();

    await expect(
      page.locator('#sports-menu').getByText('Football'),
    ).toBeVisible({ timeout: 10000 });
  });

  test('clicking Baseball navigates to /baseball', async ({ page }) => {
    await page.getByRole('button', { name: /sports/i }).click();
    await page.locator('#sports-menu').getByText('Baseball').click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/baseball/);
  });
});

// ---------------------------------------------------------------------------
// Players dropdown
// ---------------------------------------------------------------------------

test.describe('Navigation – Players dropdown @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('load');
  });

  test('renders the Players trigger button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /players/i })).toBeVisible();
  });

  test('opens players menu on click', async ({ page }) => {
    await page.getByRole('button', { name: /players/i }).click();

    const menu = page.locator('#players-menu');
    await expect(menu).toBeVisible({ timeout: 10000 });
  });

  test('players menu shows All Players option', async ({ page }) => {
    await page.getByRole('button', { name: /players/i }).click();

    await expect(
      page.locator('#players-menu').getByText('All Players'),
    ).toBeVisible({ timeout: 10000 });
  });

  test('players menu shows Compare Players option', async ({ page }) => {
    await page.getByRole('button', { name: /players/i }).click();

    await expect(
      page.locator('#players-menu').getByText('Compare Players'),
    ).toBeVisible({ timeout: 10000 });
  });

  test('clicking All Players navigates to /players', async ({ page }) => {
    await page.getByRole('button', { name: /players/i }).click();
    await page.locator('#players-menu').getByText('All Players').click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/players/);
  });

  test('clicking Compare Players navigates to /players/compare', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /players/i }).click();
    await page.locator('#players-menu').getByText('Compare Players').click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/players\/compare/);
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
  test('Escape key closes the Sports dropdown', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /sports/i }).click();
    const menu = page.locator('#sports-menu');
    await expect(menu).toBeVisible({ timeout: 10000 });

    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible({ timeout: 5000 });
  });
});
