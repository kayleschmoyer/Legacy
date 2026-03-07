/**
 * Football Hub Page E2E Tests
 *
 * Covers the Football Hub landing page at /football:
 *   - scaffolding (page loads, no errors)
 *   - placeholder content (title, coming-soon text)
 *   - navigation via the Sports dropdown (desktop) and mobile nav
 *
 * The page is a static placeholder with no GraphQL calls, so no mocking
 * is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Football Hub — scaffolding & placeholder content
// ---------------------------------------------------------------------------

test.describe('Football Hub Page @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('loads without a full-page error', async ({ page }) => {
    await expect(page).toHaveURL('/football');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('displays the Football Fantasy heading', async ({ page }) => {
    await expect(page.getByText(/football fantasy/i).first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('displays the coming-soon placeholder text', async ({ page }) => {
    await expect(page.getByText(/coming soon/i).first()).toBeVisible({
      timeout: 30000,
    });
  });
});

// ---------------------------------------------------------------------------
// Football Hub — navigation (Sports dropdown, desktop)
// ---------------------------------------------------------------------------

test.describe('Football Hub — Sports dropdown navigation @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Start from a neutral page so the Sports dropdown is not already active
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('Sports dropdown button is visible in the primary nav', async ({
    page,
  }) => {
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(
      primaryNav.getByRole('button', { name: /sports/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('Sports dropdown opens and shows Football option', async ({ page }) => {
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await primaryNav.getByRole('button', { name: /sports/i }).click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: 10000 });
    await expect(menu.getByRole('menuitem', { name: /football/i })).toBeVisible(
      { timeout: 10000 },
    );
  });

  test('Football menu item shows NFL fantasy leagues description', async ({
    page,
  }) => {
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await primaryNav.getByRole('button', { name: /sports/i }).click();

    await expect(page.getByText(/nfl fantasy leagues/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('clicking Football in the dropdown navigates to /football', async ({
    page,
  }) => {
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await primaryNav.getByRole('button', { name: /sports/i }).click();

    const menu = page.getByRole('menu');
    await menu.getByRole('menuitem', { name: /football/i }).click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/football');
  });
});

// ---------------------------------------------------------------------------
// Football Hub — navigation (Mobile nav)
// ---------------------------------------------------------------------------

test.describe('Football Hub — mobile nav @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('mobile nav Football link navigates to /football', async ({ page }) => {
    // Open the mobile hamburger menu
    const hamburger = page.getByRole('button', {
      name: /open menu|close menu/i,
    });
    await expect(hamburger).toBeVisible({ timeout: 30000 });
    await hamburger.click();

    // Wait for the mobile nav to open and find the Football link
    const mobileNav = page.getByRole('navigation', { name: 'Mobile' });
    await expect(mobileNav).toBeVisible({ timeout: 10000 });

    await mobileNav.getByRole('link', { name: /football/i }).click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/football');
  });
});
