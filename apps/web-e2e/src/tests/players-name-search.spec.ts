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
    // LS-9073: the cards view (PlayersGrid's default view, which this spec
    // exercises) now sources from GetCareerBattingStats instead of
    // GetAllPlayers, and sends `searchTerm` as a server-side query variable
    // rather than filtering client-side. Mirror that by filtering the
    // fixture on `variables.searchTerm` the same way the real resolver does.
    getcareerbattingstats: (route, request) => {
      const searchTerm = (
        (request.variables.searchTerm as string | undefined) ?? ''
      )
        .trim()
        .toLowerCase();
      const matching = searchTerm
        ? ALL_PLAYERS.filter((player) =>
            `${player.firstName} ${player.lastName}`
              .toLowerCase()
              .includes(searchTerm),
          )
        : ALL_PLAYERS;

      return fulfillJson(route, {
        data: {
          careerBattingStats: {
            __typename: 'CareerBattingConnection',
            totalCount: matching.length,
            edges: matching.map((player) => ({
              __typename: 'CareerBattingEdge',
              node: {
                __typename: 'CareerBatting',
                playerId: player.id,
                primaryPosition: 'UT',
                positionsPlayed: JSON.stringify({ UT: { games: 0 } }),
                games: 0,
                plateAppearances: 0,
                atBats: 0,
                runs: 0,
                hits: 0,
                doubles: 0,
                triples: 0,
                homeRuns: 0,
                rbi: 0,
                stolenBases: 0,
                caughtStealing: 0,
                baseOnBalls: 0,
                strikeouts: 0,
                totalBases: 0,
                groundedIntoDoublePlays: 0,
                hitByPitch: 0,
                sacrificeHits: 0,
                intentionalBaseOnBalls: 0,
                battingAverage: 0,
                onBasePercentage: 0,
                sluggingPercentage: 0,
                offensiveWAR: 0,
                player: {
                  __typename: 'Player',
                  id: player.id,
                  firstName: player.firstName,
                  lastName: player.lastName,
                  brefId: player.brefId,
                },
              },
            })),
            pageInfo: {
              __typename: 'PageInfo',
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: null,
              endCursor: null,
            },
          },
        },
      });
    },
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
