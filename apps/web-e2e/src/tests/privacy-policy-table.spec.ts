/**
 * /privacy section 6 third-party processors table (LS-10763, LS-10730).
 *
 * - At 375px the table scrolls inside a keyboard-focusable region, so every
 *   column and policy link is reachable even though the app shell clips
 *   x-overflow.
 * - In the light theme the header and cell text are dark, not the dark-theme
 *   near-white.
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';

const LS_THEME_KEY = 'ls_theme_preference';

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    LS_THEME_KEY,
    theme,
  ] as const);
}

function processorsRegion(page: Page) {
  return page.getByRole('region', { name: 'Third-party services' });
}

/** WCAG relative-luminance contrast ratio between two `rgb(...)` strings. */
function contrastRatio(fg: string, bg: string): number {
  const luminance = (css: string) => {
    const [r, g, b] = (css.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('Privacy processors table — 375px @regression', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('every column and the last policy link can be scrolled into view', async ({
    page,
  }) => {
    await page.goto('/privacy');
    const region = processorsRegion(page);
    await expect(region).toBeVisible();

    // The region itself fits the viewport; its content is wider and scrolls.
    const box = await region.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
    const { scrollWidth, clientWidth } = await region.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    const lastLink = region.getByRole('link', {
      name: 'growthbook.io/privacy',
    });
    await lastLink.scrollIntoViewIfNeeded();
    await expect(lastLink).toBeInViewport();

    const lastHeader = region.getByRole('columnheader', {
      name: 'Privacy Policy',
    });
    await lastHeader.scrollIntoViewIfNeeded();
    await expect(lastHeader).toBeInViewport();
  });

  test('the scroll region is keyboard-focusable and scrolls with arrow keys', async ({
    page,
  }) => {
    await page.goto('/privacy');
    const region = processorsRegion(page);
    await region.focus();
    await expect(region).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => region.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
  });
});

test.describe('Privacy processors table — light theme @regression', () => {
  test('header and cell text meet 4.5:1 on the page background', async ({
    page,
  }) => {
    await setTheme(page, 'light');
    await page.goto('/privacy');
    const region = processorsRegion(page);
    await expect(region).toBeVisible();

    const colours = await region.evaluate((el) => {
      let bgEl: Element | null = el;
      let bg = 'rgba(0, 0, 0, 0)';
      while (bgEl) {
        bg = getComputedStyle(bgEl).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break;
        bgEl = bgEl.parentElement;
      }
      const th = el.querySelector('th');
      const td = el.querySelector('td');
      const a = el.querySelector('a');
      return {
        bg,
        th: th ? getComputedStyle(th).color : '',
        td: td ? getComputedStyle(td).color : '',
        link: a ? getComputedStyle(a).color : '',
      };
    });

    expect(contrastRatio(colours.th, colours.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colours.td, colours.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colours.link, colours.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('dark theme keeps the original table colours', async ({ page }) => {
    await setTheme(page, 'dark');
    await page.goto('/privacy');
    const region = processorsRegion(page);
    await expect(region.locator('th').first()).toHaveCSS(
      'color',
      'rgb(229, 229, 229)',
    );
    await expect(region.locator('td').first()).toHaveCSS(
      'color',
      'rgb(163, 163, 163)',
    );
  });
});
