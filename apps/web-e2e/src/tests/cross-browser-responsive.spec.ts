/**
 * Cross-Browser & Responsive Layout Visual Regression Tests
 *
 * LS-618 — Validates that key pages render correctly across all configured
 * browsers (Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari) and at
 * the three standard breakpoints (mobile 375, tablet 768, desktop 1280).
 *
 * Tagged @visual — runs on manual trigger or nightly CI.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { SnapshotUtils } from '../support/snapshot-utils';

// ---------------------------------------------------------------------------
// Breakpoint definitions
// ---------------------------------------------------------------------------

const BREAKPOINTS = [
  { label: 'mobile', width: 375, height: 812 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'desktop', width: 1280, height: 900 },
] as const;

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

test.describe('Homepage — cross-browser responsive @visual', () => {
  for (const bp of BREAKPOINTS) {
    test(`renders correctly at ${bp.label} (${bp.width}×${bp.height})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await SnapshotUtils.waitForImages(page);
      await SnapshotUtils.preparePage(page);

      await expect(page).toHaveScreenshot(
        `homepage-${bp.label}-${browserName}.png`,
        {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.02,
        },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// About page
// ---------------------------------------------------------------------------

test.describe('About page — cross-browser responsive @visual', () => {
  for (const bp of BREAKPOINTS) {
    test(`renders correctly at ${bp.label} (${bp.width}×${bp.height})`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/about');
      await page.waitForLoadState('load');
      await SnapshotUtils.preparePage(page);

      await expect(page).toHaveScreenshot(
        `about-${bp.label}-${browserName}.png`,
        {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.02,
        },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Navigation header — layout breakpoints
// ---------------------------------------------------------------------------

test.describe('Navigation header — responsive layout @visual', () => {
  test('desktop nav shows primary links inline', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/about');
    await page.waitForLoadState('load');
    await SnapshotUtils.preparePage(page);

    const header = page.getByRole('banner');
    await expect(header).toBeVisible({ timeout: 15000 });

    await expect(header).toHaveScreenshot(`nav-desktop-${browserName}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('mobile nav collapses to hamburger', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/about');
    await page.waitForLoadState('load');
    // Reload so Tamagui responsive styles apply at this viewport
    await page.reload();
    await page.waitForLoadState('load');
    await SnapshotUtils.preparePage(page);

    const header = page.getByRole('banner');
    await expect(header).toBeVisible({ timeout: 15000 });

    await expect(header).toHaveScreenshot(
      `nav-mobile-collapsed-${browserName}.png`,
      {
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      },
    );
  });

  test('mobile nav expands when hamburger is tapped', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/about');
    await page.waitForLoadState('load');
    await page.reload();
    await page.waitForLoadState('load');
    await SnapshotUtils.preparePage(page);

    const hamburger = page.getByRole('button', {
      name: /open menu|close menu/i,
    });
    await expect(hamburger).toBeVisible({ timeout: 15000 });
    await hamburger.click();
    // Allow drawer animation to settle (animations are disabled via style tag
    // injected by preparePage, so a short structural wait suffices).
    await page.waitForTimeout(200);

    await expect(page).toHaveScreenshot(`nav-mobile-open-${browserName}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
    });
  });
});

// ---------------------------------------------------------------------------
// League create page — authenticated, no data fetch
// ---------------------------------------------------------------------------

test.describe('League create page — cross-browser responsive @visual', () => {
  for (const bp of BREAKPOINTS) {
    test(`renders form correctly at ${bp.label}`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('load');
      await SnapshotUtils.preparePage(page);

      // Confirm the page loaded (not redirected to login)
      await expect(
        page.getByRole('heading', { name: /create.*league/i }),
      ).toBeVisible({ timeout: 20000 });

      await expect(page).toHaveScreenshot(
        `league-create-${bp.label}-${browserName}.png`,
        {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.02,
        },
      );
    });
  }
});
