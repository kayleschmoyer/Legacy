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
  onBasePlusSluggingPlus: number | null;
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
    onBasePlusSluggingPlus: 142,
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

// ── Player-stats grid (GetPlayersWithStats / GetCareerBattingStats) ─────────

export interface MockCareerBattingLeader {
  __typename: 'CareerBatting';
  playerId: number;
  primaryPosition: string;
  positionsPlayed: string | null;
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
  totalBases: number;
  groundedIntoDoublePlays: number;
  hitByPitch: number;
  sacrificeHits: number;
  intentionalBaseOnBalls: number;
  battingAverage: number;
  onBasePercentage: number;
  sluggingPercentage: number;
  offensiveWAR: number;
  player: {
    __typename: 'Player';
    id: number;
    firstName: string;
    lastName: string;
    brefId: string;
  };
}

export function mockCareerBattingLeader(
  overrides: Partial<MockCareerBattingLeader> = {},
): MockCareerBattingLeader {
  return {
    __typename: 'CareerBatting',
    playerId: 1,
    primaryPosition: 'CF',
    positionsPlayed: null,
    games: 1131,
    plateAppearances: 5101,
    atBats: 4289,
    runs: 894,
    hits: 1559,
    doubles: 315,
    triples: 48,
    homeRuns: 368,
    rbi: 817,
    stolenBases: 211,
    caughtStealing: 57,
    baseOnBalls: 774,
    strikeouts: 1034,
    totalBases: 2988,
    groundedIntoDoublePlays: 76,
    hitByPitch: 35,
    sacrificeHits: 3,
    intentionalBaseOnBalls: 231,
    battingAverage: 0.304,
    onBasePercentage: 0.41,
    sluggingPercentage: 0.582,
    offensiveWAR: 72.9,
    player: {
      __typename: 'Player',
      id: 1,
      firstName: 'Mike',
      lastName: 'Trout',
      brefId: 'troutmi01',
    },
    ...overrides,
  };
}

/**
 * Build the connection-shaped response the `/players/stats` batting grid
 * consumes (GetCareerBattingStats / GetPlayersWithStats / GetAllPlayers all
 * read this shape — the page mocks all three with one payload). Defaults to a
 * two-player pool (Mike Trout, Shohei Ohtani), mirroring the inline payload in
 * player-stats.spec.ts.
 */
export function careerBattingConnectionResponse(
  leaders?: MockCareerBattingLeader[],
) {
  const nodes = leaders ?? [
    mockCareerBattingLeader(),
    mockCareerBattingLeader({
      playerId: 2,
      primaryPosition: 'DH',
      games: 1200,
      plateAppearances: 4800,
      atBats: 4100,
      runs: 900,
      hits: 1300,
      doubles: 250,
      triples: 20,
      homeRuns: 250,
      rbi: 700,
      stolenBases: 100,
      caughtStealing: 30,
      baseOnBalls: 600,
      strikeouts: 1100,
      totalBases: 2500,
      groundedIntoDoublePlays: 50,
      hitByPitch: 20,
      sacrificeHits: 5,
      intentionalBaseOnBalls: 50,
      battingAverage: 0.286,
      onBasePercentage: 0.37,
      sluggingPercentage: 0.55,
      offensiveWAR: 55.0,
      player: {
        __typename: 'Player',
        id: 2,
        firstName: 'Shohei',
        lastName: 'Ohtani',
        brefId: 'ohtansh01',
      },
    }),
  ];

  return {
    data: {
      careerBattingStats: {
        __typename: 'CareerBattingConnection',
        totalCount: nodes.length,
        edges: nodes.map((node) => ({
          __typename: 'CareerBattingEdge',
          node,
        })),
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
      },
      players: nodes.map(({ player }) => ({
        ...player,
        statsLastFetchedAt: null,
      })),
    },
  };
}

// ── Player-stats grid, pitching view (GetCareerPitchingStats[Count]) ────────

export interface MockCareerPitchingLeader {
  __typename: 'CareerPitching';
  playerId: number;
  wins: number;
  losses: number;
  games: number;
  gamesStarted: number;
  gamesFinished: number;
  completeGames: number;
  shutouts: number;
  saves: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  homeRuns: number;
  baseOnBalls: number;
  intentionalBaseOnBalls: number;
  strikeouts: number;
  hitByPitch: number;
  balks: number;
  wildPitches: number;
  battersFaced: number;
  outsRecorded: number;
  outRate: number | null;
  era: string;
  winPercentage: number;
  player: {
    __typename: 'Player';
    id: number;
    firstName: string;
    lastName: string;
  };
}

export function mockCareerPitchingLeader(
  overrides: Partial<MockCareerPitchingLeader> = {},
): MockCareerPitchingLeader {
  // Roger Clemens' career line — mirrors the proven payload in
  // player-stats-search-and-filters.spec.ts.
  return {
    __typename: 'CareerPitching',
    playerId: 201,
    wins: 354,
    losses: 184,
    games: 709,
    gamesStarted: 707,
    gamesFinished: 1,
    completeGames: 100,
    shutouts: 46,
    saves: 0,
    hits: 4672,
    runs: 1940,
    earnedRuns: 1770,
    homeRuns: 363,
    baseOnBalls: 1580,
    intentionalBaseOnBalls: 79,
    strikeouts: 4672,
    hitByPitch: 158,
    balks: 8,
    wildPitches: 153,
    battersFaced: 20016,
    outsRecorded: 13095,
    outRate: null,
    era: '3.19',
    winPercentage: 0.658,
    player: {
      __typename: 'Player',
      id: 201,
      firstName: 'Roger',
      lastName: 'Clemens',
    },
    ...overrides,
  };
}

/** Response for GetCareerPitchingStats — the pitching grid's array shape. */
export function careerPitchingLeadersResponse(
  stats?: MockCareerPitchingLeader[],
) {
  return {
    data: { careerPitchingStats: stats ?? [mockCareerPitchingLeader()] },
  };
}

/** Response for GetCareerPitchingStatsCount. */
export function careerPitchingLeadersCountResponse(count: number) {
  return { data: { careerPitchingStatsCount: count } };
}

// ── Player comparison (GetPlayersWithStats — compare search + table) ────────

/**
 * The rich player shape the comparison surface consumes from
 * GetPlayersWithStats — mirrors the proven inline payload in
 * player-comparison.spec.ts.
 */
export interface MockComparablePlayer {
  __typename: 'Player';
  id: number;
  firstName: string;
  lastName: string;
  eligiblePositions: string[];
  scoring: {
    __typename: 'PlayerScoring';
    totalScore: number;
    avgPointsPerGame: number;
    hitterScore: number;
    pitchingScore: number;
    fieldingScore: number;
  };
  careerBatting: {
    games: number;
    hits: number;
    homeRuns: number;
    rbi: number;
    runs: number;
    stolenBases: number;
    baseOnBalls: number;
    totalBases: number;
    offensiveWAR: number;
  };
  averageSeasonBatting: {
    battingAverage: number;
    onBasePercentage: number;
    sluggingPercentage: number;
  };
  careerPitching: null;
  careerAchievements: {
    allStarSelections: number;
    mvpAwards: number;
    cyYoungAwards: number;
    goldGloves: number;
    silverSluggers: number;
    worldSeriesRings: number;
  };
}

export function mockComparablePlayer(
  overrides: Partial<MockComparablePlayer> = {},
): MockComparablePlayer {
  return {
    __typename: 'Player',
    id: 1,
    firstName: 'Mike',
    lastName: 'Trout',
    eligiblePositions: ['CF', 'OF'],
    scoring: {
      __typename: 'PlayerScoring',
      totalScore: 920,
      avgPointsPerGame: 2.1,
      hitterScore: 88,
      pitchingScore: 0,
      fieldingScore: 7,
    },
    careerBatting: {
      games: 1131,
      hits: 1559,
      homeRuns: 368,
      rbi: 817,
      runs: 894,
      stolenBases: 211,
      baseOnBalls: 774,
      totalBases: 2988,
      offensiveWAR: 72.9,
    },
    averageSeasonBatting: {
      battingAverage: 0.304,
      onBasePercentage: 0.41,
      sluggingPercentage: 0.582,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 11,
      mvpAwards: 3,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 9,
      worldSeriesRings: 0,
    },
    ...overrides,
  };
}

/** Response for GetPlayersWithStats as the comparison surface consumes it. */
export function comparablePlayersResponse(players?: MockComparablePlayer[]) {
  return { data: { players: players ?? [mockComparablePlayer()] } };
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
