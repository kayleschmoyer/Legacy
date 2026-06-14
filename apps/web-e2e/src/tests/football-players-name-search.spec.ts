/**
 * NFL Player Name Search — hermetic E2E tests (LS-5442)
 *
 * Verifies the search input on /football/players filters the displayed player
 * list by forwarding a `search` variable to the `FootballPlayers` GraphQL query.
 *
 * Covered behaviours:
 *  - Initial load returns all players (no search variable sent)
 *  - Fewer than 2 characters → no `search` variable in the request
 *  - 2+ characters → `search` variable present; matching player rendered
 *  - Non-matching search → empty state ("No players found")
 *  - Multi-token search (first + last name) → correct player shown
 *  - Clearing via the "Clear search" button restores the full list
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_URL = '/football/players';

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

const ALL_PLAYERS = [MAHOMES, ALLEN] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simulate server-side name search: case-insensitive AND-token substring match. */
function filterBySearch(
  players: readonly (typeof MAHOMES | typeof ALLEN)[],
  search: string | undefined,
): (typeof MAHOMES | typeof ALLEN)[] {
  if (!search) return [...players];
  const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return players.filter((p) =>
    tokens.every(
      (t) =>
        p.firstName.toLowerCase().includes(t) ||
        p.lastName.toLowerCase().includes(t),
    ),
  );
}

function playersResponse(
  nodes: readonly (typeof MAHOMES | typeof ALLEN)[],
): object {
  return {
    data: {
      footballPlayers: {
        nodes: [...nodes],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

/**
 * Register a smart route that mirrors server-side search filtering so each test
 * gets realistic dynamic responses without a live backend.
 */
async function mockSearchableFootballPlayers(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    footballplayers: (route, { variables }) => {
      const search = variables.search as string | undefined;
      return fulfillJson(
        route,
        playersResponse(filterBySearch(ALL_PLAYERS, search)),
      );
    },
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

    // Any footballplayers request made while 'M' was the input must not carry a
    // search variable (the frontend gate is debouncedSearch.length >= 2).
    const footballRequests = requestBodies.filter((b) => {
      try {
        const parsed = JSON.parse(b) as { operationName?: string };
        return parsed.operationName?.toLowerCase() === 'footballplayers';
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
      page.getByText('Try adjusting your filters or search term.'),
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
