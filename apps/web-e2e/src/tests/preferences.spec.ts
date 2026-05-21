/**
 * Preferences Page — E2E Tests (LS-678)
 *
 * Covers the Preferences page at /preferences:
 *   - Page loads with "Preferences" heading
 *   - Visibility of Appearance section (theme options, animations toggle)
 *   - Visibility of Sports & Stats section (default sport, stats format, season totals)
 *   - Auto-save: selecting a theme or sport persists to localStorage
 *   - Save banner ("Saved") appears after change
 *   - Reset: clearing localStorage reverts to defaults on reload
 *
 * Note: Only theme and default-sport interactions are exercised end-to-end.
 * Toggle interactions (animations, season totals) and stats-format selection
 * are visibility-only checks — full interaction tests are not yet implemented.
 *
 * Preferences are stored in localStorage (ls_user_preferences).
 * No GraphQL calls are needed for this page.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';

const PREFS_KEY = 'ls_user_preferences';

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Preferences Page @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Clear preferences so each test starts from defaults
    await page.goto('/preferences');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate((key) => localStorage.removeItem(key), PREFS_KEY);
  });

  // Note: data-testid attributes are not yet present on Preferences page
  // components. Role-based queries are used where possible; getByText with
  // { exact: true } is used as a fallback for elements without semantic roles.

  test('should load and display the Preferences heading', async ({ page }) => {
    await page.goto('/preferences');
    await expect(
      page.getByRole('heading', { name: 'Preferences' }),
    ).toBeVisible();
  });

  test('should display auto-save description text', async ({ page }) => {
    await page.goto('/preferences');
    await expect(page.getByText(/save automatically/i)).toBeVisible();
  });

  test('should display Appearance section', async ({ page }) => {
    await page.goto('/preferences');
    await expect(page.getByText('Appearance', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Theme · Animations', { exact: true }),
    ).toBeVisible();
  });

  test('should display Theme selector with System, Light, Dark options', async ({
    page,
  }) => {
    await page.goto('/preferences');
    await expect(page.getByText('Theme', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'System' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Light' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeVisible();
  });

  test('should display Animations toggle', async ({ page }) => {
    await page.goto('/preferences');
    await expect(page.getByText('Animations', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Page transitions and micro-motion/),
    ).toBeVisible();
  });

  test('should display Sports & Stats section', async ({ page }) => {
    await page.goto('/preferences');
    await expect(
      page.getByText('Sports & Stats', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Default sport · Format · Totals', { exact: true }),
    ).toBeVisible();
  });

  test('should display Default sport selector with Baseball and Football', async ({
    page,
  }) => {
    await page.goto('/preferences');
    await expect(
      page.getByText('Default sport', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Baseball' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Football' })).toBeVisible();
  });

  test('should display Stats format selector with Standard and Expanded', async ({
    page,
  }) => {
    await page.goto('/preferences');
    await expect(page.getByText('Stats format', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Standard' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Expanded' })).toBeVisible();
  });

  test('should display Show season totals toggle', async ({ page }) => {
    await page.goto('/preferences');
    await expect(
      page.getByText('Show season totals', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Append running season numbers/)).toBeVisible();
  });

  test('should auto-save preference to localStorage when theme is changed', async ({
    page,
  }) => {
    await page.goto('/preferences');

    // Click the "Dark" theme option
    await page.getByRole('radio', { name: 'Dark' }).click();

    // Verify saved banner appears
    await expect(page.getByTestId('prefs-save-banner')).toBeVisible();

    // Verify preference was saved to localStorage
    const saved = await page.evaluate(
      (key) => localStorage.getItem(key),
      PREFS_KEY,
    );
    expect(saved).not.toBeNull();
    const prefs = JSON.parse(saved ?? '{}') as Record<string, unknown>;
    expect(prefs.theme).toBe('dark');
  });

  test('should persist preferences across page reload', async ({ page }) => {
    await page.goto('/preferences');

    // Select Football as default sport
    await page.getByRole('radio', { name: 'Football' }).click();

    // Reload
    await page.reload();

    // Football should still be selected (saved via localStorage)
    const saved = await page.evaluate(
      (key) => localStorage.getItem(key),
      PREFS_KEY,
    );
    expect(saved).not.toBeNull();
    const prefs = JSON.parse(saved ?? '{}') as Record<string, unknown>;
    expect(prefs.defaultSport).toBe('football');
  });

  test('should reset to defaults when localStorage is cleared and page is reloaded', async ({
    page,
  }) => {
    await page.goto('/preferences');

    // Select Dark theme first
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.getByTestId('prefs-save-banner')).toBeVisible();

    // Clear localStorage and reload
    await page.evaluate((key) => localStorage.removeItem(key), PREFS_KEY);
    await page.reload();

    // Default theme should be "System"
    const saved = await page.evaluate(
      (key) => localStorage.getItem(key),
      PREFS_KEY,
    );
    // No preferences saved = defaults apply
    expect(saved).toBeNull();
    // System chip should be visible (default)
    await expect(page.getByText('System')).toBeVisible();
  });
});

// ── Unauthenticated state ─────────────────────────────────────────────────────
//
// When the user is signed out, the Notifications section is replaced by an
// auth-gate card. Appearance + Sports settings still work (localStorage-only).

unauthTest.describe('Preferences Page — unauthenticated @smoke', () => {
  unauthTest.beforeEach(async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('domcontentloaded');
  });

  unauthTest(
    'still loads the page heading when signed out',
    async ({ page }) => {
      await expect(
        page.getByRole('heading', { name: 'Preferences' }),
      ).toBeVisible();
    },
  );

  unauthTest(
    'shows the notifications sign-in card instead of toggles',
    async ({ page }) => {
      await expect(page.getByText('Sign in to set alerts')).toBeVisible();
      await expect(
        page.getByText(
          /Push, email, and matchup alerts live with your account/,
        ),
      ).toBeVisible();
      // None of the authed notification toggles should be in the DOM.
      await expect(
        page.getByText('Push notifications', { exact: true }),
      ).toHaveCount(0);
    },
  );

  unauthTest(
    'Sign In CTA navigates to the home / auth gate',
    async ({ page }) => {
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/$|\/?\?/);
    },
  );

  unauthTest(
    'Appearance section is still usable when signed out',
    async ({ page }) => {
      await expect(page.getByText('Appearance', { exact: true })).toBeVisible();
      await page.getByRole('radio', { name: 'Dark' }).click();
      await expect(page.getByTestId('prefs-save-banner')).toBeVisible();
    },
  );
});
