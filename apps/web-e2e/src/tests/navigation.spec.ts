/**
 * Navigation UI Tests
 *
 * Covers the persistent header/navigation bar without depending on
 * asynchronous data loading.  All tests navigate to a stable page
 * (e.g. /about or /baseball/league/create) so the header is always
 * present and the assertions are deterministic.
 *
 * Header interactions go through the `navHeader` component (ADR-0015) — specs
 * own navigation and viewport, never header selectors.
 */

import { expect, test } from '../fixtures/pages';

test.describe('Navigation Header @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // /about renders without GraphQL — wait for page load
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('renders the Legacy Sports logo/home link', async ({ navHeader }) => {
    // Home link + logo image visible, pointing at the branded asset.
    await navHeader.expectLogo();
  });

  test('logo link navigates to the homepage', async ({ page, navHeader }) => {
    await navHeader.clickLogo();
    await expect(page).toHaveURL('/');
  });

  test('renders primary navigation with expected items', async ({
    navHeader,
  }) => {
    // Navigation uses role="navigation" aria-label="Primary"
    await navHeader.expectPrimaryNavVisible();
    // Nav contains pill-tab links for Players, Stats, and Minigames
    await navHeader.expectNavItem(/^players$/i);
    await navHeader.expectNavItem(/^stats$/i);
    await navHeader.expectNavItem(/^minigames$/i);
  });

  test('shows user profile area in header', async ({ navHeader }) => {
    // The header uses the 'banner' landmark role
    await navHeader.expectVisible();
  });

  test('mobile hamburger button is visible on narrow viewport', async ({
    navHeader,
  }) => {
    // Resize to mobile viewport and reload so Tamagui responsive styles apply
    await navHeader.goMobile();
    await navHeader.expectHamburgerVisible();
  });

  test('mobile menu opens and shows navigation links', async ({
    navHeader,
  }) => {
    await navHeader.goMobile();
    await navHeader.openMobileMenu();

    // Mobile panel should show main navigation links
    await navHeader.expectMobileMenuItem(/players/i);
    await navHeader.expectMobileMenuItem(/minigames/i);
  });

  test('mobile menu closes after toggle', async ({ navHeader }) => {
    await navHeader.goMobile();
    await navHeader.openMobileMenu();

    // The drawer exposes a "Close menu" button while open
    await navHeader.expectCloseButtonVisible();

    await navHeader.closeMobileMenu();

    // After closing, the hamburger (open-menu) button is visible again
    await navHeader.expectHamburgerVisible();
  });
});
