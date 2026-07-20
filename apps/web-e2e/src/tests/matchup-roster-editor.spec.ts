/**
 * Matchup Roster Editor E2E Tests (LS-5355)
 *
 * Covers the in-context roster editor on
 * /baseball/league/:leagueId/matchups/:matchupId:
 *   - Renders for the user's own team on a scheduled/in-progress matchup
 *   - Assigning a bench player to an eligible empty slot invokes the
 *     update-position mutation with the expected payload and the UI
 *     reflects the new assignment
 *   - Lock state: an in-progress matchup is discovered as locked on the
 *     first mutation attempt (server-side pre-flight check) and blocks
 *     the write
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 20;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;

// League position slots used by this spec — kept intentionally small (one
// filled per starter plus one empty CF slot) so the bench-assignment flow is
// unambiguous.
const POSITION_C = 10;
const POSITION_1B = 11;
const POSITION_CF = 12;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function mockMatchup(status: 'scheduled' | 'in_progress') {
  return {
    __typename: 'Matchup',
    id: MATCHUP_ID,
    leagueId: LEAGUE_ID,
    weekNumber: 3,
    team1Id: 1,
    team2Id: 2,
    team1Score: 0,
    team2Score: 0,
    status,
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 7,
    pitcherStartsPerMatchup: 2,
    selectedGamesCount: 0,
    startTime: null,
    endTime: null,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

const MOCK_POSITIONS = [
  {
    __typename: 'LeaguePosition',
    id: POSITION_C,
    leagueId: LEAGUE_ID,
    positionType: 'C',
  },
  {
    __typename: 'LeaguePosition',
    id: POSITION_1B,
    leagueId: LEAGUE_ID,
    positionType: '1B',
  },
  {
    __typename: 'LeaguePosition',
    id: POSITION_CF,
    leagueId: LEAGUE_ID,
    positionType: 'CF',
  },
];

interface MockMatchupPlayer {
  __typename: 'MatchupPlayer';
  id: string;
  matchupId: number;
  teamId: number;
  positionId: number | null;
  season: number;
  player: {
    __typename: 'Player';
    firstName: string;
    lastName: string;
    eligiblePositions: string[];
  };
}

function initialPlayers(): MockMatchupPlayer[] {
  return [
    {
      __typename: 'MatchupPlayer',
      id: '201',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: POSITION_C,
      season: 2025,
      player: {
        __typename: 'Player',
        firstName: 'Marcus',
        lastName: 'Reyes',
        eligiblePositions: ['C'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '202',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: POSITION_1B,
      season: 2025,
      player: {
        __typename: 'Player',
        firstName: 'Diego',
        lastName: 'Alvarez',
        eligiblePositions: ['1B'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '203',
      matchupId: MATCHUP_ID,
      teamId: 1,
      // Bench — eligible only for the (currently empty) CF slot.
      positionId: null,
      season: 2025,
      player: {
        __typename: 'Player',
        firstName: 'Sam',
        lastName: 'Okafor',
        eligiblePositions: ['CF', 'OF'],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Route mocking
// ---------------------------------------------------------------------------

interface MockRosterEditorOptions {
  matchupStatus?: 'scheduled' | 'in_progress';
  onUpdatePosition?: (variables: Record<string, unknown>) => void;
}

async function mockRosterEditorGraphQL(
  page: import('@playwright/test').Page,
  options: MockRosterEditorOptions = {},
) {
  const matchupStatus = options.matchupStatus ?? 'scheduled';
  let players = initialPlayers();

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    switch (op) {
      case 'GetMatchupById':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupById: mockMatchup(matchupStatus) },
          }),
        });
        return;
      case 'GetMatchupsForLeague':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { getMatchupsForLeague: [mockMatchup(matchupStatus)] },
          }),
        });
        return;
      case 'GetCurrentWeekForLeague':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
        });
        return;
      case 'GetUserTeamId':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
        return;
      case 'GetLeagueTeams':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
        });
        return;
      case 'GetPositionsForLeague':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
        });
        return;
      case 'GetMatchupPlayers':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getMatchupPlayers: players } }),
        });
        return;
      case 'UpdateMatchupPlayerPosition': {
        const body = route.request().postDataJSON() as {
          variables?: Record<string, unknown>;
        };
        const variables = body.variables ?? {};
        options.onUpdatePosition?.(variables);

        const matchupPlayerId = String(variables['matchupPlayerId']);
        const positionId = (variables['positionId'] as number | null) ?? null;
        players = players.map((p) =>
          p.id === matchupPlayerId ? { ...p, positionId } : p,
        );
        const updated = players.find((p) => p.id === matchupPlayerId) ?? null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { updateMatchupPlayerPosition: updated },
          }),
        });
        return;
      }
      default:
        await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// Tests — rendering
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – Roster Editor @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockRosterEditorGraphQL(page, { matchupStatus: 'scheduled' });
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');
  });

  test("renders the Edit Lineup roster editor for the user's own team on a scheduled matchup", async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'Edit Lineup' }),
    ).toBeVisible();
    await expect(page.getByText('Unlocked', { exact: true })).toBeVisible();
    // Two of three slots (C, 1B) are filled; CF is empty.
    await expect(page.getByText('STARTERS (2/3)')).toBeVisible();
    await expect(page.getByText('BENCH (1)')).toBeVisible();
    await expect(page.getByTestId('matchup-player-row-203')).toBeVisible();
  });

  test('assigns a bench player to an eligible empty slot and invokes the update mutation with the expected payload', async ({
    page,
  }) => {
    // Select the bench player (Sam Okafor, eligible for CF only).
    const benchRow = page.getByTestId('matchup-player-row-203');
    await benchRow.click();

    // Selecting the bench player reveals one assign button per league
    // position slot; only the CF button is eligible for this player.
    const assignToCf = page.getByTestId('roster-assign-203-12');
    await expect(assignToCf).toBeVisible();
    await expect(assignToCf).toBeEnabled();

    await assignToCf.click();

    // UI reflects the new assignment once the mutation resolves and the
    // roster is refetched: all three slots are now filled and the bench
    // is empty.
    await expect(page.getByText('STARTERS (3/3)')).toBeVisible();
    await expect(page.getByText('No bench players')).toBeVisible();
    await expect(page.getByTestId('matchup-player-row-203')).toContainText(
      'Sam Okafor',
    );
  });

  test('save mutation is invoked with the expected matchupPlayerId and positionId', async ({
    page,
  }) => {
    let captured: Record<string, unknown> | null = null;
    // beforeEach already registered a GraphQL route handler and navigated to
    // MATCHUP_URL — unroute it before stacking a second handler so the two
    // handlers' independent `players` closures can't race on the re-navigation
    // below (LS-8517: stacked routes + re-goto caused intermittent timeouts).
    await page.unroute(isGraphQLEndpoint);
    await mockRosterEditorGraphQL(page, {
      matchupStatus: 'scheduled',
      onUpdatePosition: (variables) => {
        captured = variables;
      },
    });
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');

    await page.getByTestId('matchup-player-row-203').click();
    await page.getByTestId('roster-assign-203-12').click();

    await expect(page.getByText('STARTERS (3/3)')).toBeVisible();
    expect(captured).toEqual({ matchupPlayerId: 203, positionId: 12 });
  });
});

// ---------------------------------------------------------------------------
// Tests — lock state for in-progress matchups
// ---------------------------------------------------------------------------

test.describe('Matchup Detail – Roster Editor lock discovery @regression', () => {
  test('discovers the matchup is locked on the first edit attempt and blocks the write', async ({
    page,
  }) => {
    let mutationCalled = false;
    await mockRosterEditorGraphQL(page, {
      matchupStatus: 'in_progress',
      onUpdatePosition: () => {
        mutationCalled = true;
      },
    });
    await page.goto(MATCHUP_URL);
    await page.waitForLoadState('load');

    // Initial render is optimistic — the editor shows Unlocked until an edit
    // is attempted and the server-side pre-flight check reveals the lock.
    await expect(
      page.getByRole('heading', { name: 'Edit Lineup' }),
    ).toBeVisible();
    await expect(page.getByText('Unlocked', { exact: true })).toBeVisible();

    await page.getByTestId('matchup-player-row-203').click();
    await page.getByTestId('roster-assign-203-12').click();

    // The pre-flight GetMatchupById check reports `in_progress`, so the
    // editor flips to its locked, read-only state instead of writing.
    await expect(
      page.getByRole('heading', { name: 'Current Lineup' }),
    ).toBeVisible();
    await expect(page.getByText('Locked', { exact: true })).toBeVisible();
    expect(mutationCalled).toBe(false);
  });
});
