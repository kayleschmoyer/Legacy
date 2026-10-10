/**
 * Roster Section — E2E Tests (LS-5361)
 *
 * Covers the Roster / Lineup Editor (RosterBoard, LS-5360) on the Team
 * Detail page: /baseball/teams/:teamId
 *
 *   - "Roster" heading is visible
 *   - Each rostered player's name renders (lineup slot or bench row)
 *   - Assigned players show their position label in the lineup slot (e.g. "C", "SS")
 *   - Players with no positionId appear on the Bench, showing "Unclassified"
 *     when they have no eligible positions
 *
 * All GraphQL queries are mocked; these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const TEAM_ID = 1;
const LEAGUE_ID = 100;

function makeTeam(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Team',
    id: TEAM_ID,
    leagueId: LEAGUE_ID,
    name: 'Test Team',
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    totalPayroll: null,
    capSpace: null,
    ...overrides,
  };
}

function makeTeamMember(
  id: number,
  firstName: string,
  lastName: string,
  positionId: number | null,
) {
  return {
    __typename: 'TeamMember',
    id,
    playerId: id,
    positionId,
    teamId: TEAM_ID,
    leagueId: LEAGUE_ID,
    onTradeBlock: false,
    salary: null,
    askingPrice: null,
    nickname: null,
    player: {
      __typename: 'Player',
      id,
      firstName,
      lastName,
      brefId: null,
      eligiblePositions: [],
      careerBatting: null,
      seasonsPlayed: null,
    },
  };
}

const MOCK_TEAM_MEMBERS = [
  makeTeamMember(10, 'Aaron', 'Judge', 1),
  makeTeamMember(11, 'Mike', 'Trout', 3),
  makeTeamMember(12, 'Shohei', 'Ohtani', null),
];

const MOCK_POSITIONS = [
  {
    __typename: 'LeaguePosition',
    id: 1,
    leagueId: LEAGUE_ID,
    positionType: 'C',
  },
  {
    __typename: 'LeaguePosition',
    id: 3,
    leagueId: LEAGUE_ID,
    positionType: 'SS',
  },
];

async function setupGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as {
      operationName?: string;
    };
    const op = body.operationName ?? '';

    if (op === 'GetTeamMembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: MOCK_TEAM_MEMBERS } }),
      });
      return;
    }
    if (op === 'GetTeamById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { team: makeTeam({ managerId: null }) },
        }),
      });
      return;
    }
    if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: [makeTeam()] } }),
      });
      return;
    }
    if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: TEAM_ID + 999 } }),
      });
      return;
    }
    if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            league: {
              __typename: 'League',
              id: LEAGUE_ID,
              userMembership: {
                teamId: TEAM_ID + 999,
                permissionLevel: 'member',
              },
            },
          },
        }),
      });
      return;
    }
    if (op === 'GetViewerMembership') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            viewerMembership: {
              __typename: 'LeagueMember',
              leagueId: LEAGUE_ID,
              userId: 1,
              teamId: TEAM_ID + 999,
              permissionLevel: 'member',
            },
          },
        }),
      });
      return;
    }
    if (op === 'GetPositionsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
      return;
    }

    await unmockedGraphQLFallback(route);
  });
}

test.describe('Roster Section @regression', () => {
  test('should display the "Roster" heading on the team detail page', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(`/baseball/teams/${TEAM_ID}`);

    await expect(page.getByText('Roster', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('should render a card for each rostered player with first and last name', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(`/baseball/teams/${TEAM_ID}`);

    await expect(page.getByText('Aaron Judge')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Mike Trout')).toBeVisible();
    await expect(page.getByText('Shohei Ohtani')).toBeVisible();
  });

  test("should resolve each player's position label from positionMap", async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(`/baseball/teams/${TEAM_ID}`);

    await expect(page.getByText('Aaron Judge')).toBeVisible({
      timeout: 15_000,
    });

    // Each position label is unique across the mocked roster, so a
    // page-level assertion is sufficient — no fragile DOM-ancestor scoping.
    // Position labels depend on a separate GetPositionsForLeague query
    // resolving after the roster renders, so give them their own timeout
    // rather than the 3s expect() default.
    await expect(page.getByText('C', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('SS', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('should show "Unclassified" on the bench for a player with no eligible positions', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await page.goto(`/baseball/teams/${TEAM_ID}`);

    // Ohtani has positionId: null and no eligiblePositions, so RosterBoard
    // places him on the Bench with the "Unclassified" fallback subtext
    // (rather than a lineup slot, which only assigned players occupy).
    await expect(page.getByText('Shohei Ohtani')).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText('Unclassified', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
