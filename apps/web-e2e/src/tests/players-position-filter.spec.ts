/**
 * Players Position Filter — hermetic E2E tests (LS-5605)
 *
 * Verifies the position filter rail on /players (baseball):
 *
 *   AC1 — Position filter pills render: All, P, C, IF, OF, DH
 *   AC2 — Selecting a position pill marks it aria-pressed=true and deselects "All"
 *   AC3 — An active filter chip appears in the active-summary row
 *   AC4 — Clearing via the chip ×-button restores "All" as the active pill
 *   AC5 — "Clear all" also resets the position filter
 *
 * Note: the position filter is a UI-state scaffold — it captures the
 * selection and renders the active-summary chip, but does not currently
 * pass the position variable to the underlying GetAllPlayers query. Tests
 * verify what is implemented: pill selection state + chip lifecycle.
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_URL = '/players';

// ── Position options from PlayersScreen POSITIONS constant ────────────────────

const POSITION_LABELS = ['P', 'C', 'IF', 'OF', 'DH'] as const;

// ── Mock player fixtures ───────────────────────────────────────────────────────

const RUTH = {
  __typename: 'Player',
  id: 1,
  firstName: 'Babe',
  lastName: 'Ruth',
  brefId: 'ruthba01',
  statsLastFetchedAt: null,
  careerBatting: {
    battingAverage: 0.342,
    homeRuns: 714,
    runs: 2174,
    rbi: 2214,
    stolenBases: 123,
  },
} as const;

const JOHNSON = {
  __typename: 'Player',
  id: 2,
  firstName: 'Walter',
  lastName: 'Johnson',
  brefId: 'johnswa01',
  statsLastFetchedAt: null,
  careerBatting: null,
} as const;

const ALL_PLAYERS = [RUTH, JOHNSON] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function playersResponse(nodes: readonly unknown[]): object {
  return { data: { players: [...nodes] } };
}

async function mockPlayersPage(
  page: import('@playwright/test').Page,
  players: readonly unknown[] = ALL_PLAYERS,
): Promise<void> {
  await createGraphQLRouter(page, {
    getallplayers: (route) => fulfillJson(route, playersResponse(players)),
  });
}

// ── Tests: AC1 — Position pill rendering ──────────────────────────────────────

test.describe('PlayersPositionFilter — pill rendering (AC1) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersPage(page);
    await page.goto(PAGE_URL);
  });

  test('position filter group is visible', async ({ page }) => {
    const rail = page.getByRole('group', {
      name: 'Filter players by era, position, or status',
    });
    await expect(rail).toBeVisible();
  });

  test('"All" pill is present and active by default', async ({ page }) => {
    const allPill = page.getByRole('button', { name: 'All', exact: true });
    await expect(allPill).toHaveAttribute('aria-pressed', 'true');
  });

  test('all position pills are rendered', async ({ page }) => {
    for (const label of POSITION_LABELS) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toBeVisible();
    }
  });

  test('position pills are inactive by default', async ({ page }) => {
    for (const label of POSITION_LABELS) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

// ── Tests: AC2 — Pill selection ───────────────────────────────────────────────

test.describe('PlayersPositionFilter — pill selection (AC2) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersPage(page);
    await page.goto(PAGE_URL);
  });

  test('clicking "OF" marks it active and deselects "All"', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'OF', exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'OF', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'All', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('other position pills remain inactive when "OF" is selected', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'OF', exact: true }).click();

    for (const label of POSITION_LABELS.filter((p) => p !== 'OF')) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('clicking "P" marks it active', async ({ page }) => {
    await page.getByRole('button', { name: 'P', exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'P', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'All', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});

// ── Tests: AC3 — Active filter chip ───────────────────────────────────────────

test.describe('PlayersPositionFilter — active filter chip (AC3) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersPage(page);
    await page.goto(PAGE_URL);
  });

  test('no active filter chips are shown by default', async ({ page }) => {
    const status = page.getByRole('status', { name: 'Active filters' });
    await expect(status).toHaveCount(0);
  });

  test('selecting "OF" shows an "OF" filter chip in the active summary', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'OF', exact: true }).click();

    const status = page.getByRole('status', { name: 'Active filters' });
    await expect(status).toBeVisible();
    await expect(status).toContainText('OF');
  });

  test('chip has a labelled clear button', async ({ page }) => {
    await page.getByRole('button', { name: 'OF', exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'Clear OF filter' }),
    ).toBeVisible();
  });
});

// ── Tests: AC4 — Clear via chip ×-button ─────────────────────────────────────

test.describe('PlayersPositionFilter — clear via chip (AC4) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersPage(page);
    await page.goto(PAGE_URL);
  });

  test('clicking "Clear OF filter" removes the chip and restores "All"', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'OF', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'OF', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Clear OF filter' }).click();

    // Chip is gone
    await expect(
      page.getByRole('button', { name: 'Clear OF filter' }),
    ).toHaveCount(0);
    // "All" is active again
    await expect(
      page.getByRole('button', { name: 'All', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    // "OF" is back to inactive
    await expect(
      page.getByRole('button', { name: 'OF', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});

// ── Tests: AC5 — Clear all ────────────────────────────────────────────────────

test.describe('PlayersPositionFilter — clear all (AC5) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockPlayersPage(page);
    await page.goto(PAGE_URL);
  });

  test('"Clear all" resets the position filter to "All"', async ({ page }) => {
    await page.getByRole('button', { name: 'P', exact: true }).click();
    await expect(
      page.getByRole('status', { name: 'Active filters' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Clear all' }).click();

    await expect(
      page.getByRole('status', { name: 'Active filters' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'All', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'P', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});

// ── Tests: Empty state when filter is active ───────────────────────────────────

test.describe('PlayersPositionFilter — empty state with active filter @regression', () => {
  test('shows "Nothing to show" state when position is selected and no players match', async ({
    page,
  }) => {
    // Seed with an empty players list — the peek query returns 0 players
    await mockPlayersPage(page, []);
    await page.goto(PAGE_URL);

    await page.getByRole('button', { name: 'OF', exact: true }).click();

    await expect(
      page.getByText('Nothing to show with those filters'),
    ).toBeVisible();
  });

  test('"Clear all filters" in empty state resets the filter', async ({
    page,
  }) => {
    await mockPlayersPage(page, []);
    await page.goto(PAGE_URL);

    await page.getByRole('button', { name: 'OF', exact: true }).click();
    await expect(
      page.getByText('Nothing to show with those filters'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Clear all filters' }).click();

    // After clearing, "All" should be active and no empty state
    await expect(
      page.getByRole('button', { name: 'All', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByText('Nothing to show with those filters'),
    ).not.toBeVisible();
  });
});
