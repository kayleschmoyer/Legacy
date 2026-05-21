/**
 * User Preferences Page E2E Tests (LS-605)
 *
 * Covers the /preferences route: page loading, appearance section with theme
 * chip options, enable-animations toggle, and auto-save behaviour. No GraphQL
 * is required — preferences are stored in localStorage.
 *
 * Note: Theme selection behaviour (System/Light/Dark chip toggling) overlaps
 * with dark-mode.spec.ts. The overlap is intentional here to verify the chips
 * render inside the Preferences page context; dark-mode.spec.ts covers the
 * full visual-mode switching logic.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Tests – static elements
// ---------------------------------------------------------------------------

test.describe('User Preferences – static elements @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');
  });

  test('loads the preferences page without errors', async ({ page }) => {
    await expect(page).toHaveURL('/preferences');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('shows the Preferences heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /preferences/i }),
    ).toBeVisible();
  });

  test('shows the auto-save subtitle', async ({ page }) => {
    await expect(page.getByText(/save automatically/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests – Appearance section
// ---------------------------------------------------------------------------

test.describe('User Preferences – Appearance section @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');
  });

  test('shows the Appearance section heading', async ({ page }) => {
    await expect(page.getByText('Appearance')).toBeVisible();
  });

  test('shows Theme label and options', async ({ page }) => {
    await expect(page.getByText('Theme', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('System', { exact: true }).first()).toBeVisible(
      { timeout: 30000 },
    );
    await expect(page.getByText('Light', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Dark', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('shows Animations toggle', async ({ page }) => {
    await expect(page.getByText('Animations', { exact: true })).toBeVisible();
  });

  test('clicking the Dark theme chip selects it and persists to localStorage', async ({
    page,
  }) => {
    const darkChip = page.locator('[role="radio"]', { hasText: 'Dark' });
    await expect(darkChip).toBeVisible({ timeout: 30000 });
    await darkChip.click();

    // Chip should show as selected
    await expect(
      page.locator('[role="radio"][aria-checked="true"]', { hasText: 'Dark' }),
    ).toBeVisible({ timeout: 10000 });

    // Verify auto-save banner appears
    await expect(page.getByTestId('prefs-save-banner')).toBeVisible({
      timeout: 5000,
    });

    // Verify preference was actually persisted to localStorage
    const savedTheme = await page.evaluate(() => {
      const raw = localStorage.getItem('ls_user_preferences');
      if (!raw) return null;
      try {
        return (JSON.parse(raw) as { theme?: string }).theme ?? null;
      } catch {
        return null;
      }
    });
    expect(savedTheme).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// Tests – toggle interaction
// ---------------------------------------------------------------------------

test.describe('User Preferences – toggle interaction @regression', () => {
  test('Animations toggle is interactive', async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');

    const toggle = page.locator('[role="switch"][aria-label="Animations"]');
    await expect(toggle).toBeVisible();

    const initialState = await toggle.getAttribute('aria-checked');
    const expectedState = initialState === 'true' ? 'false' : 'true';
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', expectedState);
  });
});
