/**
 * Factory functions for creating test fixture objects.
 *
 * Factories always return a **fresh mutable copy** with sensible defaults
 * that can be selectively overridden. This makes tests resilient to future
 * schema changes: only the properties relevant to the test need to be set.
 *
 * @example
 * // Use all defaults
 * const player = createPlayer();
 *
 * // Override only what matters for this test
 * const admin = createUser({ accessLevel: 'admin' });
 *
 * // Unique league per test to avoid constraint violations
 * const league = createLeague({ id: Date.now(), inviteCode: 'UNIQUE01' });
 */

import type {
  FixtureCareerBattingStat,
  FixtureCareerPitchingStat,
  FixtureFootballPlayer,
  FixtureLeague,
  FixtureMatchup,
  FixturePlayer,
  FixtureTeam,
  FixtureUser,
} from './types';

export function createPlayer(
  overrides: Partial<FixturePlayer> = {},
): FixturePlayer {
  return {
    id: 1,
    firstName: 'Mike',
    lastName: 'Trout',
    brefId: 'troutmi01',
    ...overrides,
  };
}

export function createFootballPlayer(
  overrides: Partial<FixtureFootballPlayer> = {},
): FixtureFootballPlayer {
  return {
    id: 1,
    firstName: 'Patrick',
    lastName: 'Mahomes',
    position: 'QB',
    team: 'KC',
    fpg: 24.5,
    ownershipPct: 99.2,
    byeWeek: 10,
    ...overrides,
  };
}

export function createUser(overrides: Partial<FixtureUser> = {}): FixtureUser {
  return {
    id: 1,
    email: 'test.user@example.com',
    username: 'testuser',
    password: 'hashed_password_123',
    accessLevel: 'none',
    ...overrides,
  };
}

export function createLeague(
  overrides: Partial<FixtureLeague> = {},
): FixtureLeague {
  return {
    id: 1,
    name: 'Test League Alpha',
    owner: 1,
    inviteCode: 'ALPHA123',
    maxRosterSize: 25,
    currentMatchup: null,
    draftStatus: 'not-started',
    minGamesPerSeason: 10,
    gamesPerMatchup: 5,
    ...overrides,
  };
}

export function createTeam(overrides: Partial<FixtureTeam> = {}): FixtureTeam {
  return {
    id: 1,
    name: 'Test Team Alpha',
    leagueId: 1,
    ...overrides,
  };
}

export function createMatchup(
  overrides: Partial<FixtureMatchup> = {},
): FixtureMatchup {
  return {
    id: 1,
    leagueId: 1,
    weekNumber: 1,
    team1Id: 1,
    team2Id: 2,
    team1Score: null,
    team2Score: null,
    status: 'scheduled',
    selectedSeason: 2024,
    gamesPerMatchup: 5,
    startTime: '2024-03-01T00:00:00.000Z',
    endTime: '2024-03-08T00:00:00.000Z',
    ...overrides,
  };
}

export function createCareerBattingStat(
  overrides: Partial<FixtureCareerBattingStat> = {},
): FixtureCareerBattingStat {
  return {
    playerId: 1,
    g: 100,
    pa: 420,
    ab: 380,
    r: 60,
    h: 110,
    doubles: 22,
    triples: 3,
    hr: 20,
    rbi: 75,
    sb: 10,
    cs: 3,
    bb: 40,
    so: 85,
    battingAvg: 0.289,
    onbasePerc: 0.36,
    sluggingPerc: 0.478,
    onbasePlusSlugging: 0.838,
    ...overrides,
  };
}

export function createCareerPitchingStat(
  overrides: Partial<FixtureCareerPitchingStat> = {},
): FixtureCareerPitchingStat {
  return {
    playerId: 3,
    w: 12,
    l: 7,
    winLossPerc: 0.632,
    earnedRunAvg: 3.25,
    g: 28,
    gs: 28,
    gf: 0,
    cg: 2,
    sho: 1,
    sv: 0,
    ip: 175.0,
    h: 155,
    r: 68,
    er: 63,
    hr: 18,
    bb: 45,
    so: 195,
    ...overrides,
  };
}
