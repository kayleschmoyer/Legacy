/**
 * Player Stats — Stats Format Preference E2E Tests (LS-5599)
 *
 * Covers the `statsFormat` preference (`standard` | `expanded`) read from
 * `ls_user_preferences` in localStorage. The preference controls which batting
 * columns the data grid displays:
 *   - `standard` → high-priority columns only (H, HR, RBI, AVG, OBP, SLG, oWAR)
 *   - `expanded` → all columns (adds G, PA, AB, SB, R, 2B, 3B, BB, SO)
 *
 * PA (plate appearances) is the assertion pivot: medium-priority (absent in
 * standard, visible in expanded), batting-only, not in the column picker DOM
 * when the picker is collapsed (default state).
 *
 * The baseline GraphQL mocks (shared-mocks.ts) handle getcareerbattingstats
 * and getcareerpitchingstats, so no custom route setup is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';

const PREFS_KEY = 'ls_user_preferences';

test.describe('Player Stats — Stats Format Preference @regression', () => {
  test('standard-default: absent ls_user_preferences shows high-priority columns only', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key }) => {
        localStorage.removeItem(key);
      },
      { key: PREFS_KEY },
    );
    await page.goto('/players/stats');
    await expect(page.getByText('MLB Career Batting Leaders')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('AVG', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PA', { exact: true })).toHaveCount(0);
  });

  test('standard-explicit: statsFormat=standard shows high-priority columns only', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, fmt }) => {
        localStorage.setItem(key, JSON.stringify({ statsFormat: fmt }));
      },
      { key: PREFS_KEY, fmt: 'standard' },
    );
    await page.goto('/players/stats');
    await expect(page.getByText('MLB Career Batting Leaders')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('AVG', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PA', { exact: true })).toHaveCount(0);
  });

  test('expanded-explicit: statsFormat=expanded shows all columns including PA', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, fmt }) => {
        localStorage.setItem(key, JSON.stringify({ statsFormat: fmt }));
      },
      { key: PREFS_KEY, fmt: 'expanded' },
    );
    await page.goto('/players/stats');
    await expect(page.getByText('MLB Career Batting Leaders')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('AVG', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PA', { exact: true })).toBeVisible();
  });

  test('on-focus-refresh: switching to expanded on window focus updates column set', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, fmt }) => {
        localStorage.setItem(key, JSON.stringify({ statsFormat: fmt }));
      },
      { key: PREFS_KEY, fmt: 'standard' },
    );
    await page.goto('/players/stats');
    await expect(page.getByText('MLB Career Batting Leaders')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('PA', { exact: true })).toHaveCount(0);

    await page.evaluate(
      ({ key }) => {
        localStorage.setItem(key, JSON.stringify({ statsFormat: 'expanded' }));
      },
      { key: PREFS_KEY },
    );
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));

    await expect(page.getByText('PA', { exact: true })).toBeVisible();
  });

  test('corrupt-fallback: invalid JSON in ls_user_preferences falls back to standard', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key }) => {
        localStorage.setItem(key, 'not-valid-json!!!{{{');
      },
      { key: PREFS_KEY },
    );
    await page.goto('/players/stats');
    await expect(page.getByText('MLB Career Batting Leaders')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
    await expect(page.getByText('PA', { exact: true })).toHaveCount(0);
  });

  test('statsVisibleColumns overrides statsFormat to show PA in standard mode', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            statsFormat: 'standard',
            statsVisibleColumns: 'plateAppearances',
          }),
        );
      },
      { key: PREFS_KEY },
    );
    await page.goto('/players/stats');
    await expect(page.getByText('MLB Career Batting Leaders')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('PA', { exact: true })).toBeVisible();
  });
});
