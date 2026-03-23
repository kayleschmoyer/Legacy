/**
 * Matchup GraphQL mock data factories.
 *
 * Covers: getMatchupById, getMatchupsForLeague, getMatchupsByWeek,
 *         getMatchupPlayers, getMatchupRoster, currentMatchupForLeague,
 *         getMatchupHistory, createMatchup, updateMatchupStatus,
 *         matchup progression states, matchup player games.
 */

export interface MockMatchup {
  __typename: 'Matchup';
  id: number;
  leagueId: number;
  week: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'in-progress' | 'completed';
}

export function mockMatchup(overrides: Partial<MockMatchup> = {}): MockMatchup {
  return {
    __typename: 'Matchup',
    id: 1,
    leagueId: 1,
    week: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    ...overrides,
  };
}

// ── Matchup Player Game factories ─────────────────────────────────

export type MockStatsLoadingStatus =
  | 'not_started'
  | 'queued'
  | 'loading'
  | 'completed'
  | 'failed'
  | 'retry';

export interface MockMatchupPlayerGame {
  __typename: 'MatchupPlayerGame';
  id: number;
  matchupPlayerId: number;
  gameNum: number;
  gameIdentifier: string;
  fieldingGamePos: string | null;
  statsLoadingStatus: MockStatsLoadingStatus;
  spSkipped: boolean;
}

/** Individual game selection record for a matchup player. */
export function mockMatchupPlayerGame(
  overrides: Partial<MockMatchupPlayerGame> = {},
): MockMatchupPlayerGame {
  return {
    __typename: 'MatchupPlayerGame',
    id: 1,
    matchupPlayerId: 1,
    gameNum: 1,
    gameIdentifier: 'ARI202504150',
    fieldingGamePos: null,
    statsLoadingStatus: 'not_started',
    spSkipped: false,
    ...overrides,
  };
}

// ── Extended matchup with games ───────────────────────────────────

export type MockMatchupStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface MockMatchupWithGames {
  __typename: 'Matchup';
  id: number;
  leagueId: number;
  weekNumber: number;
  team1Id: number;
  team2Id: number;
  team1Score: number | null;
  team2Score: number | null;
  status: MockMatchupStatus;
  statsLoadingStatus: MockStatsLoadingStatus;
  gamesPerMatchup: number;
  spStartsPerMatchup: number;
  startTime: string | null;
  endTime: string | null;
  games: MockMatchupPlayerGame[];
}

/** MLB team codes for realistic game identifiers. */
const TEAM_CODES = [
  'ARI',
  'ATL',
  'BAL',
  'BOS',
  'CHC',
  'CHW',
  'CIN',
  'CLE',
  'COL',
  'DET',
  'HOU',
  'KCR',
  'LAA',
  'LAD',
  'MIA',
  'MIL',
  'MIN',
  'NYM',
  'NYY',
  'OAK',
  'PHI',
  'PIT',
  'SDP',
  'SFG',
  'SEA',
  'STL',
  'TBR',
  'TEX',
  'TOR',
  'WSN',
];

/** Generate a realistic game identifier (e.g. ARI202504150). */
function generateGameIdentifier(index: number): string {
  const team = TEAM_CODES[index % TEAM_CODES.length];
  const day = String(15 + (index % 15)).padStart(2, '0');
  return `${team}202504${day}0`;
}

/** Matchup with N games selected, with configurable stats loading status. */
export function mockMatchupWithGames(
  gameCount: number,
  overrides: Partial<MockMatchupWithGames> = {},
): MockMatchupWithGames {
  const games = Array.from({ length: gameCount }, (_, i) =>
    mockMatchupPlayerGame({
      id: i + 1,
      gameNum: i + 1,
      gameIdentifier: generateGameIdentifier(i),
      statsLoadingStatus: overrides.statsLoadingStatus ?? 'not_started',
    }),
  );

  return {
    __typename: 'Matchup',
    id: 1,
    leagueId: 1,
    weekNumber: 1,
    team1Id: 1,
    team2Id: 2,
    team1Score: null,
    team2Score: null,
    status: 'scheduled',
    statsLoadingStatus: 'not_started',
    gamesPerMatchup: gameCount,
    spStartsPerMatchup: 2,
    startTime: null,
    endTime: null,
    games,
    ...overrides,
  };
}

// ── Matchup progression phases ────────────────────────────────────

export type MatchupProgressionPhase =
  | 'scheduled'
  | 'in_progress_loading'
  | 'in_progress_loaded'
  | 'completed';

/**
 * Returns appropriate matchup state for a given season phase.
 *
 * - `scheduled` — games not started, no scores
 * - `in_progress_loading` — games in progress, stats still loading
 * - `in_progress_loaded` — games in progress, stats fully loaded with partial scores
 * - `completed` — matchup finished with final scores
 */
export function mockMatchupProgression(
  phase: MatchupProgressionPhase,
  overrides: Partial<MockMatchupWithGames> = {},
): MockMatchupWithGames {
  const phaseDefaults: Record<
    MatchupProgressionPhase,
    Partial<MockMatchupWithGames>
  > = {
    scheduled: {
      status: 'scheduled',
      statsLoadingStatus: 'not_started',
      team1Score: null,
      team2Score: null,
      startTime: '2025-04-15T18:00:00Z',
      endTime: null,
    },
    in_progress_loading: {
      status: 'in_progress',
      statsLoadingStatus: 'loading',
      team1Score: null,
      team2Score: null,
      startTime: '2025-04-15T18:00:00Z',
      endTime: null,
    },
    in_progress_loaded: {
      status: 'in_progress',
      statsLoadingStatus: 'completed',
      team1Score: 42.5,
      team2Score: 38.0,
      startTime: '2025-04-15T18:00:00Z',
      endTime: null,
    },
    completed: {
      status: 'completed',
      statsLoadingStatus: 'completed',
      team1Score: 85.5,
      team2Score: 72.0,
      startTime: '2025-04-15T18:00:00Z',
      endTime: '2025-04-20T23:59:00Z',
    },
  };

  const defaults = phaseDefaults[phase];
  return mockMatchupWithGames(overrides.gamesPerMatchup ?? 3, {
    ...defaults,
    ...overrides,
  });
}

// ── Response factories ──────────────────────────────────────────────

export function matchupByIdResponse(matchup?: Partial<MockMatchup> | null) {
  return {
    data: { matchup: matchup === null ? null : mockMatchup(matchup) },
  };
}

export function matchupsForLeagueResponse(matchups?: Partial<MockMatchup>[]) {
  return {
    data: {
      getMatchupsForLeague: (matchups ?? []).map((m) => mockMatchup(m)),
    },
  };
}

export function currentMatchupForLeagueResponse(
  matchup: Partial<MockMatchup> | null = null,
) {
  return {
    data: {
      currentMatchupForLeague: matchup ? mockMatchup(matchup) : null,
    },
  };
}

export function matchupHistoryResponse(matchups?: Partial<MockMatchup>[]) {
  return {
    data: {
      getMatchupHistory: (matchups ?? []).map((m) => mockMatchup(m)),
    },
  };
}

export function matchupWithGamesResponse(
  matchup?: Partial<MockMatchupWithGames>,
) {
  return {
    data: {
      matchup: mockMatchupWithGames(matchup?.gamesPerMatchup ?? 3, matchup),
    },
  };
}

export function matchupProgressionResponse(
  phase: MatchupProgressionPhase,
  overrides?: Partial<MockMatchupWithGames>,
) {
  return {
    data: { matchup: mockMatchupProgression(phase, overrides) },
  };
}
