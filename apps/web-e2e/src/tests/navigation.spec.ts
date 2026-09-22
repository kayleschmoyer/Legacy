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

import { adminTest, expect, test, unauthTest } from '../fixtures/pages';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

test.describe('Navigation Header @smoke', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

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
    // Nav contains pill-tab links for Players and Minigames
    await navHeader.expectNavItem(/^players$/i);
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

// ---------------------------------------------------------------------------
// LS-2102: nav items visibility/state changes on logout, and the
// unauthenticated landing page renders no internal (app) nav links.
// auth-flows.spec.ts covers the login-gate side effect of logout (the
// "Continue with Google" CTA reappearing); these tests cover the
// navHeader's own primary-nav state directly.
// ---------------------------------------------------------------------------

adminTest.describe('Navigation Header — Logout State @regression', () => {
  adminTest.use({ viewport: DESKTOP_VIEWPORT });

  adminTest(
    'primary navigation and its nav items disappear after signing out',
    async ({ page, navHeader }) => {
      await page.goto('/about');
      await page.waitForLoadState('load');

      // Confirm the authenticated nav is present before logging out.
      await navHeader.expectPrimaryNavVisible();
      await navHeader.expectNavItem(/^players$/i);
      await navHeader.expectNavItem(/^minigames$/i);

      await navHeader.openUserProfileMenu();
      await navHeader.expectUserProfileMenuItem(/sign out/i);
      await navHeader.clickUserProfileMenuItem(/sign out/i);

      // The auth guard swaps to the landing page — the app's primary nav and
      // its items must no longer be present.
      await navHeader.expectPrimaryNavHidden();
      await navHeader.expectNavItemHidden(/^players$/i);
      await navHeader.expectNavItemHidden(/^minigames$/i);
    },
  );
});

unauthTest.describe(
  'Navigation Header — Unauthenticated Landing @regression',
  () => {
    unauthTest.use({ viewport: DESKTOP_VIEWPORT });

    unauthTest(
      'unauthenticated landing page renders no internal app nav links',
      async ({ page, navHeader }) => {
        await page.goto('/');
        await page.waitForLoadState('load');

        // The authenticated app's primary nav (and its Players/Minigames
        // links) must never render for an unauthenticated visitor.
        await navHeader.expectPrimaryNavHidden();
        await navHeader.expectNavItemHidden(/^players$/i);
        await navHeader.expectNavItemHidden(/^minigames$/i);
      },
    );
  },
);
