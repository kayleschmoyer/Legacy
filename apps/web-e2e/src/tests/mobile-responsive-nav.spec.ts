/**
 * E2E Tests: Mobile Responsive Navigation (LS-608, updated LS-3692)
 *
 * Covers:
 *  - Hamburger button visibility: visible on mobile, hidden on desktop
 *  - Mobile panel: opens/closes, shows all expected nav links
 *  - Active-link highlighting in mobile panel
 *  - Panel closes when a nav link is clicked
 *  - aria-expanded attribute updates correctly
 *
 * Tests use viewport resizing to simulate mobile/desktop breakpoints.
 * No GraphQL mocking needed — tests run against /about (no async data).
 */

import { expect, test } from '../fixtures/auth-enhanced';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

// ── Hamburger button visibility ────────────────────────────────────────────

test.describe('Mobile hamburger button @smoke', () => {
  test('is visible on narrow mobile viewport @smoke', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');

    const hamburger = page.getByRole('button', {
      name: /open menu|close menu/i,
    });
    await expect(hamburger).toBeVisible({ timeout: 15000 });
  });

  test('is not visible on wide desktop viewport @smoke', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');

    const hamburger = page.getByRole('button', {
      name: /open menu|close menu/i,
    });
    await expect(hamburger).not.toBeVisible({ timeout: 15000 });
  });
});

// ── Mobile panel open/close ────────────────────────────────────────────────

test.describe('Mobile navigation panel @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('opens when hamburger is clicked @critical', async ({ page }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav).toBeVisible({ timeout: 10000 });
  });

  test('hamburger label changes to "Close menu" when open @critical', async ({
    page,
  }) => {
    const openBtn = page.getByRole('button', { name: /open menu/i });
    await openBtn.click();
    await expect(page.getByRole('button', { name: /close menu/i })).toBeVisible(
      { timeout: 10000 },
    );
  });

  test('closes when hamburger clicked again @critical', async ({ page }) => {
    const openBtn = page.getByRole('button', { name: /open menu/i });
    await openBtn.click();

    const closeBtn = page.getByRole('button', { name: /close menu/i });
    await closeBtn.click();

    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav).not.toBeVisible({ timeout: 10000 });
  });

  test('aria-expanded is false initially @regression', async ({ page }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  test('aria-expanded is true when menu is open @regression', async ({
    page,
  }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    const closeBtn = page.getByRole('button', { name: /close menu/i });
    await expect(closeBtn).toHaveAttribute('aria-expanded', 'true');
  });
});

// ── Mobile panel link content ──────────────────────────────────────────────

test.describe('Mobile panel navigation links @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');

    // Open the menu
    await page.getByRole('button', { name: /open menu/i }).click();
    await expect(page.getByRole('navigation', { name: /mobile/i })).toBeVisible(
      { timeout: 10000 },
    );
  });

  test('shows Leagues section heading @critical', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav.getByText(/^leagues$/i).first()).toBeVisible();
  });

  test('shows Players link @critical', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav.getByText(/^players$/i)).toBeVisible();
  });

  test('shows Minigames link @critical', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav.getByText(/minigames/i)).toBeVisible();
  });

  test('shows Stats link @regression', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav.getByText(/^stats$/i)).toBeVisible();
  });

  test('shows Help & support link in You section @regression', async ({
    page,
  }) => {
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav.getByText(/help.*support/i)).toBeVisible();
  });

  test('shows You section heading @regression', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav.getByText(/^you$/i)).toBeVisible();
  });
});

// ── Panel closes on link click ────────────────────────────────────────────

test.describe('Mobile panel interaction: close on link click @regression', () => {
  test('panel closes when Players link is clicked @regression', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /open menu/i }).click();
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await expect(mobileNav).toBeVisible({ timeout: 10000 });

    await mobileNav.getByText(/^players$/i).click();
    await expect(page).toHaveURL('/players');

    // Menu should close after clicking a link
    await expect(
      page.getByRole('navigation', { name: /mobile/i }),
    ).not.toBeVisible({ timeout: 10000 });
  });
});
