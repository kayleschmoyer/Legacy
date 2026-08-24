/**
 * Football Players — Team Filter row filtering E2E tests (LS-5607)
 *
 * Verifies that the team filter on /players?sport=nfl:
 *   1. Is present on the page with an "All Teams" default
 *   2. Sends nflTeam: "<abbrev>" in the GraphQL request when a team is selected
 *   3. Renders only rows belonging to that team
 *   4. Updates the filter control's visible label to the team's full name
 *   5. Restores the full list and sends no nflTeam variable when "All Teams" is
 *      reselected
 *
 * Interaction strategy: the canonical surface renders a native <select> with
 * name="team-filter" (footballStatsConfig.tsx), driven through the
 * `playersPage.football` semantic surface (LS-8096 / ADR-0015 — this spec is
 * selector-free; locators live in the page object).
 *
 * All GraphQL responses are mocked via route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/pages';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

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
        totalCount: nodes.length,
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

async function mockTeamFilterablePlayers(
  page: import('@playwright/test').Page,
): Promise<void> {
  // One handler serves both players-surface operations: FootballPlayers
  // (narrow-viewport card feed) and FootballPlayerStatsGrid (desktop grid,
  // LS-9366) — both send the same nflTeam variable and read the same
  // footballPlayers connection.
  const byTeam = (
    route: import('@playwright/test').Route,
    variables: Record<string, unknown>,
  ) => {
    const nflTeam = variables.nflTeam as string | undefined;
    return fulfillJson(
      route,
      playersResponse(filterByTeam(ALL_PLAYERS, nflTeam)),
    );
  };
  await createGraphQLRouter(page, {
    footballplayers: (route, { variables }) => byTeam(route, variables),
    footballplayerstatsgrid: (route, { variables }) => byTeam(route, variables),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('FootballPlayers — team filter (LS-5607) @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockTeamFilterablePlayers(page);
    await playersPage.football.goto();
  });

  test('team filter dropdown is present with an All Teams default', async ({
    playersPage,
  }) => {
    await playersPage.football.expectTeamFilterAttached();
    await playersPage.football.expectTeamOptionAttached('All');
  });

  test('selecting a team sends nflTeam in the GraphQL request without conference or freeAgent', async ({
    page,
    playersPage,
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
          // The desktop grid fires FootballPlayerStatsGrid; the narrow-viewport
          // card feed fires FootballPlayers (LS-9366). Match either.
          ['footballplayers', 'footballplayerstatsgrid'].includes(
            body.operationName?.toLowerCase() ?? '',
          ) && body.variables?.nflTeam === 'BUF'
        );
      } catch {
        return false;
      }
    });

    await playersPage.football.selectTeam('BUF');

    const req = await requestPromise;
    const body = JSON.parse(req.postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.nflTeam).toBe('BUF');
    expect(body.variables?.conference).toBeUndefined();
    expect(body.variables?.freeAgent).toBeUndefined();
  });

  test('selecting a team renders only rows for that team', async ({
    playersPage,
  }) => {
    await playersPage.football.selectTeam('BUF');

    await playersPage.football.expectPlayerVisible('Josh Allen');
    await playersPage.football.expectPlayerHidden('Patrick Mahomes');
  });

  test('selecting a team updates the filter control to the team full name', async ({
    playersPage,
  }) => {
    // The canonical /players surface renders a real native <select> whose
    // selected option is the visible label (no separate trigger element).
    await playersPage.football.selectTeam('BUF');

    await playersPage.football.expectSelectedTeamText('Buffalo Bills');
  });

  test('selecting All Teams after filtering restores the full player list', async ({
    playersPage,
  }) => {
    await playersPage.football.selectTeam('BUF');
    await playersPage.football.expectPlayerVisible('Josh Allen');
    await playersPage.football.expectPlayerHidden('Patrick Mahomes');

    await playersPage.football.selectTeam('All');

    await playersPage.football.expectPlayerVisible('Patrick Mahomes');
    await playersPage.football.expectPlayerVisible('Josh Allen');
  });

  test('selecting All Teams sends no nflTeam variable in the GraphQL request', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.selectTeam('BUF');
    await playersPage.football.expectPlayerVisible('Josh Allen');

    const requestPromise = page.waitForRequest((req) => {
      if (!req.url().includes('/graphql') || req.method() !== 'POST')
        return false;
      try {
        const body = JSON.parse(req.postData() ?? '{}') as {
          operationName?: string;
        };
        return ['footballplayers', 'footballplayerstatsgrid'].includes(
          body.operationName?.toLowerCase() ?? '',
        );
      } catch {
        return false;
      }
    });

    await playersPage.football.selectTeam('All');

    const req = await requestPromise;
    const body = JSON.parse(req.postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.nflTeam).toBeUndefined();
  });
});
