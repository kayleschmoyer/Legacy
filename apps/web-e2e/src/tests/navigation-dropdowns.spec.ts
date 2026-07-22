/**
 * Navigation Links & Dropdowns E2E Tests
 *
 * Covers the desktop header navigation:
 *   - NavPillTabs (Players, Stats, Minigames links)
 *   - User Profile menu (items: Profile Settings, Subscription, Sign Out)
 *   - Help & support menu (Escape key closes it)
 *
 * All tests use the /about page as the base URL — it renders without GraphQL
 * and the header is always visible. Header interactions go through the
 * `navHeader` component (ADR-0015) — specs own navigation and viewport, never
 * header selectors.
 */

import { expect, test } from '../fixtures/pages';

const BASE = '/about';

/**
 * These specs exercise the **desktop** header — the primary nav pill tabs, the
 * user-profile dropdown, and the Help & support menu. That whole cluster lives
 * in `NavContent`, which is `display: none` below the `$gtMd` breakpoint
 * (980px, see lib/design-tokens breakpoints): at a mobile viewport the desktop
 * trigger is present in the DOM but never visible, so clicks time out.
 *
 * The mobile counterpart (hamburger → drawer) is a distinct component with its
 * own @critical coverage in `mobile-responsive-nav.spec.ts`, so these tests
 * must not be re-pointed at the drawer. Instead we pin a desktop viewport —
 * mirroring how `mobile-responsive-nav.spec.ts` pins `MOBILE_VIEWPORT` — so the
 * desktop-header assertions stay meaningful under any project, including the
 * Mobile Chrome (Pixel 5) device project wired by LS-8457 (LS-8501).
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

// ---------------------------------------------------------------------------
// Nav pill tabs (replaced the old Sports/Players dropdowns)
// ---------------------------------------------------------------------------

test.describe('Navigation – Nav pill tabs @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE);
    await page.waitForLoadState('load');
  });

  test('renders the Players pill link', async ({ navHeader }) => {
    await navHeader.expectNavItem(/^players$/i);
  });

  test('renders the Stats pill link', async ({ navHeader }) => {
    await navHeader.expectNavItem(/^stats$/i);
  });

  test('renders the Minigames pill link', async ({ navHeader }) => {
    await navHeader.expectNavItem(/^minigames$/i);
  });

  test('clicking Players navigates to /players', async ({
    page,
    navHeader,
  }) => {
    await navHeader.clickNavItem(/^players$/i);
    await expect(page).toHaveURL(/\/players/);
  });

  test('clicking Stats navigates to /players/stats', async ({
    page,
    navHeader,
  }) => {
    await navHeader.clickNavItem(/^stats$/i);
    await expect(page).toHaveURL(/\/players\/stats/);
  });

  test('clicking Minigames navigates to /games', async ({
    page,
    navHeader,
  }) => {
    await navHeader.clickNavItem(/^minigames$/i);
    await expect(page).toHaveURL(/\/games/);
  });
});

// ---------------------------------------------------------------------------
// User Profile dropdown
// ---------------------------------------------------------------------------

test.describe('Navigation – User Profile dropdown @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE);
    await page.waitForLoadState('load');
  });

  test('opens user profile menu on click', async ({ navHeader }) => {
    await navHeader.openUserProfileMenu();
    await navHeader.expectUserProfileMenuVisible();
  });

  test('user profile menu shows Profile Settings item', async ({
    navHeader,
  }) => {
    await navHeader.openUserProfileMenu();
    await navHeader.expectUserProfileMenuItem('Profile Settings');
  });

  test('clicking Profile Settings navigates to /profile/settings', async ({
    page,
    navHeader,
  }) => {
    await navHeader.openUserProfileMenu();
    await navHeader.clickUserProfileMenuItem('Profile Settings');
    await expect(page).toHaveURL(/\/profile\/settings/);
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

test.describe('Navigation – keyboard accessibility @regression', () => {
  test('Escape key closes the Help & support dropdown', async ({
    page,
    navHeader,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE);
    await page.waitForLoadState('load');

    await navHeader.openHelpMenu();
    await navHeader.expectHelpMenuVisible();

    await navHeader.closeHelpMenuWithEscape();
    await navHeader.expectHelpMenuHidden();
  });
});
