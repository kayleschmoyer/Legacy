import { expect, test } from '../fixtures/auth-enhanced';

/**
 * E2E coverage for the GameLogsTable opponent + home/away filters
 * (LS-5704 / LS-5702).
 *
 * Unit tests cover `buildGameLogsRequestBody` exhaustively (opponent expansion,
 * venue serialization, franchise-relocation mapping). These specs prove the
 * rendered controls drive the POST body end-to-end.
 *
 * The View Game Logs page is routed at `/players/view-game-logs` (LS-7864),
 * mounting GameLogsTable from `lib/shared-components`, so these specs run
 * against the real app shell with the hermetic `auth-enhanced` fixture
 * (baseline GraphQL mocks; per-test `route.fulfill` for the stats endpoint).
 * All five specs are now enabled: combined-filter (LS-7466), opponent
 * enumeration (LS-7479), franchise relocation (LS-7478), and the home/away
 * venue specs (LS-7467).
 */

const PAGE_URL = '/players/view-game-logs';

test.describe('View Game Logs — Opponent + Home/Away filters @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForLoadState('load');
  });

  test('opponent dropdown lists all 30 MLB teams (LS-7479)', async ({
    page,
  }) => {
    const options = page.locator('[data-testid="opponent-filter"] option');
    // Premium users see exactly 30 options (the 30 MLB teams); no "All opponents"
    // placeholder is added because the select becomes multi-select for premium.
    await expect(options).toHaveCount(30);
  });

  test('selecting an opponent + Home toggle posts the combined filter (LS-7466, LS-7467)', async ({
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

  test('relocated franchise (ATH) expands to OAK + LV historical abbrs (LS-7478)', async ({
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

  test('Away toggle posts venue=away (LS-7467)', async ({ page }) => {
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

  test('venue=all (default) omits the venue key entirely (LS-7467)', async ({
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

test.describe('View Game Logs — Date input validation (LS-7455) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL);
    await page.waitForLoadState('load');
  });

  test('start date after end date is rejected client-side (LS-7455)', async ({
    page,
  }) => {
    let postCalled = false;
    await page.route('**/baseball-game-logs', async (route) => {
      postCalled = true;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.getByPlaceholder('Enter player ID').fill('mlb-1234');
    // On web the DateField renders <input type="date" data-testid="game-logs-…-date">
    // (no placeholder). The native input only accepts ISO strings, so malformed
    // free text is impossible by construction — Playwright's fill() raises for
    // non-conforming strings. The reachable client-side date validation is the
    // start > end ordering check: both fields take valid ISO dates and
    // validateDateRange flags the inverted range.
    await page.getByTestId('game-logs-start-date').fill('2020-06-02');
    await page.getByTestId('game-logs-end-date').fill('2020-06-01');

    // Validation is reactive — the error alert appears immediately after filling
    // the inverted range; the submit button becomes disabled so we never click it.
    await expect(page.getByRole('alert')).toContainText(
      'Start date must be on or before end date.',
    );
    await expect(
      page.getByRole('button', { name: 'Get Player Data' }),
    ).toBeDisabled();
    expect(postCalled).toBe(false);
  });

  test('future start date (2099-12-31) is rejected client-side (LS-7452, LS-7455)', async ({
    page,
  }) => {
    let postCalled = false;
    await page.route('**/baseball-game-logs', async (route) => {
      postCalled = true;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.getByPlaceholder('Enter player ID').fill('mlb-1234');
    // <input type="date"> enforces `max` at the browser level: Playwright's
    // fill() is silently sanitised to empty when the date exceeds the max
    // attribute. Use the native property setter so Chrome accepts the value
    // and React's onChange fires with the future date, exercising client-side
    // validation without bypassing React's event system.
    await page
      .locator('[data-testid="game-logs-start-date"]')
      .evaluate((el) => {
        const input = el as HTMLInputElement;
        // Chrome sanitises a date input's value to empty when the value exceeds
        // the max attribute, so Playwright's fill() never reaches React's
        // onChange. Remove max first so the native setter accepts the value.
        input.removeAttribute('max');
        // Direct property assignment may be tracked by React's controlled-input
        // reconciliation and silently dropped on the next re-render. Reflect.set
        // invokes the native HTMLInputElement value setter with `input` as the
        // receiver, bypassing React's own-property wrapper so that React's
        // change-detection sees a real value update and fires onChange.
        Reflect.set(HTMLInputElement.prototype, 'value', '2099-12-31', input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

    // Validation is reactive — the error alert appears immediately after filling
    // the future date; the submit button becomes disabled so we never click it.
    await expect(page.getByRole('alert')).toContainText(
      'Start date cannot be in the future',
    );
    await expect(
      page.getByRole('button', { name: 'Get Player Data' }),
    ).toBeDisabled();
    expect(postCalled).toBe(false);
  });
});
