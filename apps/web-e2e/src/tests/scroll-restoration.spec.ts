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

test.describe('Router scroll restoration @regression', () => {
  test('PUSH navigation scrolls to top', async ({ page, isMobile }) => {
    // Both tests navigate via the desktop header's home link, which is
    // $gtMd-gated and never visible at the mobile viewport — exposed by the
    // LS-9658 full mobile sweep (LS-9660). A mobile-navigation variant of
    // this coverage is tracked with the LS-9693 mobile-nav spec triage.
    test.skip(
      isMobile,
      'navigates via the desktop header home link, hidden at the mobile viewport',
    );
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
    isMobile,
  }) => {
    // See the PUSH test above — same desktop-only home-link navigation.
    test.skip(
      isMobile,
      'navigates via the desktop header home link, hidden at the mobile viewport',
    );
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
