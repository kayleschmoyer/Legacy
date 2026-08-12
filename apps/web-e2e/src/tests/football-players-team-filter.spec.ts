/**
 * Football Players — Team Filter row filtering E2E tests (LS-5607)
 *
 * Verifies that the team filter on /players?sport=nfl:
 *   1. Is present on the page with an "All Teams" default
 *   2. Sends nflTeam: "<abbrev>" in the GraphQL request when a team is selected
 *   3. Renders only rows belonging to that team
 *   4. Updates the dropdown trigger label to the team's full name
 *   5. Restores the full list and sends no nflTeam variable when "All Teams" is
 *      reselected
 *
 * Interaction strategy: Tamagui's Select renders a hidden native <select>
 * (select[name="team-filter"]) alongside the visible trigger. Tests target that
 * element via Playwright's selectOption() with force:true to bypass the
 * opacity:0 / pointer-events:none styles, mirroring the approach in
 * football-team-filter.spec.ts (LS-6493 / LS-6494).
 *
 * All GraphQL responses are mocked via route.fulfill() — route.continue() is
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

type MockPlayer = typeof MAHOMES | typeof ALLEN;

const ALL_PLAYERS: readonly MockPlayer[] = [MAHOMES, ALLEN];

// ── Helpers ───────────────────────────────────────────────────────────────────

function playersResponse(nodes: readonly MockPlayer[]): object {
  return {
    data: {
      footballPlayers: {
        nodes: [...nodes],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

function filterByTeam(
  players: readonly MockPlayer[],
  nflTeam: string | undefined,
): MockPlayer[] {
  if (!nflTeam) return [...players];
  return players.filter((p) => p.nflTeam === nflTeam);
}

function nativeSelect(page: import('@playwright/test').Page) {
  return page.locator('select[name="team-filter"]');
}

async function mockTeamFilterablePlayers(
  page: import('@playwright/test').Page,
): Promise<void> {
  await createGraphQLRouter(page, {
    footballplayers: (route, { variables }) => {
      const nflTeam = variables.nflTeam as string | undefined;
      return fulfillJson(
        route,
        playersResponse(filterByTeam(ALL_PLAYERS, nflTeam)),
      );
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('FootballPlayers — team filter (LS-5607) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockTeamFilterablePlayers(page);
    await page.goto(PAGE_URL);
  });

  test('team filter dropdown is present with an All Teams default', async ({
    page,
  }) => {
    await expect(nativeSelect(page)).toBeAttached();
    await expect(
      nativeSelect(page).locator('option[value="All"]'),
    ).toBeAttached();
  });

  test('selecting a team sends nflTeam in the GraphQL request without conference or freeAgent', async ({
    page,
  }) => {
    const requestPromise = page.waitForRequest((req) => {
      if (!req.url().includes('/graphql') || req.method() !== 'POST')
        return false;
      try {
        const body = JSON.parse(req.postData() ?? '{}') as {
          operationName?: string;
          variables?: Record<string, unknown>;
        };
        return (
          body.operationName?.toLowerCase() === 'footballplayers' &&
          body.variables?.nflTeam === 'BUF'
        );
      } catch {
        return false;
      }
    });

    await nativeSelect(page).selectOption('BUF', { force: true });

    const req = await requestPromise;
    const body = JSON.parse(req.postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.nflTeam).toBe('BUF');
    expect(body.variables?.conference).toBeUndefined();
    expect(body.variables?.freeAgent).toBeUndefined();
  });

  test('selecting a team renders only rows for that team', async ({ page }) => {
    await nativeSelect(page).selectOption('BUF', { force: true });

    await expect(page.getByText('Josh Allen')).toBeVisible();
    await expect(page.getByText('Patrick Mahomes')).not.toBeVisible();
  });

  test('selecting a team updates the trigger label to the team full name', async ({
    page,
  }) => {
    await nativeSelect(page).selectOption('BUF', { force: true });

    await expect(page.getByTestId('team-filter-trigger')).toContainText(
      'Buffalo Bills',
    );
  });

  test('selecting All Teams after filtering restores the full player list', async ({
    page,
  }) => {
    await nativeSelect(page).selectOption('BUF', { force: true });
    await expect(page.getByText('Josh Allen')).toBeVisible();
    await expect(page.getByText('Patrick Mahomes')).not.toBeVisible();

    await nativeSelect(page).selectOption('All', { force: true });

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Josh Allen')).toBeVisible();
  });

  test('selecting All Teams sends no nflTeam variable in the GraphQL request', async ({
    page,
  }) => {
    await nativeSelect(page).selectOption('BUF', { force: true });
    await expect(page.getByText('Josh Allen')).toBeVisible();

    const requestPromise = page.waitForRequest((req) => {
      if (!req.url().includes('/graphql') || req.method() !== 'POST')
        return false;
      try {
        const body = JSON.parse(req.postData() ?? '{}') as {
          operationName?: string;
        };
        return body.operationName?.toLowerCase() === 'footballplayers';
      } catch {
        return false;
      }
    });

    await nativeSelect(page).selectOption('All', { force: true });

    const req = await requestPromise;
    const body = JSON.parse(req.postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.nflTeam).toBeUndefined();
  });
});
