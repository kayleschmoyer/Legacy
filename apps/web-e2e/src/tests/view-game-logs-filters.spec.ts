import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the GameLogsTable opponent + home/away filters
 * (LS-5704 / LS-5702 — closes LS-7479 and LS-7467).
 *
 * Unit tests cover `buildGameLogsRequestBody` exhaustively (opponent expansion,
 * venue serialization, franchise-relocation mapping). These specs prove the
 * rendered controls drive the POST body end-to-end.
 *
 * Marked `.fixme` for the same reason as the date-range suite: GameLogsTable
 * is exported from `lib/shared-components` but the View Game Logs page isn't
 * routed yet. Drop the `.fixme` markers once the page lands at
 * `/players/view-game-logs`.
 */

const PAGE_URL = '/players/view-game-logs';

test.describe('View Game Logs — Opponent + Home/Away filters @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');
  });

  test.fixme('opponent dropdown lists all 30 MLB teams (LS-7479)', async ({
    page,
  }) => {
    const options = page.locator('[data-testid="opponent-filter"] option');
    // 30 MLB teams + the "All opponents" placeholder.
    await expect(options).toHaveCount(31);
  });

  test.fixme('selecting an opponent + Home toggle posts the combined filter (LS-7466, LS-7467)', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('**/baseball-game-logs', async (route) => {
      body = JSON.parse(route.request().postData() ?? '{}') as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.getByPlaceholder('Enter player ID').fill('mlb-1234');
    await page.getByTestId('opponent-filter').selectOption('NYY');
    await page.getByTestId('venue-home').click();
    await page.getByRole('button', { name: 'Get Player Data' }).click();

    await expect.poll(() => body).not.toBeNull();
    expect(body).toMatchObject({
      player_id: 'mlb-1234',
      opponent_franchise_ids: ['NYY'],
      venue: 'home',
    });
  });

  test.fixme('relocated franchise (ATH) expands to OAK + LV historical abbrs (LS-7478)', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('**/baseball-game-logs', async (route) => {
      body = JSON.parse(route.request().postData() ?? '{}') as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.getByPlaceholder('Enter player ID').fill('mlb-1234');
    await page.getByTestId('opponent-filter').selectOption('ATH');
    await page.getByRole('button', { name: 'Get Player Data' }).click();

    await expect.poll(() => body).not.toBeNull();
    const opponentAbbrs =
      (body as { opponent_abbrs?: string[] }).opponent_abbrs ?? [];
    expect(opponentAbbrs).toEqual(expect.arrayContaining(['ATH', 'OAK', 'LV']));
  });

  test.fixme('Away toggle posts venue=away (LS-7465)', async ({ page }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('**/baseball-game-logs', async (route) => {
      body = JSON.parse(route.request().postData() ?? '{}') as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.getByPlaceholder('Enter player ID').fill('mlb-1234');
    await page.getByTestId('venue-away').click();
    await page.getByRole('button', { name: 'Get Player Data' }).click();

    await expect.poll(() => body).not.toBeNull();
    expect((body as { venue?: string }).venue).toBe('away');
  });

  test.fixme('venue=all (default) omits the venue key entirely', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('**/baseball-game-logs', async (route) => {
      body = JSON.parse(route.request().postData() ?? '{}') as Record<
        string,
        unknown
      >;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.getByPlaceholder('Enter player ID').fill('mlb-1234');
    await page.getByRole('button', { name: 'Get Player Data' }).click();

    await expect.poll(() => body).not.toBeNull();
    expect(body).not.toHaveProperty('venue');
  });
});
