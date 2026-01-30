/**
 * Type definitions for test fixtures
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
  team1Score: number | null;
  team2Score: number | null;
  status: string;
  selectedSeason: number | null;
  gamesPerMatchup: number | null;
  startTime: string | null;
  endTime: string | null;
}

export interface FixtureCareerStats {
  playerId: number;
  [key: string]: any; // Allow additional stat properties
}

export interface FixtureCareerStatsCollection {
  battingStats: FixtureCareerStats[];
  pitchingStats: FixtureCareerStats[];
}
