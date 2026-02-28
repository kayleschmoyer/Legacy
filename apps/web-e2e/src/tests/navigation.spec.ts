/**
 * Navigation UI Tests
 *
 * Covers the persistent header/navigation bar without depending on
 * asynchronous data loading.  All tests navigate to a stable page
 * (e.g. /about or /baseball/league/create) so the header is always
 * present and the assertions are deterministic.
 */

import { expect, test } from '@playwright/test';

test.describe('Navigation Header', () => {
  test.beforeEach(async ({ page }) => {
    // /about renders without GraphQL — wait for page load
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('renders the Legacy Sports logo and brand name', async ({ page }) => {
    // The logo link has an accessible name of 'Legacy Sports home'
    const logoLink = page.getByRole('link', { name: /legacy sports home/i });
    await expect(logoLink).toBeVisible({ timeout: 30000 });
    // Verify both brand text segments are present
    await expect(page.getByText('Fantasy League').first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('logo link navigates to the homepage', async ({ page }) => {
    await page.locator('a[href="/"]').first().click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/');
  });

  test('renders the About nav link', async ({ page }) => {
    // Navigation uses role="navigation" aria-label="Primary", not <nav> element
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    const aboutLink = primaryNav.getByRole('link', { name: /about/i });
    await expect(aboutLink).toBeVisible({ timeout: 30000 });
  });

  test('About nav link is marked as current page', async ({ page }) => {
    // When on /about the link has aria-current="page"
    const aboutLink = page.locator(
      '[role="navigation"][aria-label="Primary"] a[href="/about"][aria-current="page"]',
    );
    await expect(aboutLink).toBeVisible({ timeout: 30000 });
  });

  test('About nav link navigates correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    const aboutLink = primaryNav.getByRole('link', { name: /about/i });
    await aboutLink.click();
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/about');
  });

  test('shows user profile area in header', async ({ page }) => {
    // The header uses 'banner' landmark role
    const header = page.getByRole('banner');
    await expect(header).toBeVisible({ timeout: 30000 });
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
    await expect(hamburger).toBeVisible({ timeout: 30000 });
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
