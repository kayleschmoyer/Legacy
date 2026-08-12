/**
 * Football Availability / Free Agent Filter — E2E tests (LS-5602)
 *
 * Verifies that the availability filter on /players?sport=nfl correctly toggles
 * the player list between all players and free agents only:
 *
 *   - Initial load: both rostered and free-agent players are visible
 *   - Selecting "Free Agents" sends freeAgent:true and shows only free agents
 *   - Resetting to "All Teams" restores the full player pool
 *
 * The availability filter is the team-filter select's "FREE_AGENT" sentinel
 * option: selecting it sets freeAgent:true on the players query and omits
 * nflTeam (see buildFootballQueryVars in footballStatsHelpers.ts).
 *
 * Interaction strategy: the canonical surface renders a native <select> with
 * name="team-filter" (footballStatsConfig.tsx). Tests target it via
 * selectOption() with force:true.
 *
 * All GraphQL responses are mocked via route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

const PAGE_URL = '/players?sport=nfl';

// ── Mock player fixtures ──────────────────────────────────────────────────────

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

/** Unrostered player with no NFL team affiliation (free agent). */
const SPILLER = {
  __typename: 'FootballPlayer',
  id: 2,
  firstName: 'Jordan',
  lastName: 'Spiller',
  position: 'WR',
  isDst: false,
  nflTeam: null,
  pfrId: 'SpilJo00',
  headshotUrl: null,
  previousTeams: [],
  careerStats: null,
} as const;

const ALL_PLAYERS = [MAHOMES, SPILLER] as const;
const FREE_AGENTS_ONLY = [SPILLER] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function playersResponse(
  nodes: readonly (typeof MAHOMES | typeof SPILLER)[],
): object {
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

function nativeSelect(page: import('@playwright/test').Page) {
  return page.locator('select[name="team-filter"]');
}

/**
 * Smart route that mirrors server-side free-agent filtering:
 * freeAgent:true in variables → return only SPILLER; otherwise return all.
 * Registered for both the FootballPlayers list operation (card feed) and the
 * FootballPlayerStatsGrid operation the desktop grid fires (LS-9366) — both
 * send the same freeAgent variable and read the same connection shape.
 */
async function mockAvailabilityFilter(
  page: import('@playwright/test').Page,
): Promise<void> {
  const byAvailability = (
    route: import('@playwright/test').Route,
    variables: Record<string, unknown>,
  ) => {
    const nodes = variables.freeAgent === true ? FREE_AGENTS_ONLY : ALL_PLAYERS;
    return fulfillJson(route, playersResponse(nodes));
  };
  await createGraphQLRouter(page, {
    footballplayers: (route, { variables }) => byAvailability(route, variables),
    footballplayerstatsgrid: (route, { variables }) =>
      byAvailability(route, variables),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Football availability / free-agent filter (LS-5602) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilityFilter(page);
    await page.goto(PAGE_URL);
  });

  test('initial load shows all players (rostered and free agents)', async ({
    page,
  }) => {
    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Jordan Spiller')).toBeVisible();
  });

  test('toggling free-agent filter reduces the list to unrostered players', async ({
    page,
  }) => {
    await expect(page.getByText('Patrick Mahomes')).toBeVisible();

    await nativeSelect(page).selectOption('FREE_AGENT', { force: true });

    await expect(page.getByText('Jordan Spiller')).toBeVisible();
    await expect(page.getByText('Patrick Mahomes')).not.toBeVisible();
  });

  test('resetting to All Teams restores the full player pool', async ({
    page,
  }) => {
    // Apply the free-agent filter first.
    await nativeSelect(page).selectOption('FREE_AGENT', { force: true });
    await expect(page.getByText('Patrick Mahomes')).not.toBeVisible();

    // Reset to "All Teams".
    await nativeSelect(page).selectOption('All', { force: true });

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Jordan Spiller')).toBeVisible();
  });

  test('filter control shows "Free Agents" when filter is active', async ({
    page,
  }) => {
    // The canonical /players surface renders a real native <select> whose
    // selected option is the visible label (no separate trigger element).
    await nativeSelect(page).selectOption('FREE_AGENT', { force: true });
    await expect(nativeSelect(page).locator('option:checked')).toHaveText(
      'Free Agents',
    );
  });

  test('filter control resets to "All Teams" when filter is cleared', async ({
    page,
  }) => {
    await nativeSelect(page).selectOption('FREE_AGENT', { force: true });
    await nativeSelect(page).selectOption('All', { force: true });
    await expect(nativeSelect(page).locator('option:checked')).toHaveText(
      'All Teams',
    );
  });
});
