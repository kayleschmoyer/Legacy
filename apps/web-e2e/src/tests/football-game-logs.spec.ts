import { expect, test } from '../fixtures/auth-enhanced';

/**
 * E2E coverage for the Football Game Logs page route (LS-5433).
 *
 * The route `/football/players/view-game-logs` mounts `FootballViewGameLogsPage`
 * which renders `GameLogsTable` with sport="nfl". These specs ensure the route
 * loads and the `nfl-game-logs` endpoint is wired correctly.
 */

const PAGE_URL = '/football/players/view-game-logs';

test.describe('Football View Game Logs — route smoke test (LS-5433) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForLoadState('load');
  });

  test('page renders the GameLogsTable player ID input', async ({ page }) => {
    await expect(page.getByPlaceholder('Enter player ID')).toBeVisible();
  });

  test('submitting the form posts to the nfl-game-logs endpoint', async ({
    page,
  }) => {
    let endpointCalled = false;
    await page.route('**/nfl-game-logs', async (route) => {
      endpointCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.getByPlaceholder('Enter player ID').fill('nfl-1234');
    await page.getByRole('button', { name: 'Get Player Data' }).click();

    await expect.poll(() => endpointCalled).toBe(true);
  });
});
