/**
 * Football Matchup Roster Editor E2E Tests (LS-9679)
 *
 * Football-route variant of matchup-roster-editor.spec.ts (LS-5355), which
 * only covers the in-context roster editor on the baseball matchup-detail
 * route. `MatchupRosterEditor` (rendered by the shared `MatchupDetailPage`
 * at any `/:sport/league/:leagueId/matchups/:matchupId`) is sport-agnostic,
 * so this spec reuses the same `matchupPage` driver — only the position/
 * player fixtures are football-flavored (QB/RB/WR/TE/FLEX/K/DST instead of
 * baseball positions).
 *
 * Covers the LS-5269 (Football Matchup Detail) QA-sweep gap: navigate to an
 * unlocked, user-owned football matchup, open the pre-lock lineup editor,
 * move a bench player into an open starting slot, save, and assert the
 * roster view reflects the swap (starters/bench counts + the moved player's
 * row).
 *
 * All GraphQL responses are mocked so no live backend is required
 * (hermetic — every response is fulfilled locally, never passed through
 * to a live network call).
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 800;

// League position slots for this spec's team — six starting slots filled
// plus one empty FLEX slot, so the bench-assignment flow is unambiguous
// (mirrors the baseball spec's one-filled-plus-one-empty-slot shape).
const POSITION_QB = 1;
const POSITION_RB = 2;
const POSITION_WR = 3;
const POSITION_TE = 4;
const POSITION_FLEX = 5;
const POSITION_K = 6;
const POSITION_DST = 7;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = { ...mockLeague({ id: LEAGUE_ID }), sport: 'football' };

function mockMatchup(status: 'scheduled' | 'in_progress') {
  return {
    __typename: 'Matchup',
    id: MATCHUP_ID,
    leagueId: LEAGUE_ID,
    weekNumber: 4,
    team1Id: 1,
    team2Id: 2,
    team1Score: 0,
    team2Score: 0,
    status,
    statsLoadingStatus: 'complete',
    gamesPerMatchup: 1,
    pitcherStartsPerMatchup: null,
    selectedGamesCount: 0,
    startTime: null,
    endTime: null,
    winProbability: null,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Gridiron Giants',
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
    name: 'End Zone Eagles',
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
    id: POSITION_QB,
    leagueId: LEAGUE_ID,
    positionType: 'QB',
  },
  {
    __typename: 'LeaguePosition',
    id: POSITION_RB,
    leagueId: LEAGUE_ID,
    positionType: 'RB',
  },
  {
    __typename: 'LeaguePosition',
    id: POSITION_WR,
    leagueId: LEAGUE_ID,
    positionType: 'WR',
  },
  {
    __typename: 'LeaguePosition',
    id: POSITION_TE,
    leagueId: LEAGUE_ID,
    positionType: 'TE',
  },
  {
    __typename: 'LeaguePosition',
    id: POSITION_FLEX,
    leagueId: LEAGUE_ID,
    positionType: 'FLEX',
  },
  {
    __typename: 'LeaguePosition',
    id: POSITION_K,
    leagueId: LEAGUE_ID,
    positionType: 'K',
  },
  {
    __typename: 'LeaguePosition',
    id: POSITION_DST,
    leagueId: LEAGUE_ID,
    positionType: 'DST',
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
      id: '301',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: POSITION_QB,
      season: 2026,
      player: {
        __typename: 'Player',
        firstName: 'Jalen',
        lastName: 'Marsh',
        eligiblePositions: ['QB'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '302',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: POSITION_RB,
      season: 2026,
      player: {
        __typename: 'Player',
        firstName: 'Derrick',
        lastName: 'Combs',
        eligiblePositions: ['RB'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '303',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: POSITION_WR,
      season: 2026,
      player: {
        __typename: 'Player',
        firstName: 'Tyreek',
        lastName: 'Boyd',
        eligiblePositions: ['WR'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '304',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: POSITION_TE,
      season: 2026,
      player: {
        __typename: 'Player',
        firstName: 'Travis',
        lastName: 'Kellum',
        eligiblePositions: ['TE'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '305',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: POSITION_K,
      season: 2026,
      player: {
        __typename: 'Player',
        firstName: 'Justin',
        lastName: 'Tucker',
        eligiblePositions: ['K'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '306',
      matchupId: MATCHUP_ID,
      teamId: 1,
      positionId: POSITION_DST,
      season: 2026,
      player: {
        __typename: 'Player',
        firstName: 'Steel',
        lastName: 'Curtain',
        eligiblePositions: ['DST'],
      },
    },
    {
      __typename: 'MatchupPlayer',
      id: '307',
      matchupId: MATCHUP_ID,
      teamId: 1,
      // Bench — eligible only for the (currently empty) FLEX slot.
      positionId: null,
      season: 2026,
      player: {
        __typename: 'Player',
        firstName: 'Sam',
        lastName: 'Okafor',
        eligiblePositions: ['RB', 'WR', 'TE', 'FLEX'],
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

async function mockFootballRosterEditorGraphQL(
  page: import('@playwright/test').Page,
  options: MockRosterEditorOptions = {},
) {
  const matchupStatus = options.matchupStatus ?? 'scheduled';
  let players = initialPlayers();

  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    switch (op) {
      case 'GetLeagueById':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
        });
        return;
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
          body: JSON.stringify({ data: { getCurrentWeekForLeague: 4 } }),
        });
        return;
      case 'GetUserTeamId':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { userTeamId: 1 } }),
        });
        return;
      case 'MatchupScores':
        // MatchupAdditionalSections (football-only) fires this — not under
        // test here, so an empty result is enough to satisfy API isolation.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { matchupScores: [] } }),
        });
        return;
      case 'GetTeamMatchupHistory':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getTeamMatchupHistory: [] } }),
        });
        return;
      case 'GetLeagueStandings':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getLeagueStandings: [] } }),
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
// Tests
// ---------------------------------------------------------------------------

test.describe('Football Matchup Detail – Roster Editor @regression', () => {
  test.beforeEach(async ({ page, matchupPage }) => {
    await mockFootballRosterEditorGraphQL(page, { matchupStatus: 'scheduled' });
    await matchupPage.goto(LEAGUE_ID, MATCHUP_ID, 'football');
  });

  test("renders the Edit Lineup roster editor for the user's own team on an unlocked football matchup", async ({
    matchupPage,
  }) => {
    await matchupPage.heading('Edit Lineup').expectVisible({ timeout: 10_000 });
    await matchupPage.text('Unlocked', { exact: true }).expectVisible();
    // Six of seven slots (QB/RB/WR/TE/K/DST) are filled; FLEX is empty.
    await matchupPage.text('STARTERS (6/7)').expectVisible();
    await matchupPage.text('BENCH (1)').expectVisible();
    await matchupPage.playerRow(307).expectVisible();
  });

  test('moves the bench player into the open FLEX slot, saves, and the roster view reflects the swap', async ({
    matchupPage,
  }) => {
    // Select the bench player (Sam Okafor, FLEX-eligible).
    await matchupPage.selectPlayerRow(307);

    // Selecting the bench player reveals one assign button per league
    // position slot; only the FLEX button is eligible for this player.
    const assignToFlex = matchupPage.assignButton(307, POSITION_FLEX);
    await assignToFlex.expectVisible();
    await assignToFlex.expectEnabled();

    await matchupPage.assignPlayerToPosition(307, POSITION_FLEX);

    // UI reflects the new assignment once the mutation resolves and the
    // roster is refetched: all seven slots are now filled and the bench
    // is empty.
    await matchupPage.text('STARTERS (7/7)').expectVisible();
    await matchupPage.text('No bench players').expectVisible();
    await matchupPage.playerRow(307).expectContainsText('Sam Okafor');
  });
});
