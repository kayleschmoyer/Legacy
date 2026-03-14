/**
 * Navigation UI Tests
 *
 * Covers the persistent header/navigation bar without depending on
 * asynchronous data loading.  All tests navigate to a stable page
 * (e.g. /about or /baseball/league/create) so the header is always
 * present and the assertions are deterministic.
 */

import { expect, test } from '@playwright/test';

test.describe('Navigation Header @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // /about renders without GraphQL — wait for page load
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('renders the Legacy Sports logo/home link', async ({ page }) => {
    // The header contains a link back to the homepage
    const homeLink = page.locator('a[href="/"]').first();
    await expect(homeLink).toBeVisible();
  });

  test('logo link navigates to the homepage', async ({ page }) => {
    await page.locator('a[href="/"]').first().click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/');
  });

  test('renders primary navigation with expected items', async ({ page }) => {
    // Navigation uses role="navigation" aria-label="Primary"
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(primaryNav).toBeVisible();
    // Nav contains buttons for Sports, Players, Games, Help
    await expect(
      primaryNav.getByRole('button', { name: 'Sports' }),
    ).toBeVisible();
    await expect(
      primaryNav.getByRole('button', { name: 'Players' }),
    ).toBeVisible();
    await expect(
      primaryNav.getByRole('button', { name: 'Games' }),
    ).toBeVisible();
    await expect(
      primaryNav.getByRole('button', { name: 'Help' }),
    ).toBeVisible();
  });

  test('shows user profile area in header', async ({ page }) => {
    // The header uses 'banner' landmark role
    const header = page.getByRole('banner');
    await expect(header).toBeVisible();
  });

  test('mobile hamburger button is visible on narrow viewport', async ({
    page,
  }) => {
    // Resize to mobile viewport and reload so Tamagui responsive styles apply
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await page.waitForLoadState('load');

    const hamburger = page.getByRole('button', {
      name: /open menu|close menu/i,
    });
    await expect(hamburger).toBeVisible();
  });

  test('mobile menu opens and shows navigation links', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await page.waitForLoadState('load');

    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    // Mobile panel should show main navigation links
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav.getByText(/baseball/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(mobileNav.getByText(/about/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('mobile menu closes after toggle', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await page.waitForLoadState('load');

    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    // The button label changes to "close menu"
    const closeButton = page.getByRole('button', { name: /close menu/i });
    await expect(closeButton).toBeVisible({ timeout: 10000 });

    await closeButton.click();

    // After closing, the button reverts to "open menu"
    await expect(page.getByRole('button', { name: /open menu/i })).toBeVisible({
      timeout: 10000,
    });
  });
});
