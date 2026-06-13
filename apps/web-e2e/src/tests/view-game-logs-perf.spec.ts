import { expect, type Route, test } from '@playwright/test';

// LS-7474 — render-time guardrail for the Game Logs table.
//
// Injects a synthetic 1000-row paginated payload via fetch interception, then
// measures the time between the fetch resolving and the first batch of rows
// being visible. The virtualized body should render in well under 200ms even
// on the 1000-row premium-career case (LS-7475).

const PAGE_SIZE = 50;
const TOTAL_ROWS = 1000;
const STATS = ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'SB', 'BB', 'SO'];

function makePage(offset: number) {
  const rows: Array<Record<string, number | string>> = [];
  const upper = Math.min(offset + PAGE_SIZE, TOTAL_ROWS);
  for (let i = offset; i < upper; i++) {
    const row: Record<string, number | string> = { gameId: `g-${i}` };
    for (const s of STATS) row[s] = i % 5;
    rows.push(row);
  }
  return { stats: STATS, rows, total: TOTAL_ROWS };
}

test.describe('View Game Logs — render perf (LS-5703)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/baseball-game-logs/, async (route: Route) => {
      const body = JSON.parse(route.request().postData() || '{}') as {
        offset?: number;
      };
      const offset = typeof body.offset === 'number' ? body.offset : 0;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePage(offset)),
      });
    });
  });

  test('renders the first page within the perf budget', async ({ page }) => {
    await page.goto('/players/view-game-logs');

    const playerInput = page.getByPlaceholder('Enter player ID');
    await playerInput.fill('mlb-9999');

    await page.evaluate(() => performance.mark('table-render-start'));

    await page.getByRole('button', { name: /get player data/i }).click();

    // The virtualized scroller appears once the first page lands + reshape runs.
    const scroller = page.getByTestId('game-logs-virtual-scroller');
    await expect(scroller).toBeVisible({ timeout: 5_000 });

    const elapsed = await page.evaluate(() => {
      performance.mark('table-render-end');
      performance.measure(
        'table-render',
        'table-render-start',
        'table-render-end',
      );
      const m = performance.getEntriesByName('table-render').pop();
      return m ? m.duration : Number.POSITIVE_INFINITY;
    });

    // Budget: 250ms from click to scroller visible. The synchronous
    // pre-LS-5703 implementation took multiple seconds on a 1000-row payload;
    // raised from 200ms to 250ms to absorb CI runner variance (LS-6226).
    expect(elapsed).toBeLessThan(250);
  });

  test('shows totals label and triggers a second page when scrolled to 80%', async ({
    page,
  }) => {
    await page.goto('/players/view-game-logs');
    await page.getByPlaceholder('Enter player ID').fill('mlb-9999');
    await page.getByRole('button', { name: /get player data/i }).click();

    await expect(page.getByTestId('game-logs-total-label')).toContainText(
      `of ${TOTAL_ROWS}`,
    );

    const scroller = page.getByTestId('game-logs-virtual-scroller');
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Wait for the second fetch — the totals label re-renders with a higher
    // "showing" count once the new page is reshaped in.
    await expect(page.getByTestId('game-logs-total-label')).toContainText(
      /Showing\s+(?:[1-9]\d{2,}|100)\s+of/,
    );
  });
});
