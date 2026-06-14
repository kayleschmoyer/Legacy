/**
 * FootballPositionFilter — multi-select toggle group a11y & keyboard tests
 * (LS-6466, multi-select promoted in LS-6464)
 *
 * The position pill row on /football/players is a multi-select toggle-button
 * group: each pill is a `role=button` with `aria-pressed`, the container is a
 * `role=group`, and keyboard users get roving tabindex (arrow keys move focus)
 * with Space/Enter toggling the focused pill. "All" clears the selection.
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_URL = '/football/players';

// Selectable position pills, excluding the leading "All" pill.
const POSITIONS = [
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

const ALL_PILLS = ['All', ...POSITIONS] as const;

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

test.describe('FootballPositionFilter — toggle group ARIA @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('pill container has role=group with accessible label', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await expect(group).toBeVisible();
  });

  test('every pill is a role=button toggle', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await expect(group.getByRole('button')).toHaveCount(ALL_PILLS.length);
  });

  test('"All" pill is pressed and in tab order by default', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    const allPill = group.getByRole('button', { name: 'All' });
    await expect(allPill).toHaveAttribute('aria-pressed', 'true');
    await expect(allPill).toHaveAttribute('tabindex', '0');
  });

  test('position pills are unpressed and out of tab order by default', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    for (const pos of POSITIONS) {
      const pill = group.getByRole('button', { name: pos });
      await expect(pill).toHaveAttribute('aria-pressed', 'false');
      await expect(pill).toHaveAttribute('tabindex', '-1');
    }
  });
});

test.describe('FootballPositionFilter — multi-select @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('clicking a position selects it and deselects "All"', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await group.getByRole('button', { name: 'QB' }).click();

    await expect(group.getByRole('button', { name: 'QB' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(group.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('multiple positions can be selected at once (QB + RB)', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await group.getByRole('button', { name: 'QB' }).click();
    await group.getByRole('button', { name: 'RB' }).click();

    await expect(group.getByRole('button', { name: 'QB' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(group.getByRole('button', { name: 'RB' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(group.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('clicking a selected position toggles it back off', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    const qbPill = group.getByRole('button', { name: 'QB' });
    await qbPill.click();
    await expect(qbPill).toHaveAttribute('aria-pressed', 'true');
    await qbPill.click();
    await expect(qbPill).toHaveAttribute('aria-pressed', 'false');
  });

  test('"All" clears the current multi-selection', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await group.getByRole('button', { name: 'QB' }).click();
    await group.getByRole('button', { name: 'RB' }).click();
    await group.getByRole('button', { name: 'All' }).click();

    await expect(group.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const pos of POSITIONS) {
      await expect(group.getByRole('button', { name: pos })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
  });
});

test.describe('FootballPositionFilter — keyboard navigation @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('ArrowRight moves roving focus from All → QB', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    const allPill = group.getByRole('button', { name: 'All' });
    await allPill.focus();
    await page.keyboard.press('ArrowRight');

    const qbPill = group.getByRole('button', { name: 'QB' });
    await expect(qbPill).toHaveAttribute('tabindex', '0');
    await expect(qbPill).toBeFocused();
    await expect(allPill).toHaveAttribute('tabindex', '-1');
  });

  test('ArrowLeft wraps roving focus from All → DB (last item)', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    const allPill = group.getByRole('button', { name: 'All' });
    await allPill.focus();
    await page.keyboard.press('ArrowLeft');

    const dbPill = group.getByRole('button', { name: 'DB' });
    await expect(dbPill).toHaveAttribute('tabindex', '0');
    await expect(dbPill).toBeFocused();
  });

  test('Space toggles the focused pill without moving selection', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    const allPill = group.getByRole('button', { name: 'All' });
    await allPill.focus();
    await page.keyboard.press('ArrowRight'); // focus QB
    await page.keyboard.press(' '); // toggle QB on

    const qbPill = group.getByRole('button', { name: 'QB' });
    await expect(qbPill).toHaveAttribute('aria-pressed', 'true');
  });

  test('only the focused pill has tabindex=0 after keyboard navigation', async ({
    page,
  }) => {
    const group = page.getByRole('group', { name: 'Filter by position' });
    await group.getByRole('button', { name: 'All' }).focus();
    await page.keyboard.press('ArrowRight'); // QB
    await page.keyboard.press('ArrowRight'); // RB

    const rbPill = group.getByRole('button', { name: 'RB' });
    await expect(rbPill).toHaveAttribute('tabindex', '0');

    for (const label of ALL_PILLS.filter((p) => p !== 'RB')) {
      await expect(group.getByRole('button', { name: label })).toHaveAttribute(
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
