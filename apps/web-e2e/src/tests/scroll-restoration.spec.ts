/**
 * E2E Tests: Router scroll restoration (LS-5816)
 *
 * Covers the two scroll behaviours introduced in apps/web/src/app/app.tsx:
 *
 *  1. PUSH navigation (e.g. sport switch, logo click) → scrolls to top.
 *  2. POP navigation  (browser Back button)          → restores the
 *     previously saved scroll position for that pathname.
 *
 * Uses /about as the long-form page because it renders without any GraphQL
 * queries, keeping the test hermetic and fast.
 */

import { expect, test } from '../fixtures/pages';
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from '../utils/viewport';

test.describe('Router scroll restoration @regression', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('PUSH navigation scrolls to top', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    // Inject a persistent min-height so the page is scrollable. Because this
    // is a SPA, the injected <style> tag survives all client-side navigations
    // within the same page instance — no need to re-inject after route changes.
    await page.addStyleTag({
      content: 'body { min-height: 3000px !important; }',
    });

    // Scroll down to a known position.
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);

    // Click the logo link — a React Router <Link> — triggering a PUSH.
    await page.click('[data-testid="home-link"], a[href="/"]');
    await page.waitForURL('/');

    // PUSH must scroll to top.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
      .toBeLessThan(50);
  });

  test('POP navigation (browser Back) restores scroll position', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    // Make the page scrollable for the full test — the injected <style> persists
    // across SPA navigations so restoring to y=500 after the back navigation
    // will not be clamped by an insufficiently tall page.
    await page.addStyleTag({
      content: 'body { min-height: 3000px !important; }',
    });

    // Scroll down to a known position.
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);

    // Navigate away via a React Router <Link> (PUSH), which also triggers
    // the cleanup effect that saves the /about scroll position to sessionStorage.
    await page.click('[data-testid="home-link"], a[href="/"]');
    await page.waitForURL('/');

    // Go back — triggers a POP navigation.
    await page.goBack();
    await page.waitForURL('/about');

    // POP must restore the saved scroll position (via requestAnimationFrame).
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
      .toBeGreaterThan(100);
  });
});

/**
 * Phone-width equivalent (LS-9732): the header `home-link` the describe
 * above navigates through doesn't exist below `$gtMd` — at that width
 * there's a `MobileBottomBar` instead, linking to /players, /players/stats,
 * /games, /notifications, /profile/settings (never `/`). The restoration
 * mechanism itself (apps/web/src/app/app.tsx) keys purely off pathname +
 * sessionStorage, with no dependency on which UI element triggered the
 * navigation, so a bottom-tab click exercises the identical PUSH/POP code
 * paths — this is a real, independent-of-desktop assertion of the same
 * behaviour via the navigation affordance mobile users actually have.
 */
test.describe('Router scroll restoration (mobile) @regression', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('PUSH navigation via the bottom nav bar scrolls to top', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    await page.addStyleTag({
      content: 'body { min-height: 3000px !important; }',
    });

    await page.evaluate(() => window.scrollTo(0, 500));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);

    // MobileBottomBar renders below `$gtMd`; tabs are plain <Link>s with no
    // testid, matched by their accessible label (MobileBottomBar.tsx).
    await page
      .getByRole('navigation', { name: 'Bottom navigation' })
      .getByRole('link', { name: 'Players', exact: true })
      .click();
    await page.waitForURL('/players');

    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
      .toBeLessThan(50);
  });

  test('POP navigation (browser Back) restores scroll position after bottom-nav navigation', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    await page.addStyleTag({
      content: 'body { min-height: 3000px !important; }',
    });

    await page.evaluate(() => window.scrollTo(0, 500));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);

    await page
      .getByRole('navigation', { name: 'Bottom navigation' })
      .getByRole('link', { name: 'Players', exact: true })
      .click();
    await page.waitForURL('/players');

    await page.goBack();
    await page.waitForURL('/about');

    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
      .toBeGreaterThan(100);
  });
});
