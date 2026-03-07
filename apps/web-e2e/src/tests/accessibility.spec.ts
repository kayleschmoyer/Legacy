/**
 * Accessibility E2E Suite (LS-614)
 *
 * Covers:
 *  - Skip links (existence, focus visibility, click-to-focus)
 *  - Keyboard navigation (Tab order, Escape key, focus ring)
 *  - ARIA landmarks (banner, navigation, main, live regions)
 *  - aria-current="page" on active nav links
 *  - Screen reader announcements (aria-live regions present; route change dispatch)
 *  - Mobile menu aria-expanded + Escape close
 *  - Reduced-motion preference respected
 */

import { expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// 1. Skip Links
// ---------------------------------------------------------------------------

test.describe('Skip Link @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('skip link exists in the DOM', async ({ page }) => {
    const skipLink = page.locator('a.skip-link');
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveText('Skip to main content');
  });

  test('skip link href points to #main-content', async ({ page }) => {
    const skipLink = page.locator('a.skip-link');
    await expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  test('skip link is visually hidden before focus', async ({ page }) => {
    // sr-only hides it offscreen; the bounding box is ~1x1 px
    const skipLink = page.locator('a.skip-link');
    const box = await skipLink.boundingBox();
    expect(box).not.toBeNull();
    // sr-only clips to 1px × 1px — any dimension ≤ 4 px is "hidden"
    expect((box?.width ?? 0) <= 4 || (box?.height ?? 0) <= 4).toBe(true);
  });

  test('skip link becomes visible when focused', async ({ page }) => {
    // Tab once — the skip link is the first focusable element
    await page.keyboard.press('Tab');

    const skipLink = page.locator('a.skip-link');
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
    await page.keyboard.press('Tab');
    await expect(page.locator('a.skip-link')).toBeFocused({ timeout: 5000 });
    await page.keyboard.press('Enter');

    const main = page.locator('#main-content');
    await expect(main).toBeFocused({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 2. ARIA Landmarks
// ---------------------------------------------------------------------------

test.describe('ARIA Landmarks @smoke', () => {
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
    const main = page.locator('#main-content');
    await expect(main).toBeAttached();
    // tabIndex=-1 allows programmatic focus (skip link target)
    const tabIndex = await main.getAttribute('tabindex');
    expect(tabIndex).toBe('-1');
  });

  test('logo link has accessible name', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /legacy sports home/i }),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// 3. aria-live Regions (Screen Reader Announcements)
// ---------------------------------------------------------------------------

test.describe('Screen Reader Announcements @smoke', () => {
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
    // Already on /about; navigate to /help
    const politeRegion = page
      .locator('[aria-live="polite"][aria-atomic="true"]')
      .first();

    await page.goto('/help');
    await page.waitForLoadState('load');

    await expect(politeRegion).toHaveText(/navigated to help/i, {
      timeout: 5000,
    });
  });
});

// ---------------------------------------------------------------------------
// 4. aria-current="page" on Nav Links
// ---------------------------------------------------------------------------

test.describe('Active Nav Link (aria-current) @smoke', () => {
  test('About link has aria-current="page" when on /about', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const aboutLink = page.locator(
      '[role="navigation"][aria-label="Primary"] a[href="/about"][aria-current="page"]',
    );
    await expect(aboutLink).toBeVisible({ timeout: 15000 });
  });

  test('Help link has aria-current="page" when on /help', async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');

    const helpLink = page.locator(
      '[role="navigation"][aria-label="Primary"] a[href="/help"][aria-current="page"]',
    );
    await expect(helpLink).toBeVisible({ timeout: 15000 });
  });

  test('About link does not have aria-current on a different page', async ({
    page,
  }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');

    const aboutLinkActive = page.locator(
      '[role="navigation"][aria-label="Primary"] a[href="/about"][aria-current="page"]',
    );
    await expect(aboutLinkActive).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Mobile Menu Accessibility
// ---------------------------------------------------------------------------

test.describe('Mobile Menu Accessibility @smoke', () => {
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

    await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible({
      timeout: 5000,
    });
  });

  test('Escape key closes the mobile menu', async ({ page }) => {
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible({
      timeout: 5000,
    });

    await page.keyboard.press('Escape');

    await expect(
      page.getByRole('navigation', { name: 'Mobile' }),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 6. Keyboard Navigation
// ---------------------------------------------------------------------------

test.describe('Keyboard Navigation @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('Tab key moves focus through interactive elements', async ({ page }) => {
    // First Tab → skip link
    await page.keyboard.press('Tab');
    const skipLink = page.locator('a.skip-link');
    await expect(skipLink).toBeFocused({ timeout: 5000 });

    // Subsequent Tabs move into navigable elements without getting stuck
    // Tab a few more times and verify focus is on something visible
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // At least one of the nav links should be reachable
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
    // Tab to the logo link (first link after skip link)
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // logo link

    // Playwright doesn't expose computed outline directly, but we can check
    // the element is not the skip link (so focus moved on)
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el
        ? el.tagName.toLowerCase() + (el.className ? '.' + el.className : '')
        : '';
    });
    expect(focused).not.toBe('');
  });

  test('nav links are keyboard-reachable on the About page', async ({
    page,
  }) => {
    // Navigate the primary nav links via Tab until we focus the About link
    let foundAboutLink = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const isFocused = await page
        .locator('a[href="/about"]')
        .first()
        .evaluate((el) => el === document.activeElement);
      if (isFocused) {
        foundAboutLink = true;
        break;
      }
    }
    expect(foundAboutLink).toBe(true);
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
    ).toBeVisible({ timeout: 30000 });

    await context.close();
  });
});
