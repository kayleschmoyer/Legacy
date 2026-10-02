/**
 * User Preferences Page E2E Tests (LS-605)
 *
 * Covers the /preferences route: page loading, appearance section with theme
 * chip options, enable-animations toggle, and auto-save behaviour. No GraphQL
 * is required — preferences are stored in localStorage. All element access goes
 * through the injected `settingsPage` object (ADR-0015).
 *
 * Note: Theme selection behaviour (System/Light/Dark chip toggling) overlaps
 * with dark-mode.spec.ts. The overlap is intentional here to verify the chips
 * render inside the Preferences page context; dark-mode.spec.ts covers the
 * full visual-mode switching logic.
 */

import { expect, test } from '../fixtures/pages';

// ---------------------------------------------------------------------------
// Tests – static elements
// ---------------------------------------------------------------------------

test.describe('User Preferences – static elements @smoke', () => {
  test.beforeEach(async ({ settingsPage }) => {
    await settingsPage.preferences.goto();
  });

  test('loads the preferences page without errors', async ({
    page,
    settingsPage,
  }) => {
    await expect(page).toHaveURL('/preferences');
    await settingsPage.preferences.expectHeading();
  });

  test('shows the Preferences heading', async ({ settingsPage }) => {
    await settingsPage.preferences.expectHeading();
  });

  test('shows the auto-save subtitle', async ({ settingsPage }) => {
    await settingsPage.preferences.expectAutoSaveSubtitle();
  });
});

// ---------------------------------------------------------------------------
// Tests – Appearance section
// ---------------------------------------------------------------------------

test.describe('User Preferences – Appearance section @regression', () => {
  test.beforeEach(async ({ settingsPage }) => {
    await settingsPage.preferences.goto();
  });

  test('shows the Appearance section heading', async ({ settingsPage }) => {
    await settingsPage.preferences.expectAppearanceHeading();
  });

  test('shows Theme label and options', async ({ settingsPage }) => {
    await settingsPage.preferences.expectThemeLabel(30000);
    await settingsPage.preferences.expectThemeOptionVisible('System', 30000);
    await settingsPage.preferences.expectThemeOptionVisible('Light', 30000);
    await settingsPage.preferences.expectThemeOptionVisible('Dark', 30000);
  });

  test('shows Animations toggle', async ({ settingsPage }) => {
    await settingsPage.preferences.expectAnimationsToggleVisible();
  });

  test('clicking the Dark theme chip selects it and persists to localStorage', async ({
    page,
    settingsPage,
  }) => {
    await settingsPage.preferences.expectThemeOptionVisible('Dark', 30000);
    await settingsPage.preferences.selectTheme('Dark');

    // Chip should show as selected
    await settingsPage.preferences.expectThemeSelected('Dark', 10000);

    // Verify auto-save banner appears
    await settingsPage.preferences.expectSaveBanner(5000);

    // Verify preference was actually persisted to localStorage
    const savedTheme = await page.evaluate(() =>
      localStorage.getItem('ls_theme_preference'),
    );
    expect(savedTheme).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// Tests – toggle interaction
// ---------------------------------------------------------------------------

test.describe('User Preferences – toggle interaction @regression', () => {
  test('Animations toggle is interactive', async ({ settingsPage }) => {
    await settingsPage.preferences.goto();

    await settingsPage.preferences.expectAnimationsToggleVisible();

    const initialState = await settingsPage.preferences.animationsChecked();
    await settingsPage.preferences.toggleAnimations();
    await settingsPage.preferences.expectAnimationsChecked(!initialState);
  });
});
