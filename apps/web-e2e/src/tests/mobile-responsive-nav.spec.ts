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
 *
 * Header interactions go through the `navHeader` component (ADR-0015) — specs
 * own navigation and viewport, never header selectors.
 */

import { expect, test } from '../fixtures/pages';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

// ── Hamburger button visibility ────────────────────────────────────────────

test.describe('Mobile hamburger button @smoke', () => {
  test('is visible on narrow mobile viewport @smoke', async ({
    page,
    navHeader,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');

    await navHeader.expectHamburgerVisible();
  });

  test('is not visible on wide desktop viewport @smoke', async ({
    page,
    navHeader,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');

    await navHeader.expectHamburgerHidden();
  });
});

// ── Mobile panel open/close ────────────────────────────────────────────────

test.describe('Mobile navigation panel @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('opens when hamburger is clicked @critical', async ({ navHeader }) => {
    await navHeader.openMobileMenu();
    await navHeader.expectMobileMenuVisible();
  });

  test('hamburger label changes to "Close menu" when open @critical', async ({
    navHeader,
  }) => {
    await navHeader.openMobileMenu();
    await navHeader.expectCloseButtonVisible();
  });

  test('closes when hamburger clicked again @critical', async ({
    navHeader,
  }) => {
    await navHeader.openMobileMenu();
    await navHeader.closeMobileMenu();
    await navHeader.expectMobileMenuHidden();
  });

  test('aria-expanded is false initially @regression', async ({
    navHeader,
  }) => {
    await navHeader.expectCollapsed();
  });

  test('aria-expanded is true when menu is open @regression', async ({
    navHeader,
  }) => {
    await navHeader.openMobileMenu();
    await navHeader.expectExpanded();
  });
});

// ── Mobile panel link content ──────────────────────────────────────────────

test.describe('Mobile panel navigation links @critical', () => {
  test.beforeEach(async ({ page, navHeader }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');

    // Open the menu
    await navHeader.openMobileMenu();
    await navHeader.expectMobileMenuVisible();
  });

  test('shows Leagues section heading @critical', async ({ navHeader }) => {
    await navHeader.expectMobileMenuItem(/^leagues$/i);
  });

  test('shows Players link @critical', async ({ navHeader }) => {
    await navHeader.expectMobileMenuItem(/^players$/i);
  });

  test('shows Minigames link @critical', async ({ navHeader }) => {
    await navHeader.expectMobileMenuItem(/minigames/i);
  });

  test('shows Stats link @regression', async ({ navHeader }) => {
    await navHeader.expectMobileMenuItem(/^stats$/i);
  });

  test('shows Help & support link in You section @regression', async ({
    navHeader,
  }) => {
    await navHeader.expectMobileMenuItem(/help.*support/i);
  });

  test('shows You section heading @regression', async ({ navHeader }) => {
    await navHeader.expectMobileMenuItem(/^you$/i);
  });
});

// ── Panel closes on link click ────────────────────────────────────────────

test.describe('Mobile panel interaction: close on link click @regression', () => {
  test('panel closes when Players link is clicked @regression', async ({
    page,
    navHeader,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/about');
    await page.waitForLoadState('load');

    await navHeader.openMobileMenu();
    await navHeader.expectMobileMenuVisible();

    await navHeader.clickMobileMenuItem(/^players$/i);
    await expect(page).toHaveURL('/players');

    // Menu should close after clicking a link
    await navHeader.expectMobileMenuHidden();
  });
});
