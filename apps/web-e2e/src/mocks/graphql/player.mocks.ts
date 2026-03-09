/**
 * Player & stats GraphQL mock data factories.
 *
 * Covers: player, playerByBrefId, careerBattingStats, careerPitchingStats,
 *         careerFieldingStats, playerSeasonBatting, playerSeasonPitching,
 *         seasonBattingStats, seasonPitchingStats, searchPlayers,
 *         getAllPlayerSeasonStats (PlayerDetailModal).
 */

export interface MockPlayer {
  __typename: 'Player';
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  position: string;
  team: string;
  birthDate: string | null;
}

export function mockPlayer(overrides: Partial<MockPlayer> = {}): MockPlayer {
  return {
    __typename: 'Player',
    id: 1,
    firstName: 'Mike',
    lastName: 'Trout',
    brefId: 'troutmi01',
    position: 'CF',
    team: 'LAA',
    birthDate: '1991-08-07',
    ...overrides,
  };
}

export interface MockBattingStat {
  __typename: 'BattingStat';
  season: number;
  team: string;
  games: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbi: number;
  battingAverage: number;
}

export function mockBattingStat(
  overrides: Partial<MockBattingStat> = {},
): MockBattingStat {
  return {
    __typename: 'BattingStat',
    season: 2025,
    team: 'LAA',
    games: 150,
    atBats: 550,
    hits: 165,
    homeRuns: 35,
    rbi: 100,
    battingAverage: 0.3,
    ...overrides,
  };
}

export interface MockPitchingStat {
  __typename: 'PitchingStat';
  season: number;
  team: string;
  games: number;
  wins: number;
  losses: number;
  era: number;
  strikeouts: number;
  inningsPitched: number;
}

export function mockPitchingStat(
  overrides: Partial<MockPitchingStat> = {},
): MockPitchingStat {
  return {
    __typename: 'PitchingStat',
    season: 2025,
    team: 'LAD',
    games: 30,
    wins: 15,
    losses: 5,
    era: 2.5,
    strikeouts: 220,
    inningsPitched: 200,
    ...overrides,
  };
}

// ── Response factories ──────────────────────────────────────────────

export function playerResponse(player?: Partial<MockPlayer>) {
  return { data: { player: mockPlayer(player) } };
}

export function playerByBrefIdResponse(player?: Partial<MockPlayer>) {
  return { data: { playerByBrefId: mockPlayer(player) } };
}

export function careerBattingStatsResponse(stats?: Partial<MockBattingStat>[]) {
  return {
    data: {
      careerBattingStats: (stats ?? [mockBattingStat()]).map((s) =>
        mockBattingStat(s),
      ),
    },
  };
}

export function careerPitchingStatsResponse(
  stats?: Partial<MockPitchingStat>[],
) {
  return {
    data: {
      careerPitchingStats: (stats ?? [mockPitchingStat()]).map((s) =>
        mockPitchingStat(s),
      ),
    },
  };
}

export function seasonBattingStatsResponse(stats?: Partial<MockBattingStat>[]) {
  return {
    data: {
      seasonBattingStats: (stats ?? [mockBattingStat()]).map((s) =>
        mockBattingStat(s),
      ),
    },
  };
}

export function seasonPitchingStatsResponse(
  stats?: Partial<MockPitchingStat>[],
) {
  return {
    data: {
      seasonPitchingStats: (stats ?? [mockPitchingStat()]).map((s) =>
        mockPitchingStat(s),
      ),
    },
  };
}

export function searchPlayersResponse(players?: Partial<MockPlayer>[]) {
  return {
    data: {
      searchPlayers: (players ?? [mockPlayer()]).map((p) => mockPlayer(p)),
    },
  };
}

// ── PlayerDetailModal (GetAllPlayerSeasonStats) ────────────────────────────────

export interface MockSeasonBatting {
  __typename: 'SeasonBatting';
  season: number;
  team: string;
  games: number;
  plateAppearances: number;
  atBats: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  stolenBases: number;
  caughtStealing: number;
  baseOnBalls: number;
  strikeouts: number;
  battingAverage: number;
  onBasePercentage: number;
  sluggingPercentage: number;
}

export function mockSeasonBatting(
  overrides: Partial<MockSeasonBatting> = {},
): MockSeasonBatting {
  return {
    __typename: 'SeasonBatting',
    season: 2024,
    team: 'LAA',
    games: 145,
    plateAppearances: 620,
    atBats: 550,
    runs: 95,
    hits: 165,
    doubles: 30,
    triples: 2,
    homeRuns: 28,
    rbi: 85,
    stolenBases: 12,
    caughtStealing: 3,
    baseOnBalls: 60,
    strikeouts: 110,
    battingAverage: 0.3,
    onBasePercentage: 0.37,
    sluggingPercentage: 0.52,
    ...overrides,
  };
}

export interface MockSeasonPitching {
  __typename: 'SeasonPitching';
  season: number;
  team: string;
  games: number;
  wins: number;
  losses: number;
  gamesStarted: number;
  completeGames: number;
  shutouts: number;
  saves: number;
  inningsPitched: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  homeRuns: number;
  baseOnBalls: number;
  strikeouts: number;
  earnedRunAverage: string;
  whip: number;
}

export function mockSeasonPitching(
  overrides: Partial<MockSeasonPitching> = {},
): MockSeasonPitching {
  return {
    __typename: 'SeasonPitching',
    season: 2024,
    team: 'LAD',
    games: 32,
    wins: 15,
    losses: 5,
    gamesStarted: 32,
    completeGames: 2,
    shutouts: 1,
    saves: 0,
    inningsPitched: 210,
    hits: 155,
    runs: 55,
    earnedRuns: 50,
    homeRuns: 12,
    baseOnBalls: 45,
    strikeouts: 245,
    earnedRunAverage: '2.14',
    whip: 0.95,
    ...overrides,
  };
}

export interface MockSeasonFielding {
  __typename: 'SeasonFielding';
  season: number;
  team: string;
  position: string;
  games: number;
  gamesStarted: number;
  inningsDefended: number;
  putouts: number;
  assists: number;
  errors: number;
  doublePlays: number;
  fieldingPercentage: number;
}

export function mockSeasonFielding(
  overrides: Partial<MockSeasonFielding> = {},
): MockSeasonFielding {
  return {
    __typename: 'SeasonFielding',
    season: 2024,
    team: 'LAA',
    position: 'CF',
    games: 140,
    gamesStarted: 138,
    inningsDefended: 1260,
    putouts: 380,
    assists: 8,
    errors: 2,
    doublePlays: 3,
    fieldingPercentage: 0.995,
    ...overrides,
  };
}

/**
 * Build a GetAllPlayerSeasonStats response for a batter/fielder.
 * Pass empty arrays to omit batting or fielding sections.
 */
export function allPlayerSeasonStatsResponse(opts?: {
  eligiblePositions?: string[];
  batting?: Partial<MockSeasonBatting>[];
  pitching?: Partial<MockSeasonPitching>[];
  fielding?: Partial<MockSeasonFielding>[];
}) {
  return {
    data: {
      player: {
        __typename: 'Player',
        eligiblePositions: opts?.eligiblePositions ?? ['CF', 'OF'],
      },
      playerSeasonBatting: (opts?.batting ?? [mockSeasonBatting()]).map((b) =>
        mockSeasonBatting(b),
      ),
      playerSeasonPitching: (opts?.pitching ?? []).map((p) =>
        mockSeasonPitching(p),
      ),
      playerSeasonFielding: (opts?.fielding ?? [mockSeasonFielding()]).map(
        (f) => mockSeasonFielding(f),
      ),
    },
  };
}
