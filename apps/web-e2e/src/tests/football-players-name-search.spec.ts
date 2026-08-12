/**
 * NFL Player Name Search — hermetic E2E tests (LS-5442, LS-7049, LS-7641)
 *
 * Verifies the search input on /players?sport=nfl filters the displayed player
 * list by forwarding a `search` variable to the `FootballPlayers` GraphQL query.
 *
 * Covered behaviours:
 *  - Initial load returns all players (no search variable sent)
 *  - Fewer than 2 characters → no `search` variable in the request
 *  - 2+ characters → `search` variable present; matching player rendered
 *  - Non-matching search → empty state ("No players found")
 *  - Multi-token search (first + last name) → correct player shown
 *  - Clearing via the "Clear search" button restores the full list
 *  - Accent-insensitive search: unaccented input matches accented names (LS-7049)
 *  - Accent-insensitive search: accented input matches accented stored names
 *  - Debounce window: search query does not fire during the 300 ms window (LS-7641)
 *  - Cursor reset: changing the search term resets the grid pager to page one (LS-7641)
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_URL = '/players?sport=nfl';

// ── Mock player fixtures ───────────────────────────────────────────────────────

const MAHOMES = {
  __typename: 'FootballPlayer',
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  pfrId: 'MahoPa00',
  headshotUrl: null,
  previousTeams: [],
  careerStats: null,
} as const;

const ALLEN = {
  __typename: 'FootballPlayer',
  id: 2,
  firstName: 'Josh',
  lastName: 'Allen',
  position: 'QB',
  isDst: false,
  nflTeam: 'BUF',
  pfrId: 'AlleJo02',
  headshotUrl: null,
  previousTeams: [],
  careerStats: null,
} as const;

// Player with accented name to verify diacritic-insensitive search (LS-7049).
const PENA = {
  __typename: 'FootballPlayer',
  id: 3,
  firstName: 'José',
  lastName: 'Peña',
  position: 'RB',
  isDst: false,
  nflTeam: 'MIA',
  pfrId: 'PenaJo00',
  headshotUrl: null,
  previousTeams: [],
  careerStats: null,
} as const;

const ALL_PLAYERS = [MAHOMES, ALLEN] as const;
const ALL_PLAYERS_WITH_ACCENTED = [MAHOMES, ALLEN, PENA] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip diacritics to simulate Postgres unaccent() — e.g. 'José' → 'jose'. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Simulate server-side name search: case- and accent-insensitive AND-token
 * substring match (mirrors the unaccent(col) ILIKE unaccent(term) logic in
 * the footballPlayers resolver — LS-7049).
 */
function filterBySearch<T extends { firstName: string; lastName: string }>(
  players: readonly T[],
  search: string | undefined,
): T[] {
  if (!search) return [...players];
  const tokens = search.trim().split(/\s+/).filter(Boolean).map(stripAccents);
  return players.filter((p) =>
    tokens.every(
      (t) =>
        stripAccents(p.firstName).includes(t) ||
        stripAccents(p.lastName).includes(t),
    ),
  );
}

function playersResponse<T>(nodes: readonly T[]): object {
  return {
    data: {
      footballPlayers: {
        nodes: [...nodes],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: nodes.length,
      },
    },
  };
}

/**
 * The two players-surface operations that carry the `search` variable: the
 * FootballPlayers list operation (narrow-viewport card feed) and the
 * FootballPlayerStatsGrid operation the desktop grid fires (LS-9366). Both
 * read the same footballPlayers connection, so one handler serves both.
 */
const PLAYER_SEARCH_OPS = ['footballplayers', 'footballplayerstatsgrid'];

/**
 * Register a smart route that mirrors server-side search filtering so each test
 * gets realistic dynamic responses without a live backend.
 */
async function mockSearchableFootballPlayers(
  page: import('@playwright/test').Page,
): Promise<void> {
  const bySearch = (
    route: import('@playwright/test').Route,
    variables: Record<string, unknown>,
  ) => {
    const search = variables.search as string | undefined;
    return fulfillJson(
      route,
      playersResponse(filterBySearch(ALL_PLAYERS, search)),
    );
  };
  await createGraphQLRouter(page, {
    footballplayers: (route, { variables }) => bySearch(route, variables),
    footballplayerstatsgrid: (route, { variables }) =>
      bySearch(route, variables),
  });
}

/**
 * Same as above but the player pool includes the accented-name fixture (PENA)
 * so diacritic-insensitive search tests can verify the full round-trip.
 */
async function mockSearchableFootballPlayersWithAccents(
  page: import('@playwright/test').Page,
): Promise<void> {
  const bySearch = (
    route: import('@playwright/test').Route,
    variables: Record<string, unknown>,
  ) => {
    const search = variables.search as string | undefined;
    return fulfillJson(
      route,
      playersResponse(filterBySearch(ALL_PLAYERS_WITH_ACCENTED, search)),
    );
  };
  await createGraphQLRouter(page, {
    footballplayers: (route, { variables }) => bySearch(route, variables),
    footballplayerstatsgrid: (route, { variables }) =>
      bySearch(route, variables),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('NFL player name search @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockSearchableFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('initial load shows all players when no search is active', async ({
    page,
  }) => {
    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Josh Allen')).toBeVisible();
  });

  test('typing fewer than 2 characters does not send a search variable', async ({
    page,
  }) => {
    // Capture requests to verify the search variable is absent for <2 chars.
    const requestBodies: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/graphql') && req.method() === 'POST') {
        requestBodies.push(req.postData() ?? '');
      }
    });

    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('M');

    // Wait long enough for the 300 ms debounce to fire if it were going to.
    await page.waitForTimeout(450);

    // Any players-surface request made while 'M' was the input must not carry a
    // search variable (the frontend gate is debouncedSearch.length >= 2).
    const footballRequests = requestBodies.filter((b) => {
      try {
        const parsed = JSON.parse(b) as { operationName?: string };
        return PLAYER_SEARCH_OPS.includes(
          parsed.operationName?.toLowerCase() ?? '',
        );
      } catch {
        return false;
      }
    });

    for (const body of footballRequests) {
      const parsed = JSON.parse(body) as {
        variables?: { search?: string };
      };
      expect(parsed.variables?.search).toBeUndefined();
    }
  });

  test('typing 2+ characters sends the search variable and shows matching players', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Mahomes');

    // The debounced request fires after 300 ms; Playwright auto-waits for
    // the DOM to reflect the filtered result within the default 5 s timeout.
    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Josh Allen')).not.toBeVisible();
  });

  test('non-matching search shows the no-results empty state', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Zzznonexistent');

    await expect(page.getByText('No players found')).toBeVisible();
    await expect(
      page.getByText('No players match the current filters', { exact: false }),
    ).toBeVisible();
  });

  test('multi-token search (first + last name) returns the correct player', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Patrick Mahomes');

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Josh Allen')).not.toBeVisible();
  });

  test('clearing search via clear button restores all players', async ({
    page,
  }) => {
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Mahomes');

    // Verify filtered state first.
    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Josh Allen')).not.toBeVisible();

    // Clear the search.
    const clear = page.getByRole('button', { name: 'Clear search' });
    await clear.click();

    // All players should be visible again.
    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Josh Allen')).toBeVisible();
  });
});

// ── Debounce window and cursor-reset interaction (LS-7641) ───────────────────

test.describe('NFL player name search — debounce and cursor-reset (LS-7641) @regression', () => {
  test('search query does not fire during the 300ms debounce window', async ({
    page,
  }) => {
    await mockSearchableFootballPlayers(page);
    await page.goto(PAGE_URL);

    const searchVariables: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/graphql') && req.method() === 'POST') {
        try {
          const parsed = JSON.parse(req.postData() ?? '') as {
            operationName?: string;
            variables?: { search?: string };
          };
          if (
            PLAYER_SEARCH_OPS.includes(
              parsed.operationName?.toLowerCase() ?? '',
            ) &&
            parsed.variables?.search
          ) {
            searchVariables.push(parsed.variables.search);
          }
        } catch {
          // ignore non-JSON bodies
        }
      }
    });

    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Ma');

    // 150 ms in — within the 300 ms debounce window; no search request yet.
    await page.waitForTimeout(150);
    expect(searchVariables).toHaveLength(0);

    // After the full debounce window; the search request should now have fired.
    await page.waitForTimeout(250);
    expect(searchVariables).toHaveLength(1);
    expect(searchVariables[0]).toBe('Ma');
  });

  test('changing the search term resets the pagination cursor and discards the current page', async ({
    page,
  }) => {
    // Paginated grid mock (LS-9366 — the desktop grid pages with a numbered
    // pager over an offset cursor: page 2 requests after: '25' at the default
    // page size of 25). Unsearched pool: 26 players → 2 pages, page 1 =
    // Mahomes, page 2 = Allen. Searching returns a filtered single page.
    const paginated = (
      route: import('@playwright/test').Route,
      variables: Record<string, unknown>,
    ) => {
      const { search, after } = variables as {
        search?: string;
        after?: string;
      };
      if (search) {
        return fulfillJson(
          route,
          playersResponse(filterBySearch(ALL_PLAYERS, search)),
        );
      }
      if (!after) {
        return fulfillJson(route, {
          data: {
            footballPlayers: {
              nodes: [MAHOMES],
              pageInfo: { hasNextPage: true, endCursor: '25' },
              totalCount: 26,
            },
          },
        });
      }
      return fulfillJson(route, {
        data: {
          footballPlayers: {
            nodes: [ALLEN],
            pageInfo: { hasNextPage: false, endCursor: null },
            totalCount: 26,
          },
        },
      });
    };
    await createGraphQLRouter(page, {
      footballplayers: (route, { variables }) => paginated(route, variables),
      footballplayerstatsgrid: (route, { variables }) =>
        paginated(route, variables),
    });
    await page.goto(PAGE_URL);

    // Page 1: Mahomes is visible and the pager reports two pages.
    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Page 1 of 2')).toBeVisible();

    // Go to page 2: the grid replaces the page with Allen's row.
    await page.getByRole('button', { name: 'Next →' }).click();
    await expect(page.getByText('Josh Allen')).toBeVisible();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();

    // Type a search term — the 300 ms debounce fires, the committed filters
    // change, and the grid's resetKey snaps pagination back to page one with
    // an undefined cursor (the offset cursor is only valid for the result set
    // that produced it).
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Mahomes');

    // After the debounce window: only Mahomes from the fresh filtered page 1
    // is visible; Allen (from the now-discarded page 2) is gone, and the
    // filtered single-page result collapses the pager to one page.
    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Josh Allen')).not.toBeVisible();
    await expect(page.getByText('Page 1 of 1')).toBeVisible();
  });
});

// ── Diacritic / accent-insensitive search (LS-7049 / PLL-013) ────────────────

test.describe('NFL player name search — accent-insensitive (LS-7049) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockSearchableFootballPlayersWithAccents(page);
    await page.goto(PAGE_URL);
  });

  test('unaccented input matches a player with an accented last name', async ({
    page,
  }) => {
    // The mock simulates server-side unaccent(): 'Pena' should match 'Peña'.
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Pena');

    await expect(page.getByText('José Peña')).toBeVisible();
    await expect(page.getByText('Patrick Mahomes')).not.toBeVisible();
    await expect(page.getByText('Josh Allen')).not.toBeVisible();
  });

  test('unaccented input matches a player with an accented first name', async ({
    page,
  }) => {
    // 'Jose' should match 'José'.
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Jose');

    await expect(page.getByText('José Peña')).toBeVisible();
    await expect(page.getByText('Patrick Mahomes')).not.toBeVisible();
  });

  test('accented input matches a player stored with accented characters', async ({
    page,
  }) => {
    // Typing the exact accented name should also work.
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Peña');

    await expect(page.getByText('José Peña')).toBeVisible();
  });

  test('accented input does not accidentally match unaccented names', async ({
    page,
  }) => {
    // 'Peña' must not surface Mahomes or Allen — guards the complementary direction.
    const search = page.getByRole('textbox', { name: 'Search players' });
    await search.fill('Peña');

    await expect(page.getByText('Patrick Mahomes')).not.toBeVisible();
    await expect(page.getByText('Josh Allen')).not.toBeVisible();
  });
});
