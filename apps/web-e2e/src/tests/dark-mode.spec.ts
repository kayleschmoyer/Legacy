/**
 * Dark Mode / Theme Toggle E2E Tests (LS-692)
 *
 * Covers:
 *  - Preferences page renders the theme chip group
 *  - Selecting a theme persists the value to localStorage immediately
 *  - Selected theme survives a page reload (persistence)
 *  - .app-container CSS class reflects the active theme
 *  - Dark mode applies a dark background colour
 *  - Light mode applies a light background colour
 *  - Text colour in dark mode provides sufficient contrast against the bg
 *  - Text colour in light mode provides sufficient contrast against the bg
 *  - Theme change takes effect immediately without a reload
 *  - System preference defaults to "system" when no value is stored
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';

/* ── Constants ──────────────────────────────────────────────────────────── */

/** localStorage key shared by ThemeContext and PreferencesPage */
const LS_PREFS_KEY = 'ls_user_preferences';

/** Expected computed background-color strings for each theme (from AppProvider.tsx) */
const DARK_BG_CSS = 'rgb(10, 15, 26)'; // #0A0F1A
const LIGHT_BG_CSS = 'rgb(247, 249, 252)'; // #F7F9FC

/* ── Helper: read theme from localStorage ───────────────────────────────── */

async function readThemePref(page: Page): Promise<string | null> {
  return page.evaluate((key: string) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { theme?: string };
      return parsed.theme ?? null;
    } catch {
      return null;
    }
  }, LS_PREFS_KEY);
}

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('Preferences page – theme section renders @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');
  });

  test('Appearance section heading is visible', async ({ page }) => {
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });
  });

  test('Theme label is visible', async ({ page }) => {
    // getByText is substring-based, so use .first() to pick the label paragraph
    await expect(page.getByText('Theme').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('System chip is visible with radio role', async ({ page }) => {
    const chip = page.locator('[role="radio"]').filter({ hasText: /^System$/ });
    await expect(chip).toBeVisible({ timeout: 15000 });
  });

  test('Light chip is visible with radio role', async ({ page }) => {
    const chip = page.locator('[role="radio"]').filter({ hasText: /^Light$/ });
    await expect(chip).toBeVisible({ timeout: 15000 });
  });

  test('Dark chip is visible with radio role', async ({ page }) => {
    const chip = page.locator('[role="radio"]').filter({ hasText: /^Dark$/ });
    await expect(chip).toBeVisible({ timeout: 15000 });
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('Theme preference – persistence to localStorage @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');
    // Wait for the Appearance section to confirm the page is interactive
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });
  });

  test('selecting Dark stores theme=dark in localStorage', async ({ page }) => {
    const darkChip = page
      .locator('[role="radio"]')
      .filter({ hasText: /^Dark$/ });
    await darkChip.click();

    const stored = await readThemePref(page);
    expect(stored).toBe('dark');
  });

  test('selecting Light stores theme=light in localStorage', async ({
    page,
  }) => {
    const lightChip = page
      .locator('[role="radio"]')
      .filter({ hasText: /^Light$/ });
    await lightChip.click();

    const stored = await readThemePref(page);
    expect(stored).toBe('light');
  });

  test('selecting System stores theme=system in localStorage', async ({
    page,
  }) => {
    // First switch to dark so we have a non-system value
    await page
      .locator('[role="radio"]')
      .filter({ hasText: /^Dark$/ })
      .click();

    const systemChip = page
      .locator('[role="radio"]')
      .filter({ hasText: /^System$/ });
    await systemChip.click();

    const stored = await readThemePref(page);
    expect(stored).toBe('system');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('Theme preference – survives page reload @regression', () => {
  test('Dark preference is restored after reload', async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });

    // Select Dark
    await page
      .locator('[role="radio"]')
      .filter({ hasText: /^Dark$/ })
      .click();

    // Reload the page
    await page.reload();
    await page.waitForLoadState('load');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });

    // Dark chip must still be checked
    const darkChip = page
      .locator('[role="radio"]')
      .filter({ hasText: /^Dark$/ });
    await expect(darkChip).toHaveAttribute('aria-checked', 'true');
  });

  test('Light preference is restored after reload', async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });

    await page
      .locator('[role="radio"]')
      .filter({ hasText: /^Light$/ })
      .click();

    await page.reload();
    await page.waitForLoadState('load');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });

    const lightChip = page
      .locator('[role="radio"]')
      .filter({ hasText: /^Light$/ });
    await expect(lightChip).toHaveAttribute('aria-checked', 'true');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('Dark mode – component rendering @regression', () => {
  test.beforeEach(async ({ page }) => {
    // Inject dark theme into localStorage before any page scripts run
    await page.addInitScript(
      ({ key }: { key: string }) => {
        const existing = JSON.parse(
          localStorage.getItem(key) ?? '{}',
        ) as Record<string, unknown>;
        localStorage.setItem(
          key,
          JSON.stringify({ ...existing, theme: 'dark' }),
        );
      },
      { key: LS_PREFS_KEY },
    );
  });

  test('app-container element has class "dark"', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });
    await expect(container).toHaveClass(/\bdark\b/);
  });

  test('app-container background colour is the dark theme colour', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });

    const bgColor = await container.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor,
    );
    expect(bgColor).toBe(DARK_BG_CSS);
  });

  test('app-container does not have class "light" in dark mode', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).not.toHaveClass(/\blight\b/);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('Light mode – component rendering @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ key }: { key: string }) => {
        const existing = JSON.parse(
          localStorage.getItem(key) ?? '{}',
        ) as Record<string, unknown>;
        localStorage.setItem(
          key,
          JSON.stringify({ ...existing, theme: 'light' }),
        );
      },
      { key: LS_PREFS_KEY },
    );
  });

  test('app-container element has class "light"', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });
    await expect(container).toHaveClass(/\blight\b/);
  });

  test('app-container background colour is the light theme colour', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });

    const bgColor = await container.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor,
    );
    expect(bgColor).toBe(LIGHT_BG_CSS);
  });

  test('app-container does not have class "dark" in light mode', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).not.toHaveClass(/\bdark\b/);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('Contrast check – dark mode @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ key }: { key: string }) => {
        const existing = JSON.parse(
          localStorage.getItem(key) ?? '{}',
        ) as Record<string, unknown>;
        localStorage.setItem(
          key,
          JSON.stringify({ ...existing, theme: 'dark' }),
        );
      },
      { key: LS_PREFS_KEY },
    );
  });

  test('app-container text colour in dark mode is light (high contrast)', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });

    const textColor = await container.evaluate(
      (el) => window.getComputedStyle(el).color,
    );

    // Parse r,g,b values — each channel must be >= 200 for a light colour
    const match = textColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) throw new Error(`Unexpected color format: ${textColor}`);
    const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];

    // Light text: all channels should be bright (≥ 200 out of 255)
    expect(r).toBeGreaterThanOrEqual(200);
    expect(g).toBeGreaterThanOrEqual(200);
    expect(b).toBeGreaterThanOrEqual(200);
  });

  test('contrast ratio for dark mode text on background meets WCAG AA', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });

    const { textColor, bgColor } = await container.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { textColor: style.color, bgColor: style.backgroundColor };
    });

    const ratio = computeContrastRatio(textColor, bgColor);
    // WCAG AA normal text requires ≥ 4.5:1
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('Contrast check – light mode @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ key }: { key: string }) => {
        const existing = JSON.parse(
          localStorage.getItem(key) ?? '{}',
        ) as Record<string, unknown>;
        localStorage.setItem(
          key,
          JSON.stringify({ ...existing, theme: 'light' }),
        );
      },
      { key: LS_PREFS_KEY },
    );
  });

  test('app-container text colour in light mode is dark (high contrast)', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });

    const textColor = await container.evaluate(
      (el) => window.getComputedStyle(el).color,
    );

    // Dark text: all channels should be low (≤ 100 out of 255)
    const match = textColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) throw new Error(`Unexpected color format: ${textColor}`);
    const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];

    // Dark text (e.g. #222B45 = rgb(34, 43, 69))
    expect(r).toBeLessThanOrEqual(100);
    expect(g).toBeLessThanOrEqual(100);
    expect(b).toBeLessThanOrEqual(100);
  });

  test('contrast ratio for light mode text on background meets WCAG AA', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });

    const { textColor, bgColor } = await container.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { textColor: style.color, bgColor: style.backgroundColor };
    });

    const ratio = computeContrastRatio(textColor, bgColor);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('Theme change takes effect immediately without reload @regression', () => {
  test('switching to Dark on preferences page applies dark class before navigating', async ({
    page,
  }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });

    // Select Dark
    await page
      .locator('[role="radio"]')
      .filter({ hasText: /^Dark$/ })
      .click();

    // Navigate to another page without reloading
    await page.goto('/about');
    await page.waitForLoadState('load');

    // The app-container should reflect dark mode
    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });
    await expect(container).toHaveClass(/\bdark\b/);
  });

  test('switching to Light on preferences page applies light class before navigating', async ({
    page,
  }) => {
    // NOTE: Do NOT use addInitScript here — it re-fires on every page.goto(),
    // which would override the preference set by clicking the chip.
    // Instead seed dark theme via evaluate after the first navigation.
    await page.goto('/preferences');
    await page.waitForLoadState('load');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });

    // Seed dark so we can verify a real switch to light
    await page.evaluate(
      ({ key }: { key: string }) => {
        const existing = JSON.parse(
          localStorage.getItem(key) ?? '{}',
        ) as Record<string, unknown>;
        localStorage.setItem(
          key,
          JSON.stringify({ ...existing, theme: 'dark' }),
        );
      },
      { key: LS_PREFS_KEY },
    );
    // Reload so ThemeContext picks up the dark preference
    await page.reload();
    await page.waitForLoadState('load');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });

    // Switch to Light
    await page
      .locator('[role="radio"]')
      .filter({ hasText: /^Light$/ })
      .click();

    await page.goto('/about');
    await page.waitForLoadState('load');

    const container = page.locator('.app-container');
    await expect(container).toBeVisible({ timeout: 15000 });
    await expect(container).toHaveClass(/\blight\b/);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

test.describe('System theme default @regression', () => {
  test('System chip is aria-checked when no preference is stored', async ({
    page,
  }) => {
    // Clear the preferences key before the page initialises
    await page.addInitScript(
      ({ key }: { key: string }) => {
        localStorage.removeItem(key);
      },
      { key: LS_PREFS_KEY },
    );

    await page.goto('/preferences');
    await page.waitForLoadState('load');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15000 });

    const systemChip = page
      .locator('[role="radio"]')
      .filter({ hasText: /^System$/ });
    await expect(systemChip).toHaveAttribute('aria-checked', 'true');
  });
});

/* ── Utility: WCAG contrast ratio ───────────────────────────────────────── */

/**
 * Parses an `rgb(r, g, b)` string and returns the WCAG relative luminance.
 * See https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(rgbStr: string): number {
  const m = rgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return 0;
  const srgb = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  const lin = srgb.map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * Returns the WCAG contrast ratio between two rgb(...) colour strings.
 * A ratio ≥ 4.5 satisfies WCAG AA for normal-sized text.
 */
function computeContrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
