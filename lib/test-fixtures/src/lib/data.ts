/**
 * Static fixture data for tests.
 *
 * These are pre-built test objects with realistic values. They are frozen to
 * prevent accidental mutation. Use factory functions (`createPlayer()` etc.)
 * when a fresh mutable copy with optional overrides is needed.
 */

import type {
  FixtureCareerStats,
  FixtureLeague,
  FixtureMatchup,
  FixturePlayer,
  FixtureTeam,
  FixtureUser,
} from './types';

export const fixturePlayers: readonly FixturePlayer[] = Object.freeze([
  { id: 1, firstName: 'Mike', lastName: 'Trout', brefId: 'troutmi01' },
  { id: 2, firstName: 'Aaron', lastName: 'Judge', brefId: 'judgeaa01' },
  { id: 3, firstName: 'Shohei', lastName: 'Ohtani', brefId: 'ohtansh01' },
  { id: 4, firstName: 'Ronald', lastName: 'Acuna Jr.', brefId: 'acunaro01' },
  { id: 5, firstName: 'Fernando', lastName: 'Tatis Jr.', brefId: 'tatisfe02' },
]);

export const fixtureUsers: readonly FixtureUser[] = Object.freeze([
  {
    id: 1,
    email: 'test.user@example.com',
    username: 'testuser',
    password: 'hashed_password_123',
    accessLevel: 'none',
  },
  {
    id: 2,
    email: 'admin@example.com',
    username: 'admin',
    password: 'hashed_admin_pass',
    accessLevel: 'admin',
  },
  {
    id: 3,
    email: 'league.owner@example.com',
    username: 'leagueowner',
    password: 'hashed_owner_pass',
    accessLevel: 'none',
  },
]);

export const fixtureLeagues: readonly FixtureLeague[] = Object.freeze([
  {
    id: 1,
    name: 'Test League Alpha',
    owner: 1,
    maxRosterSize: 25,
    currentMatchup: null,
    draftStatus: 'not-started',
    inviteCode: 'ALPHA123',
    minGamesPerSeason: 10,
    gamesPerMatchup: 5,
  },
  {
    id: 2,
    name: 'Test League Beta',
    owner: 2,
    maxRosterSize: 30,
    currentMatchup: 1,
    draftStatus: 'completed',
    inviteCode: 'BETA456',
    minGamesPerSeason: 15,
    gamesPerMatchup: 7,
  },
]);

export const fixtureTeams: readonly FixtureTeam[] = Object.freeze([
  { id: 1, name: 'Test Team Alpha', leagueId: 1 },
  { id: 2, name: 'Test Team Beta', leagueId: 1 },
  { id: 3, name: 'Test Team Gamma', leagueId: 2 },
  { id: 4, name: 'Test Team Delta', leagueId: 2 },
]);

export const fixtureMatchups: readonly FixtureMatchup[] = Object.freeze([
  {
    id: 1,
    leagueId: 1,
    weekNumber: 1,
    team1Id: 1,
    team2Id: 2,
    team1Score: '125.50',
    team2Score: '118.25',
    status: 'completed',
    selectedSeason: 2024,
    gamesPerMatchup: 5,
    startTime: '2024-03-01T00:00:00.000Z',
    endTime: '2024-03-08T00:00:00.000Z',
  },
  {
    id: 2,
    leagueId: 1,
    weekNumber: 2,
    team1Id: 1,
    team2Id: 2,
    team1Score: null,
    team2Score: null,
    status: 'scheduled',
    selectedSeason: 2024,
    gamesPerMatchup: 5,
    startTime: '2024-03-08T00:00:00.000Z',
    endTime: '2024-03-15T00:00:00.000Z',
  },
]);

export const fixtureCareerStats: FixtureCareerStats = Object.freeze({
  battingStats: [
    {
      playerId: 1,
      g: 1500,
      pa: 6500,
      ab: 5800,
      r: 1200,
      h: 1850,
      doubles: 380,
      triples: 50,
      hr: 450,
      rbi: 1300,
      sb: 200,
      cs: 45,
      bb: 850,
      so: 1400,
      battingAvg: 0.319,
      onbasePerc: 0.42,
      sluggingPerc: 0.645,
      onbasePlusSlugging: 1.065,
    },
  ],
  pitchingStats: [
    {
      playerId: 3,
      w: 95,
      l: 48,
      winLossPerc: 0.664,
      earnedRunAvg: 2.85,
      g: 200,
      gs: 180,
      gf: 0,
      cg: 12,
      sho: 5,
      sv: 0,
      ip: 1250.1,
      h: 950,
      r: 425,
      er: 396,
      hr: 125,
      bb: 350,
      so: 1450,
    },
  ],
});

/**
 * Combined fixture object — mirrors the shape of the legacy
 * `lambdas/db/src/__fixtures__` index for a familiar import pattern.
 */
export const fixtures = {
  players: fixturePlayers,
  users: fixtureUsers,
  leagues: fixtureLeagues,
  teams: fixtureTeams,
  matchups: fixtureMatchups,
  careerStats: fixtureCareerStats,
} as const;
