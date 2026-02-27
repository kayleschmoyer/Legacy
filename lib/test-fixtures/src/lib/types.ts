/**
 * Type definitions for test fixtures.
 *
 * These types describe the shape of fixture objects used across test suites.
 * They intentionally model the public API of the domain (not the raw DB schema).
 */

export interface FixtureUser {
  id: number;
  email: string;
  username: string;
  password: string;
  accessLevel: 'none' | 'admin';
}

export interface FixturePlayer {
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
}

export interface FixtureLeague {
  id: number;
  name: string;
  owner: number;
  inviteCode: string;
  maxRosterSize: number;
  currentMatchup: number | null;
  draftStatus: string;
  minGamesPerSeason: number;
  gamesPerMatchup: number;
}

export interface FixtureTeam {
  id: number;
  name: string;
  leagueId: number;
}

export interface FixtureMatchup {
  id: number;
  leagueId: number;
  weekNumber: number;
  team1Id: number;
  team2Id: number;
  team1Score: string | null;
  team2Score: string | null;
  status: string;
  selectedSeason: number | null;
  gamesPerMatchup: number | null;
  startTime: string | null;
  endTime: string | null;
}

export interface FixtureCareerBattingStat {
  playerId: number;
  g: number;
  pa: number;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  sb: number;
  cs: number;
  bb: number;
  so: number;
  battingAvg: number;
  onbasePerc: number;
  sluggingPerc: number;
  onbasePlusSlugging: number;
}

export interface FixtureCareerPitchingStat {
  playerId: number;
  w: number;
  l: number;
  winLossPerc: number;
  earnedRunAvg: number;
  g: number;
  gs: number;
  gf: number;
  cg: number;
  sho: number;
  sv: number;
  ip: number;
  h: number;
  r: number;
  er: number;
  hr: number;
  bb: number;
  so: number;
}

export interface FixtureCareerStats {
  battingStats: FixtureCareerBattingStat[];
  pitchingStats: FixtureCareerPitchingStat[];
}

/** All fixture collections keyed by entity name */
export interface FixtureCollections {
  players: FixturePlayer[];
  users: FixtureUser[];
  leagues: FixtureLeague[];
  teams: FixtureTeam[];
  matchups: FixtureMatchup[];
  careerStats: FixtureCareerStats;
}
