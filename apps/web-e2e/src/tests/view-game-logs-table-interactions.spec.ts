/**
 * LS-7462 — Playwright coverage for GameLogsTable sortable headers (LS-7457)
 * and the sticky header (LS-7458).
 *
 * Drives the routed View Game Logs page (LS-7864) — the component is mounted at
 * `/players/view-game-logs` — with a deterministic baseball-game-logs fixture.
 * The page is premium-gated (LS-5024); we pin the tier to premium so the table
 * renders and advanced-column affordances are available.
 *
 * The component fetches `/baseball-game-logs` over REST (not GraphQL), so we
 * intercept that endpoint with a 100-game fixture and exercise the sort cycle
 * and sticky-header behavior against the virtualized table body.
 *
 * Coverage:
 *   - Date header click → asc → desc → unsorted cycle, asserting aria-sort and
 *     that the first visible row actually re-orders.
 *   - Sticky header stays pinned to the top of the scroller while the body
 *     scrolls vertically (regression guard for LS-7458 `position: sticky`).
 */
import { type Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';
import { useTier } from '../fixtures/shared-mocks';

const PAGE_URL = '/players/view-game-logs';

/**
 * Paginated 100-game fixture in the `{ stats, rows, total }` shape. Dates are
 * intentionally non-monotonic so an ascending sort produces a different first
 * row than the API order — proving the click actually re-sorted.
 */
function makeFixture(): {
  stats: string[];
  rows: Array<Record<string, string | number | null>>;
  total: number;
} {
  const stats = ['Date', 'Opp', 'AB', 'H'];
  const order: number[] = [];
  for (let i = 0; i < 100; i++) order.push(i);
  // Deterministic shuffle (LCG, seed 7) so the fixture order is fixed but not
  // chronological.
  let s = 7;
  for (let i = order.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rows: Array<Record<string, string | number | null>> = [];
  for (let g = 0; g < 100; g++) {
    const idx = order[g];
    const month = String((idx % 6) + 4).padStart(2, '0');
    const day = String((idx % 28) + 1).padStart(2, '0');
    rows.push({
      gameId: `g-${g + 1}`,
      Date: `2026-${month}-${day}`,
      Opp: ['NYY', 'BOS', 'TB', 'TOR', 'BAL'][idx % 5],
      AB: (idx % 5) + 1,
      // Some null cells exercise the "missing sorts last" path harmlessly.
      H: idx % 7 === 0 ? null : idx % 4,
    });
  }
  return { stats, rows, total: rows.length };
}

/** Trimmed text of the first (Date) cell of the first rendered row. */
async function firstRowDate(page: Page): Promise<string> {
  const firstRow = page.locator('[data-testid^="game-logs-row-"]').first();
  await firstRow.waitFor();
  // Cells are direct child <div>s of the row; the first is the Date column.
  return (await firstRow.locator('div').first().innerText()).trim();
}

test.describe('View Game Logs table interactions @regression', () => {
  test.beforeEach(async ({ page }) => {
    await useTier(page, 'premium');
    await page.route(/baseball-game-logs/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeFixture()),
      });
    });
  });

  async function openTable(page: Page): Promise<void> {
    await page.goto(PAGE_URL);
    await page.getByPlaceholder('Enter player ID').fill('mlb-1234');
    await page.getByRole('button', { name: /get player data/i }).click();
    await expect(page.getByTestId('game-logs-virtual-scroller')).toBeVisible();
  }

  test('Date header click cycles asc → desc → unsorted', async ({ page }) => {
    await openTable(page);

    const header = page.getByTestId('game-logs-header-Date');
    const headerCell = page.getByTestId('game-logs-header-cell-Date');

    // First click: ascending.
    await header.click();
    await expect(headerCell).toHaveAttribute('aria-sort', 'ascending');
    const firstAsc = await firstRowDate(page);

    // Second click: descending — first row must flip to a later date.
    await header.click();
    await expect(headerCell).toHaveAttribute('aria-sort', 'descending');
    const firstDesc = await firstRowDate(page);
    expect(firstDesc.localeCompare(firstAsc)).toBeGreaterThan(0);

    // Third click: back to unsorted.
    await header.click();
    await expect(headerCell).toHaveAttribute('aria-sort', 'none');
  });

  test('sticky header stays pinned while scrolling the table vertically', async ({
    page,
  }) => {
    await openTable(page);

    const headerCell = page.getByTestId('game-logs-header-cell-Date');
    const before = await headerCell.boundingBox();

    // Scroll the virtualized body to the bottom.
    const scroller = page.getByTestId('game-logs-virtual-scroller');
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    const after = await headerCell.boundingBox();
    // `position: sticky; top: 0` pins the header at the top of the scroller, so
    // its viewport y must not drift as rows scroll underneath it.
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after?.y ?? 0).toBeCloseTo(before?.y ?? 0, 0);
  });
});
