/**
 * Season-active-matchup + scheduled-matchup-roster GraphQL mock data factory
 * (LS-9738, `docs/dev-process/e2e-dual-mode-migration-matrix.md` rows #2/#3,
 * seam-extension-list ranks #2 (deeper rung)/#6).
 *
 * {@link createMatchupFixture} builds a two-team matchup (scoreboard +
 * win-probability payload + an editable roster) on top of an existing
 * {@link LeagueFixture} — the same "layer on top of the shared league
 * fixture" shape {@link import('./waiver-queue.mocks').createWaiverQueueFixture}
 * uses. The roster half of the fixture is a direct sibling of
 * {@link import('./roster.mocks').createFootballLineupFixture} (LS-9655):
 * same stateful-handler-map shape, baseball-flavored (bench/assign/swap
 * instead of football's single assignment flow).
 *
 * Deliberately serves a STATIC win-probability payload rather than computing
 * one — the real Monte Carlo algorithm's correctness stays a live-only
 * assertion (this fixture only proves the panel renders the payload it's
 * given, the same tradeoff already documented for `footballLineup()`).
 *
 * This module is payload-only: it never imports from `fixtures/`, matching
 * the layering `roster.mocks.ts` and `league-fixture.mocks.ts` document.
 */
import type { MockOperationResponder } from './roster.mocks';
import { userTeamIdResponse } from './league.mocks';
import type { LeagueFixture } from './league-fixture.mocks';

export interface MatchupFixtureWinProbability {
  team1WinProbability: number;
  team2WinProbability: number;
  tiesProbability: number;
  team1ProjectedScore: number;
  team2ProjectedScore: number;
  simulationCount: number;
}

export interface MatchupFixturePlayer {
  id: string;
  teamId: number;
  /** `null` = benched. */
  positionId: number | null;
  firstName: string;
  lastName: string;
  eligiblePositions: string[];
}

export interface MatchupFixturePosition {
  id: number;
  positionType: string;
}

export interface MatchupFixture {
  readonly leagueId: number;
  readonly matchupId: number;
  readonly weekNumber: number;
  readonly team1Id: number;
  readonly team2Id: number;
  readonly winProbability: MatchupFixtureWinProbability;
  readonly positions: MatchupFixturePosition[];
  /** The first configured starting slot for `team1Id` — empty until assigned. */
  readonly openSlot: { positionId: number; positionType: string };
  /** The bench player on `team1Id`, eligible for {@link openSlot}. */
  readonly benchPlayer: { matchupPlayerId: string; fullName: string };
  /** A currently-starting player on `team1Id`, free to bench. */
  readonly starterToBench: { matchupPlayerId: string; fullName: string };
  /** Two starters on `team1Id` mutually eligible for each other's slot. */
  readonly swapPair: [
    { matchupPlayerId: string; fullName: string },
    { matchupPlayerId: string; fullName: string },
  ];
  players(): MatchupFixturePlayer[];
  /** Lowercased GraphQL operation name → response-body builder. */
  readonly handlers: Readonly<Record<string, MockOperationResponder>>;
}

export interface MatchupFixtureOptions {
  matchupId?: number;
  weekNumber?: number;
  /** Starting slots to configure for `team1Id`, in render order. Defaults to a single 1B slot. */
  positionTypes?: readonly string[];
}

function toId(value: unknown, fieldName: string): number {
  const id =
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : Number.NaN;
  if (!Number.isInteger(id)) {
    throw new Error(
      `createMatchupFixture: \`${fieldName}\` must be an integer id, ` +
        `received ${JSON.stringify(value)}.`,
    );
  }
  return id;
}

function toNullableId(value: unknown, fieldName: string): number | null {
  return value == null ? null : toId(value, fieldName);
}

/**
 * Build a season-active matchup between the league's commissioner
 * (`team1Id`) and its (only) joined member (`team2Id`) — the precondition
 * `matchup-detail.dual.spec.ts` and `matchup-roster-editor.dual.spec.ts`
 * share. `league` must already have a second member (see
 * `LeagueFixture.addMember` / `TestData.leagueWithMember()`).
 */
export function createMatchupFixture(
  league: LeagueFixture,
  options: MatchupFixtureOptions = {},
): MatchupFixture {
  const matchupId = options.matchupId ?? 5001;
  const weekNumber = options.weekNumber ?? 1;
  const member =
    league.members().find((m) => m.userId !== league.commissioner.userId) ??
    league.addMember();
  const team1Id = league.commissioner.teamId;
  const team2Id = member.teamId;

  // Four slots: the first stays open (the assign-test precondition, mirrors
  // `footballLineup()`'s single-open-slot scenario); the next two are
  // pre-filled by two starters mutually eligible for each other's slot (the
  // swap-test precondition); the fourth is filled by a starter free to bench
  // (the bench-test precondition). `footballLineup()` has no equivalent of
  // either — football only exercises one assignment flow.
  // A 5th, unfilled 'SP' slot is included so the roster comparison's
  // BATTERS/PITCHERS split (`isPitcherPositionType`) has a pitcher slot to
  // render a PITCHERS section for at all — the other four are all
  // hitter-shaped positions, exercised by the bench/assign/swap flows.
  const positionTypes = options.positionTypes ?? ['1B', '2B', '3B', 'SS', 'SP'];
  const positions: MatchupFixturePosition[] = positionTypes.map(
    (positionType, i) => ({
      id: 9_000 + i,
      positionType,
    }),
  );
  const [openSlot, swapSlotA, swapSlotB, benchTestSlot] = positions;
  if (!openSlot) {
    throw new Error(
      'createMatchupFixture: `positionTypes` must configure at least one ' +
        'starting slot — the fixture has no slot to return as `openSlot`.',
    );
  }

  let players: MatchupFixturePlayer[] = [
    {
      id: '30001',
      teamId: team1Id,
      positionId: null,
      firstName: 'Sam',
      lastName: 'Okafor',
      eligiblePositions: [openSlot.positionType],
    },
    {
      id: '30002',
      teamId: team2Id,
      positionId: null,
      firstName: 'Diego',
      lastName: 'Alvarez',
      eligiblePositions: [openSlot.positionType],
    },
  ];
  if (swapSlotA && swapSlotB) {
    players = [
      ...players,
      {
        id: '30003',
        teamId: team1Id,
        positionId: swapSlotA.id,
        firstName: 'Marcus',
        lastName: 'Reyes',
        eligiblePositions: [swapSlotA.positionType, swapSlotB.positionType],
      },
      {
        id: '30004',
        teamId: team1Id,
        positionId: swapSlotB.id,
        firstName: 'Jordan',
        lastName: 'Cruz',
        eligiblePositions: [swapSlotA.positionType, swapSlotB.positionType],
      },
    ];
  }
  if (benchTestSlot) {
    players = [
      ...players,
      {
        id: '30005',
        teamId: team1Id,
        positionId: benchTestSlot.id,
        firstName: 'Taylor',
        lastName: 'Brooks',
        eligiblePositions: [benchTestSlot.positionType],
      },
    ];
  }

  function assignPosition(
    matchupPlayerId: string,
    positionId: number | null,
  ): MatchupFixturePlayer | undefined {
    let updated: MatchupFixturePlayer | undefined;
    players = players.map((p) => {
      if (p.id !== matchupPlayerId) return p;
      updated = { ...p, positionId };
      return updated;
    });
    return updated;
  }

  const benchPlayer = players.find(
    (p) => p.teamId === team1Id && p.positionId == null,
  );
  if (!benchPlayer) {
    throw new Error(
      'createMatchupFixture: expected at least one benched player for team1.',
    );
  }

  const winProbability: MatchupFixtureWinProbability = {
    team1WinProbability: 0.62,
    team2WinProbability: 0.38,
    tiesProbability: 0,
    team1ProjectedScore: 100.5,
    team2ProjectedScore: 88.25,
    simulationCount: 5000,
  };

  function matchupPayload() {
    return {
      __typename: 'Matchup',
      id: matchupId,
      leagueId: league.leagueId,
      weekNumber,
      team1Id,
      team2Id,
      team1Score: 0,
      team2Score: 0,
      status: 'scheduled',
      statsLoadingStatus: 'not_started',
      gamesPerMatchup: 1,
      pitcherStartsPerMatchup: 1,
      selectedGamesCount: 0,
      startTime: null,
      endTime: null,
      lockTime: null,
      updatedAt: new Date().toISOString(),
      team1: {
        __typename: 'Team',
        id: team1Id,
        name: league.commissioner.teamName,
        primaryColor: null,
      },
      team2: {
        __typename: 'Team',
        id: team2Id,
        name: member.teamName,
        primaryColor: null,
      },
      winProbability: {
        __typename: 'MatchupWinProbability',
        team1ProjectedScore: winProbability.team1ProjectedScore,
        team2ProjectedScore: winProbability.team2ProjectedScore,
      },
    };
  }

  const handlers: Record<string, MockOperationResponder> = {
    getmatchupbyid: () => ({ data: { getMatchupById: matchupPayload() } }),
    getmatchupsforleague: () => ({
      data: { getMatchupsForLeague: [matchupPayload()] },
    }),
    getmatchupwinprobability: () => ({
      data: {
        getMatchupById: {
          __typename: 'Matchup',
          id: matchupId,
          winProbability: {
            __typename: 'MatchupWinProbability',
            ...winProbability,
          },
        },
      },
    }),
    getcurrentweekforleague: () => ({
      data: { getCurrentWeekForLeague: weekNumber },
    }),
    getpositionsforleague: () => ({
      data: {
        leaguePositions: positions.map((p) => ({
          __typename: 'LeaguePosition',
          id: p.id,
          leagueId: league.leagueId,
          positionType: p.positionType,
        })),
      },
    }),
    getmatchupplayers: () => ({
      data: {
        getMatchupPlayers: players.map((p) => ({
          __typename: 'MatchupPlayer',
          id: p.id,
          matchupId,
          teamId: p.teamId,
          positionId: p.positionId,
          season: new Date().getFullYear(),
          player: {
            __typename: 'Player',
            firstName: p.firstName,
            lastName: p.lastName,
            eligiblePositions: p.eligiblePositions,
          },
        })),
      },
    }),
    updatematchupplayerposition: (variables) => {
      const matchupPlayerId = String(variables['matchupPlayerId']);
      const positionId = toNullableId(variables['positionId'], 'positionId');
      const updated =
        assignPosition(matchupPlayerId, positionId) ??
        players.find((p) => p.id === matchupPlayerId);
      return {
        data: {
          updateMatchupPlayerPosition: updated && {
            __typename: 'MatchupPlayer',
            id: updated.id,
            matchupId,
            teamId: updated.teamId,
            positionId: updated.positionId,
            season: new Date().getFullYear(),
            player: {
              __typename: 'Player',
              firstName: updated.firstName,
              lastName: updated.lastName,
              eligiblePositions: updated.eligiblePositions,
            },
          },
        },
      };
    },
    swapmatchupplayerpositions: (variables) => {
      const idA = String(variables['matchupPlayerIdA']);
      const idB = String(variables['matchupPlayerIdB']);
      const positionIdA = toNullableId(variables['positionIdA'], 'positionIdA');
      const positionIdB = toNullableId(variables['positionIdB'], 'positionIdB');
      const swapped = [
        assignPosition(idA, positionIdA),
        assignPosition(idB, positionIdB),
      ].filter((p): p is MatchupFixturePlayer => p != null);
      return {
        data: {
          swapMatchupPlayerPositions: swapped.map((p) => ({
            __typename: 'MatchupPlayer',
            id: p.id,
            matchupId,
            teamId: p.teamId,
            positionId: p.positionId,
            season: new Date().getFullYear(),
            player: {
              __typename: 'Player',
              firstName: p.firstName,
              lastName: p.lastName,
              eligiblePositions: p.eligiblePositions,
            },
          })),
        },
      };
    },
    getuserteamid: () => userTeamIdResponse(team1Id),
  };

  const swapCandidateA = players.find((p) => p.id === '30003');
  const swapCandidateB = players.find((p) => p.id === '30004');
  const benchCandidate = players.find((p) => p.id === '30005');
  if (!swapCandidateA || !swapCandidateB || !benchCandidate) {
    throw new Error(
      'createMatchupFixture: `positionTypes` must configure at least four ' +
        'slots for the swap-pair and starter-to-bench handles.',
    );
  }

  return {
    leagueId: league.leagueId,
    matchupId,
    weekNumber,
    team1Id,
    team2Id,
    winProbability,
    positions,
    openSlot: { positionId: openSlot.id, positionType: openSlot.positionType },
    benchPlayer: {
      matchupPlayerId: benchPlayer.id,
      fullName: `${benchPlayer.firstName} ${benchPlayer.lastName}`,
    },
    starterToBench: {
      matchupPlayerId: benchCandidate.id,
      fullName: `${benchCandidate.firstName} ${benchCandidate.lastName}`,
    },
    swapPair: [
      {
        matchupPlayerId: swapCandidateA.id,
        fullName: `${swapCandidateA.firstName} ${swapCandidateA.lastName}`,
      },
      {
        matchupPlayerId: swapCandidateB.id,
        fullName: `${swapCandidateB.firstName} ${swapCandidateB.lastName}`,
      },
    ],
    players: () => players,
    handlers,
  };
}
