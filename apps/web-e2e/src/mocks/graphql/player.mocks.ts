/**
 * Player & stats GraphQL mock data factories.
 *
 * Covers: player, playerByBrefId, careerBattingStats, careerPitchingStats,
 *         careerFieldingStats, playerSeasonBatting, playerSeasonPitching,
 *         seasonBattingStats, seasonPitchingStats, searchPlayers.
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
