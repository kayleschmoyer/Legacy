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
 * Preferences are stored in localStorage (ls_user_preferences). No GraphQL
 * calls are needed for this page, so the localStorage reset stays in the spec;
 * all element access goes through the injected `settingsPage` object (ADR-0015).
 */

import { expect, test, unauthTest } from '../fixtures/pages';

const PREFS_KEY = 'ls_user_preferences';
const THEME_KEY = 'ls_theme_preference';

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Preferences Page @smoke', () => {
  test.beforeEach(async ({ page, settingsPage }) => {
    // Clear preferences so each test starts from defaults
    await settingsPage.preferences.goto();
    await page.evaluate((key) => localStorage.removeItem(key), PREFS_KEY);
  });

  test('should load and display the Preferences heading', async ({
    settingsPage,
  }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectHeading();
  });

  test('should display auto-save description text', async ({
    settingsPage,
  }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectAutoSaveSubtitle();
  });

  test('should display Appearance section', async ({ settingsPage }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectAppearanceSection();
  });

  test('should display Theme selector with System, Light, Dark options', async ({
    settingsPage,
  }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectThemeLabel();
    await settingsPage.preferences.expectThemeOptionVisible('System');
    await settingsPage.preferences.expectThemeOptionVisible('Light');
    await settingsPage.preferences.expectThemeOptionVisible('Dark');
  });

  test('should display Animations toggle', async ({ settingsPage }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectAnimationsRow();
  });

  test('should display Sports & Stats section', async ({ settingsPage }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectSportsStatsSection();
  });

  test('should display Default sport selector with Baseball and Football', async ({
    settingsPage,
  }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectDefaultSportLabel();
    await settingsPage.preferences.expectSportOptionVisible('Baseball');
    await settingsPage.preferences.expectSportOptionVisible('Football');
  });

  test('should display Stats format selector with Standard and Expanded', async ({
    settingsPage,
  }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectStatsFormatLabel();
    await settingsPage.preferences.expectStatsFormatOptionVisible('Standard');
    await settingsPage.preferences.expectStatsFormatOptionVisible('Expanded');
  });

  test('should display Show season totals toggle', async ({ settingsPage }) => {
    await settingsPage.preferences.goto();
    await settingsPage.preferences.expectSeasonTotalsRow();
  });

  test('should auto-save preference to localStorage when theme is changed', async ({
    page,
    settingsPage,
  }) => {
    await settingsPage.preferences.goto();

    // Click the "Dark" theme option
    await settingsPage.preferences.selectTheme('Dark');

    // Verify saved banner appears
    await settingsPage.preferences.expectSaveBanner();

    // Theme is owned by ThemeContext under its own key (LS-7078)
    const savedTheme = await page.evaluate(
      (key) => localStorage.getItem(key),
      THEME_KEY,
    );
    expect(savedTheme).toBe('dark');
    // ...and must not be mirrored into the shared preferences blob.
    const blob = await page.evaluate(
      (key) => localStorage.getItem(key),
      PREFS_KEY,
    );
    const prefs = JSON.parse(blob ?? '{}') as Record<string, unknown>;
    expect(prefs).not.toHaveProperty('theme');
  });

  test('should persist preferences across page reload', async ({
    page,
    settingsPage,
  }) => {
    await settingsPage.preferences.goto();

    // Select Football as default sport
    await settingsPage.preferences.selectDefaultSport('Football');

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
    settingsPage,
  }) => {
    await settingsPage.preferences.goto();

    // Select Dark theme first
    await settingsPage.preferences.selectTheme('Dark');
    await settingsPage.preferences.expectSaveBanner();

    // Clear localStorage and reload
    await page.evaluate(
      (keys) => keys.forEach((key) => localStorage.removeItem(key)),
      [PREFS_KEY, THEME_KEY],
    );
    await page.reload();

    // Default theme should be "System"
    const saved = await page.evaluate(
      (key) => localStorage.getItem(key),
      PREFS_KEY,
    );
    // No preferences saved = defaults apply
    expect(saved).toBeNull();
    // System chip should be visible (default)
    await settingsPage.preferences.expectThemeOptionVisible('System');
  });
});

// ── Unauthenticated state ─────────────────────────────────────────────────────
//
// When the user is signed out, the Notifications section is replaced by an
// auth-gate card. Appearance + Sports settings still work (localStorage-only).

unauthTest.describe('Preferences Page — unauthenticated @smoke', () => {
  unauthTest.beforeEach(async ({ settingsPage }) => {
    await settingsPage.preferences.goto();
  });

  unauthTest(
    'still loads the page heading when signed out',
    async ({ settingsPage }) => {
      await settingsPage.preferences.expectHeading();
    },
  );

  unauthTest(
    'shows the notifications sign-in card instead of toggles',
    async ({ settingsPage }) => {
      await settingsPage.preferences.expectNotificationsSignInCard();
      // None of the authed notification toggles should be in the DOM.
      await settingsPage.preferences.expectPushNotificationsAbsent();
    },
  );

  unauthTest(
    'Sign In CTA navigates to the home / auth gate',
    async ({ page, settingsPage }) => {
      await settingsPage.preferences.clickSignIn();
      await expect(page).toHaveURL(/\/$|\/?\?/);
    },
  );

  unauthTest(
    'Appearance section is still usable when signed out',
    async ({ settingsPage }) => {
      await settingsPage.preferences.expectAppearanceHeading();
      await settingsPage.preferences.selectTheme('Dark');
      await settingsPage.preferences.expectSaveBanner();
    },
  );
});
