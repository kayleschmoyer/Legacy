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
    await expect(page.getByText(/football fantasy/i).first()).toBeVisible();
  });

  test('displays the coming-soon placeholder text', async ({ page }) => {
    await expect(page.getByText(/coming soon/i).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Football Hub — primary nav is present on the football page (desktop)
// ---------------------------------------------------------------------------

test.describe('Football Hub — primary nav @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('primary navigation is visible on the football page', async ({
    page,
  }) => {
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(primaryNav).toBeVisible();
  });

  test('nav pill tabs are visible on the football page', async ({ page }) => {
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(
      primaryNav.getByRole('link', { name: /^players$/i }),
    ).toBeVisible();
    await expect(
      primaryNav.getByRole('link', { name: /^minigames$/i }),
    ).toBeVisible();
  });

  test('clicking Players from the football page navigates to /players', async ({
    page,
  }) => {
    await page.getByRole('link', { name: /^players$/i }).click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/players/);
  });
});

// ---------------------------------------------------------------------------
// Football Hub — mobile nav opens and shows navigation items
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Football routes — smoke coverage for /football/league/create and /football/leagues
// ---------------------------------------------------------------------------

test.describe('Football routes — smoke @critical', () => {
  test('loads /football/league/create without a full-page error', async ({
    page,
  }) => {
    await page.goto('/football/league/create');
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/football/league/create');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('loads /football/leagues without a full-page error', async ({
    page,
  }) => {
    await page.goto('/football/leagues');
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/football/leagues');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Football Hub — mobile nav @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('mobile nav opens and shows navigation links', async ({ page }) => {
    const hamburger = page.getByRole('button', {
      name: /open menu|close menu/i,
    });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const mobileNav = page.getByRole('navigation', {
      name: /mobile navigation/i,
    });
    await expect(mobileNav).toBeVisible({ timeout: 10000 });
    await expect(mobileNav.getByText(/players/i).first()).toBeVisible();
  });
});
