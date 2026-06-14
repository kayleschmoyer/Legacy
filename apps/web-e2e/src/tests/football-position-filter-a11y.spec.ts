/**
 * FootballPositionFilter — ARIA radiogroup & keyboard navigation E2E tests
 * (LS-6466)
 *
 * Verifies that the position pill row on /football/players exposes the correct
 * ARIA radiogroup pattern and supports full keyboard navigation (roving
 * tabindex, arrow keys).
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_URL = '/football/players';

const POSITIONS = [
  'All',
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
  'DL',
  'LB',
  'DB',
] as const;

// ── Minimal mock data ────────────────────────────────────────────────────────

const EMPTY_PLAYERS_RESPONSE = {
  data: {
    footballPlayers: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

async function mockFootballPlayers(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'footballplayers') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PLAYERS_RESPONSE),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      }
    },
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('FootballPositionFilter — ARIA radiogroup @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('pill container has role=radiogroup with accessible label', async ({
    page,
  }) => {
    const group = page.getByRole('radiogroup', { name: 'Filter by position' });
    await expect(group).toBeVisible();
  });

  test('all position pills are role=radio', async ({ page }) => {
    const radios = page.getByRole('radio');
    await expect(radios).toHaveCount(POSITIONS.length);
  });

  test('"All" pill is checked and in tab order by default', async ({
    page,
  }) => {
    const allPill = page.getByRole('radio', { name: 'All' });
    await expect(allPill).toHaveAttribute('aria-checked', 'true');
    await expect(allPill).toHaveAttribute('tabindex', '0');
  });

  test('non-active pills have aria-checked=false and tabindex=-1', async ({
    page,
  }) => {
    for (const pos of POSITIONS.slice(1)) {
      const pill = page.getByRole('radio', { name: pos });
      await expect(pill).toHaveAttribute('aria-checked', 'false');
      await expect(pill).toHaveAttribute('tabindex', '-1');
    }
  });
});

test.describe('FootballPositionFilter — keyboard navigation @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('ArrowRight moves selection from All → QB', async ({ page }) => {
    const allPill = page.getByRole('radio', { name: 'All' });
    await allPill.focus();
    await page.keyboard.press('ArrowRight');

    const qbPill = page.getByRole('radio', { name: 'QB' });
    await expect(qbPill).toHaveAttribute('aria-checked', 'true');
    await expect(qbPill).toHaveAttribute('tabindex', '0');
    await expect(allPill).toHaveAttribute('aria-checked', 'false');
  });

  test('ArrowLeft wraps from All → DB (last item)', async ({ page }) => {
    const allPill = page.getByRole('radio', { name: 'All' });
    await allPill.focus();
    await page.keyboard.press('ArrowLeft');

    const dbPill = page.getByRole('radio', { name: 'DB' });
    await expect(dbPill).toHaveAttribute('aria-checked', 'true');
    await expect(allPill).toHaveAttribute('aria-checked', 'false');
  });

  test('ArrowDown moves selection forward', async ({ page }) => {
    const allPill = page.getByRole('radio', { name: 'All' });
    await allPill.focus();
    await page.keyboard.press('ArrowDown');

    const qbPill = page.getByRole('radio', { name: 'QB' });
    await expect(qbPill).toHaveAttribute('aria-checked', 'true');
  });

  test('ArrowRight wraps from DB → All', async ({ page }) => {
    // Navigate to DB first via click
    await page.getByRole('radio', { name: 'DB' }).click();
    const dbPill = page.getByRole('radio', { name: 'DB' });
    await dbPill.focus();
    await page.keyboard.press('ArrowRight');

    const allPill = page.getByRole('radio', { name: 'All' });
    await expect(allPill).toHaveAttribute('aria-checked', 'true');
  });

  test('only selected pill has tabindex=0 after keyboard navigation', async ({
    page,
  }) => {
    const allPill = page.getByRole('radio', { name: 'All' });
    await allPill.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    // Should now be on RB (index 2)
    const rbPill = page.getByRole('radio', { name: 'RB' });
    await expect(rbPill).toHaveAttribute('tabindex', '0');

    // All others should be -1
    for (const pos of POSITIONS.filter((p) => p !== 'RB')) {
      await expect(page.getByRole('radio', { name: pos })).toHaveAttribute(
        'tabindex',
        '-1',
      );
    }
  });
});

test.describe('Football players search — clear button & a11y @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('search input exposes an accessible name (LS-6488)', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await expect(search).toBeVisible();
  });

  test('clear button is hidden while the search input is empty (LS-6487)', async ({
    page,
  }) => {
    await expect(
      page.getByRole('button', { name: 'Clear search' }),
    ).toHaveCount(0);
  });

  test('clear button appears once text is entered and clears it on click (LS-6487)', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('mahomes');

    const clear = page.getByRole('button', { name: 'Clear search' });
    await expect(clear).toBeVisible();

    await clear.click();
    await expect(search).toHaveValue('');
    await expect(clear).toHaveCount(0);
  });

  test('clear button is keyboard operable (LS-6487)', async ({ page }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('allen');

    const clear = page.getByRole('button', { name: 'Clear search' });
    await clear.focus();
    await page.keyboard.press('Enter');

    await expect(search).toHaveValue('');
    await expect(clear).toHaveCount(0);
  });
});
