/**
 * Players Page — Player Name Search E2E tests (LS-5603)
 *
 * Verifies the search input on /players narrows the player grid to matching
 * players using client-side substring filtering (PlayersGrid.filteredPlayers).
 *
 * Covered behaviours:
 *  - Initial load shows all mocked players in the grid
 *  - Typing a surname narrows visible grid rows to matches only (AC1)
 *  - Non-matching search yields the grid empty state (AC2)
 *  - Clearing the active filter chip via ActiveSummary restores the full list
 *
 * FeaturedSpotlight (rendered by PlayersScreen above the grid) always shows the
 * first peek-query result; grid assertions are scoped to `.pg-root` so the
 * spotlight's player name doesn't interfere with `.not.toBeVisible()` checks.
 *
 * All GraphQL responses are mocked with route.fulfill() per hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_URL = '/players';

// ── Mock player fixtures ──────────────────────────────────────────────────────

const JUDGE = {
  __typename: 'Player',
  id: 1,
  firstName: 'Aaron',
  lastName: 'Judge',
  brefId: 'judgeaa01',
  statsLastFetchedAt: null,
  careerBatting: null,
} as const;

const OHTANI = {
  __typename: 'Player',
  id: 2,
  firstName: 'Shohei',
  lastName: 'Ohtani',
  brefId: 'ohtansh01',
  statsLastFetchedAt: null,
  careerBatting: null,
} as const;

const BETTS = {
  __typename: 'Player',
  id: 3,
  firstName: 'Mookie',
  lastName: 'Betts',
  brefId: 'bettsmo01',
  statsLastFetchedAt: null,
  careerBatting: null,
} as const;

const ALL_PLAYERS = [JUDGE, OHTANI, BETTS] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mockAllPlayers(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    // Both the PlayersScreen peek query (limit: 1) and the PlayersGrid main
    // query (limit: 50) use the GetAllPlayers operation. Returning the full
    // fixture for both keeps peekPlayerCount > 0 so the screen never enters
    // its own EmptyState card — client-side grid filtering drives empty state.
    getallplayers: (route) =>
      fulfillJson(route, { data: { players: [...ALL_PLAYERS] } }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Players page — name search @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('initial load shows all players in the grid when no search is active', async ({
    page,
  }) => {
    const grid = page.locator('.pg-root');
    await expect(grid.getByText('Aaron Judge')).toBeVisible();
    await expect(grid.getByText('Shohei Ohtani')).toBeVisible();
    await expect(grid.getByText('Mookie Betts')).toBeVisible();
  });

  test('typing a surname narrows the grid to matching players only (AC1)', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Judge');

    // PlayersGrid.filteredPlayers recomputes synchronously; Playwright
    // auto-waits for the DOM update within the default assertion timeout.
    const grid = page.locator('.pg-root');
    await expect(grid.getByText('Aaron Judge')).toBeVisible();
    await expect(grid.getByText('Shohei Ohtani')).not.toBeVisible();
    await expect(grid.getByText('Mookie Betts')).not.toBeVisible();
  });

  test('non-matching search shows the grid empty state (AC2)', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('ZzzNonexistent');

    await expect(
      page.getByText('No players found matching your search.'),
    ).toBeVisible();
  });

  test('clearing the active filter chip restores the full player list', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Judge');

    const grid = page.locator('.pg-root');
    await expect(grid.getByText('Aaron Judge')).toBeVisible();
    await expect(grid.getByText('Shohei Ohtani')).not.toBeVisible();

    // ActiveSummary renders a × button whose aria-label quotes the search term.
    await page.getByRole('button', { name: /clear "judge" filter/i }).click();

    await expect(grid.getByText('Aaron Judge')).toBeVisible();
    await expect(grid.getByText('Shohei Ohtani')).toBeVisible();
    await expect(grid.getByText('Mookie Betts')).toBeVisible();
  });
});
