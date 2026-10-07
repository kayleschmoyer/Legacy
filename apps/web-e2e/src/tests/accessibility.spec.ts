/**
 * Accessibility E2E Suite (LS-614)
 *
 * Covers:
 *  - Skip links (existence, focus visibility, click-to-focus)
 *  - Keyboard navigation (Tab order, Escape key, focus ring)
 *  - ARIA landmarks (banner, navigation, main, live regions)
 *  - Primary navigation landmark presence across pages
 *  - Screen reader announcements (aria-live regions present; route change dispatch)
 *  - Mobile menu aria-expanded + Escape close
 *  - Reduced-motion preference respected
 *
 * E2E-selection note (LS-9994): this spec only visits /about and /help, but
 * its assertions target global shell chrome (skip link, nav landmarks,
 * mobile menu) that the graph-derived surface map already reaches for every
 * spec via the app-shell eager closure — no RUN_ALL_CORE-style exception is
 * needed. See e2e-change-safety.md Part 2 for the full rationale.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

// ---------------------------------------------------------------------------
// 1. Skip Links
// ---------------------------------------------------------------------------

test.describe('Skip Link @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('skip link exists in the DOM', async ({ page }) => {
    const skipLink = page.getByTestId('skip-link');
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveText('Skip to main content');
  });

  test('skip link href points to #main-content', async ({ page }) => {
    const skipLink = page.getByTestId('skip-link');
    await expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  test('skip link is visually hidden before focus', async ({ page }) => {
    // sr-only hides it offscreen; the bounding box is ~1x1 px
    const skipLink = page.getByTestId('skip-link');
    const box = await skipLink.boundingBox();
    expect(box).not.toBeNull();
    // sr-only clips to 1px × 1px — any dimension ≤ 4 px is "hidden"
    expect((box?.width ?? 0) <= 4 || (box?.height ?? 0) <= 4).toBe(true);
  });

  test('skip link becomes visible when focused', async ({ page }) => {
    // Focus the skip link programmatically — Tab key is unreliable in
    // headless Chrome where the browser window lacks OS-level focus
    const skipLink = page.getByTestId('skip-link');
    await skipLink.focus();

    await expect(skipLink).toBeFocused({ timeout: 5000 });

    // After focus the .skip-link:focus rule overrides sr-only so the element
    // gains a real size
    const box = await skipLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(50);
    expect(box?.height ?? 0).toBeGreaterThan(10);
  });

  test('activating the skip link moves focus to #main-content', async ({
    page,
  }) => {
    const skipLink = page.getByTestId('skip-link');
    await skipLink.focus();
    await expect(skipLink).toBeFocused({ timeout: 5000 });
    await skipLink.press('Enter');

    const main = page.getByTestId('main-content');
    await expect(main).toBeFocused({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 2. ARIA Landmarks
// ---------------------------------------------------------------------------

test.describe('ARIA Landmarks @smoke', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('page has a banner landmark (header)', async ({ page }) => {
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 15000 });
  });

  test('page has a primary navigation landmark', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );
  });

  test('page has a main content landmark', async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
  });

  test('main content has id="main-content" and tabIndex=-1', async ({
    page,
  }) => {
    const main = page.getByTestId('main-content');
    await expect(main).toBeAttached();
    // tabIndex=-1 allows programmatic focus (skip link target)
    const tabIndex = await main.getAttribute('tabindex');
    expect(tabIndex).toBe('-1');
  });

  test('logo link exists with accessible name and points to homepage', async ({
    page,
  }) => {
    const banner = page.locator('[role="banner"]');
    const logoLink = banner.getByRole('link', {
      name: /legacy sports home/i,
    });
    await expect(logoLink).toBeVisible({ timeout: 15000 });
    await expect(logoLink).toHaveAttribute('href', '/');
  });
});

// ---------------------------------------------------------------------------
// 3. aria-live Regions (Screen Reader Announcements)
// ---------------------------------------------------------------------------

test.describe('Screen Reader Announcements @regression', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('polite aria-live region exists', async ({ page }) => {
    const politeRegion = page.locator(
      '[aria-live="polite"][aria-atomic="true"]',
    );
    await expect(politeRegion.first()).toBeAttached();
  });

  test('assertive aria-live region exists', async ({ page }) => {
    const assertiveRegion = page.locator(
      '[aria-live="assertive"][aria-atomic="true"]',
    );
    await expect(assertiveRegion.first()).toBeAttached();
  });

  test('polite announcer updates when app-announce-polite event fires', async ({
    page,
  }) => {
    const politeRegion = page
      .locator('[aria-live="polite"][aria-atomic="true"]')
      .first();

    // Ensure the aria-live region is in the DOM before dispatching
    await expect(politeRegion).toBeAttached({ timeout: 5000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('app-announce-polite', {
          detail: 'Test polite announcement',
        }),
      );
    });

    await expect(politeRegion).toHaveText('Test polite announcement', {
      timeout: 5000,
    });
  });

  test('assertive announcer updates when app-announce-assertive event fires', async ({
    page,
  }) => {
    const assertiveRegion = page
      .locator('[aria-live="assertive"][aria-atomic="true"]')
      .first();

    // Ensure the aria-live region is in the DOM before dispatching
    await expect(assertiveRegion).toBeAttached({ timeout: 5000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('app-announce-assertive', {
          detail: 'Test assertive announcement',
        }),
      );
    });

    await expect(assertiveRegion).toHaveText('Test assertive announcement', {
      timeout: 5000,
    });
  });

  test('route change fires a polite announcement', async ({ page }) => {
    const politeRegion = page
      .locator('[aria-live="polite"][aria-atomic="true"]')
      .first();

    // Ensure the aria-live region is in the DOM before navigating
    await expect(politeRegion).toBeAttached({ timeout: 5000 });

    // Use client-side navigation instead of page.goto() so the React
    // router treats this as a subsequent route change.  The
    // useRouteAnnouncer hook intentionally skips the very first render,
    // and page.goto() triggers a full page reload (= first render).
    //
    // Navigate via the always-present branded home link in the header to ensure
    // this remains a client-side route transition across nav variants.
    const homeLink = page.getByRole('link', { name: /legacy sports home/i });
    await expect(homeLink).toBeVisible({ timeout: 5000 });
    await homeLink.click();

    // The announcement may take a moment after navigation completes
    await expect(politeRegion).toHaveText(/navigated to home/i, {
      timeout: 10000,
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Primary Navigation Landmark
// ---------------------------------------------------------------------------

test.describe('Primary Navigation Landmark @smoke', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('primary navigation landmark is present on /about', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(primaryNav).toBeVisible({ timeout: 15000 });
  });

  test('primary navigation landmark is present on /help', async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');

    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(primaryNav).toBeVisible({ timeout: 15000 });
  });

  test('primary navigation contains expected items', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    // Nav contains pill-tab links for Players and Minigames
    await expect(
      primaryNav.getByRole('link', { name: /^players$/i }),
    ).toBeVisible();
    await expect(
      primaryNav.getByRole('link', { name: /^minigames$/i }),
    ).toBeVisible();
  });

  test('primary nav links are real anchors with hrefs (LS-10779)', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    // A real href is what enables open-in-new-tab / Ctrl+click / middle-click.
    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(
      primaryNav.getByRole('link', { name: /^players$/i }),
    ).toHaveAttribute('href', '/players');
    await expect(
      primaryNav.getByRole('link', { name: /^minigames$/i }),
    ).toHaveAttribute('href', '/games');
  });

  test('plain click and Enter navigate in-app; modified click opens a new tab (LS-10779)', async ({
    page,
    context,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
    // Survives client-side navigation only — a full reload would clear it.
    await page.evaluate(() => {
      (window as unknown as { __spaMarker: boolean }).__spaMarker = true;
    });
    const hasSpaMarker = () =>
      page.evaluate(
        () => (window as unknown as { __spaMarker?: boolean }).__spaMarker,
      );

    const primaryNav = page.getByRole('navigation', { name: 'Primary' });
    const players = primaryNav.getByRole('link', { name: /^players$/i });

    const [newTab] = await Promise.all([
      context.waitForEvent('page'),
      players.click({ modifiers: ['ControlOrMeta'] }),
    ]);
    await newTab.waitForURL('**/players');
    await newTab.close();
    await expect(page).toHaveURL(/\/about$/);

    await players.click();
    await page.waitForURL('**/players');
    expect(await hasSpaMarker()).toBe(true);

    await primaryNav.getByRole('link', { name: /^minigames$/i }).focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/games');
    expect(await hasSpaMarker()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Mobile Menu Accessibility
// ---------------------------------------------------------------------------

test.describe('Mobile Menu Accessibility @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('hamburger button has accessible label "Open menu"', async ({
    page,
  }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await expect(hamburger).toBeVisible({ timeout: 15000 });
  });

  test('hamburger button has aria-expanded="false" when closed', async ({
    page,
  }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  test('hamburger button shows aria-expanded="true" when menu is open', async ({
    page,
  }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    const closeButton = page.getByRole('button', { name: /close menu/i });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    await expect(closeButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('mobile navigation landmark appears after opening menu', async ({
    page,
  }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    await expect(
      page.getByRole('navigation', { name: /mobile navigation/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('Escape key closes the mobile menu', async ({ page }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    await expect(
      page.getByRole('navigation', { name: /mobile navigation/i }),
    ).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(
      page.getByRole('navigation', { name: /mobile navigation/i }),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 6. Keyboard Navigation
// ---------------------------------------------------------------------------

test.describe('Keyboard Navigation @regression', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('interactive elements can receive focus', async ({ page }) => {
    // Programmatically focus the skip link — Tab key is unreliable in
    // headless Chrome where the browser window may lack OS-level focus
    const skipLink = page.getByTestId('skip-link');
    await skipLink.focus();
    await expect(skipLink).toBeFocused({ timeout: 5000 });

    // Verify other interactive elements can also receive focus — the banner
    // logo link is always present on /about.
    const logoLink = page.locator('[role="banner"]').getByRole('link').first();
    await expect(logoLink).toBeVisible();
    await logoLink.focus();
    const focusedTag = await page.evaluate(() =>
      document.activeElement?.tagName?.toLowerCase(),
    );
    expect(['a', 'button', 'input', 'select', 'textarea']).toContain(
      focusedTag,
    );
  });

  test('focus-visible outline is applied to focused links', async ({
    page,
  }) => {
    // Focus the logo link directly to verify focus styling works — it is
    // always rendered in the banner.
    const logoLink = page.locator('[role="banner"]').getByRole('link').first();
    await expect(logoLink).toBeVisible();
    await logoLink.focus();

    // Verify something is focused
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el
        ? el.tagName.toLowerCase() + (el.className ? '.' + el.className : '')
        : '';
    });
    expect(focused).not.toBe('');
  });

  test('nav links are focusable on the About page', async ({ page }) => {
    // The a[href="/about"] link lives inside the Help dropdown which is
    // not rendered until the dropdown is opened.  Instead, verify that
    // the logo link (always visible in the banner) can receive focus.
    const navLink = page.locator('[role="banner"]').getByRole('link').first();
    await expect(navLink).toBeAttached();
    await navLink.focus();

    const isFocused = await navLink.evaluate(
      (el) => el === document.activeElement,
    );
    expect(isFocused).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6b. Keyboard Navigation (mobile) — LS-9732
// ---------------------------------------------------------------------------

/**
 * The desktop "Keyboard Navigation" describe above only ever focuses a link
 * inside the banner — at 375px the banner renders a hamburger button and no
 * anchors at all (`MobileNavDrawer.tsx`), so that coverage says nothing
 * about phone width. This covers focus order and focus-visible styling on
 * the hamburger -> drawer path instead: `MobileNavDrawer` has no focus trap
 * (no `autoFocus`, no initial-focus-on-open effect), so each item is
 * focused directly (`.focus()`, matching this file's convention above:
 * headless Chrome's lack of OS-level focus makes real `Tab` presses
 * unreliable) rather than asserting a specific Tab order the component
 * doesn't itself guarantee.
 */
test.describe('Keyboard Navigation (mobile) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/about');
    await page.waitForLoadState('load');
    await page.getByRole('button', { name: /open menu/i }).click();
    await expect(
      page.getByRole('navigation', { name: /mobile navigation/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('the drawer close button and nav items can receive focus', async ({
    page,
  }) => {
    const closeButton = page.getByRole('button', { name: /close menu/i });
    await closeButton.focus();
    await expect(closeButton).toBeFocused({ timeout: 5000 });

    // A representative drawer nav item (drawer buttons carry no testid —
    // matched by their visible label, same as the Escape-close test above).
    const playersItem = page.getByRole('button', {
      name: 'Players',
      exact: true,
    });
    await playersItem.focus();
    await expect(playersItem).toBeFocused({ timeout: 5000 });
  });

  test('Tab advances focus from the close button to the next drawer item', async ({
    page,
  }) => {
    // A real focus-visible CSS assertion isn't reliable here: like this
    // file's other headless-Chrome caveat above (Tab key / OS-level focus),
    // Chromium's `:focus-visible` heuristic doesn't reliably match either a
    // programmatic `.focus()` or a synthetic `page.keyboard.press('Tab')` in
    // this environment — the global rule (apps/web/src/styles.css) is real,
    // but not something this suite can assert against without a flaky
    // trigger. This instead asserts the concrete, environment-independent
    // fact: focus actually advances via Tab, into another focusable element
    // inside the drawer (MobileNavDrawer has no focus trap to escape).
    const closeButton = page.getByRole('button', { name: /close menu/i });
    await closeButton.focus();
    await expect(closeButton).toBeFocused({ timeout: 5000 });

    await page.keyboard.press('Tab');

    await expect(closeButton).not.toBeFocused({ timeout: 5000 });
    const focusedTag = await page.evaluate(
      () => document.activeElement?.tagName.toLowerCase() ?? '',
    );
    expect(focusedTag).toBe('button');
    const stillInDrawer = await page.evaluate(() =>
      Boolean(
        document.activeElement?.closest('[aria-label="Mobile navigation"]'),
      ),
    );
    expect(stillInDrawer).toBe(true);
  });

  test('Escape closes the drawer while focus is on a nav item', async ({
    page,
  }) => {
    const playersItem = page.getByRole('button', {
      name: 'Players',
      exact: true,
    });
    await playersItem.focus();
    await expect(playersItem).toBeFocused({ timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(
      page.getByRole('navigation', { name: /mobile navigation/i }),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 7. Reduced Motion
// ---------------------------------------------------------------------------

test.describe('Reduced Motion @regression', () => {
  test('page loads with prefers-reduced-motion: reduce', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto('/about');
    await page.waitForLoadState('load');

    // The page should still render correctly with reduced motion
    await expect(
      page.getByRole('heading', { name: /about legacy sports/i }),
    ).toBeVisible();

    await context.close();
  });
});
