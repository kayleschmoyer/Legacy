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

  test('shows Customize your Legacy Sports experience copy', async ({
    page,
  }) => {
    await expect(
      page.getByText(/customize your legacy sports experience/i),
    ).toBeVisible();
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
    await expect(page.getByText('Theme')).toBeVisible();
    await expect(page.getByText('System')).toBeVisible();
    await expect(page.getByText('Light')).toBeVisible();
    await expect(page.getByText('Dark')).toBeVisible();
  });

  test('shows Enable animations toggle', async ({ page }) => {
    await expect(page.getByText('Enable animations')).toBeVisible();
  });

  test('clicking the Dark theme chip selects it and persists to localStorage', async ({
    page,
  }) => {
    const darkChip = page.getByText('Dark');
    await expect(darkChip).toBeVisible();
    await darkChip.click();

    // Chip should show as selected
    await expect(
      page.locator('[role="radio"][aria-checked="true"]', { hasText: 'Dark' }),
    ).toBeVisible({ timeout: 10000 });

    // Verify auto-save banner appears
    await expect(page.getByText('Preferences saved')).toBeVisible({
      timeout: 5000,
    });

    // Verify preference was actually persisted to localStorage
    const savedTheme = await page.evaluate(() =>
      localStorage.getItem('ls-theme'),
    );
    expect(savedTheme).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// Tests – toggle interaction
// ---------------------------------------------------------------------------

test.describe('User Preferences – toggle interaction @regression', () => {
  test('Enable animations toggle is interactive', async ({ page }) => {
    await page.goto('/preferences');
    await page.waitForLoadState('load');

    const toggle = page.locator(
      '[role="switch"][aria-label="Enable animations"]',
    );
    await expect(toggle).toBeVisible();

    const initialState = await toggle.getAttribute('aria-checked');
    const expectedState = initialState === 'true' ? 'false' : 'true';
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', expectedState);
  });
});
