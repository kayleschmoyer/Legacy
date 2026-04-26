/**
 * Shared MLB data types used by MlbDataProvider and its consumers.
 * Field names mirror the MLB stats API / MLB client schema and may require
 * explicit mapping when used with lib/scoring stat fields.
 */

// ─── Scoreboard / Game state ──────────────────────────────────────────────────

/** Normalised game-status union shared across all MLB data providers. */
export type MlbGameStatus =
  | 'Preview'
  | 'Live'
  | 'Final'
  | 'Postponed'
  | 'Suspended';

export interface MlbTeamScore {
  teamId: number;
  teamName: string;
  abbreviation: string;
  runs: number;
  hits: number;
  errors: number;
  /** Runs scored per inning (index 0 = inning 1). Null until game starts. */
  linescoreInnings: number[] | null;
}

export interface MlbGame {
  gamePk: number;
  status: MlbGameStatus;
  /** ISO 8601 scheduled start time */
  startTime: string | null;
  /** Current inning number — null for Preview/Final */
  inning: number | null;
  /** "Top" | "Bot" — null for Preview/Final */
  inningHalf: string | null;
  /** Current outs — null for Preview/Final */
  outs: number | null;
  homeTeam: MlbTeamScore;
  awayTeam: MlbTeamScore;
  venue: string | null;
}

export interface Scoreboard {
  date: string;
  lastUpdated: string;
  games: MlbGame[];
}

// ─── Detailed game feed ───────────────────────────────────────────────────────

export interface GameFeed {
  gamePk: number;
  status: MlbGameStatus;
  inning: number | null;
  inningHalf: string | null;
  outs: number | null;
  balls: number | null;
  strikes: number | null;
  homeTeam: MlbTeamScore;
  awayTeam: MlbTeamScore;
  venue: string | null;
}

// ─── Player stats ─────────────────────────────────────────────────────────────

export interface PlayerSeasonStats {
  playerId: number;
  season: number;
  group: 'hitting' | 'pitching' | 'fielding';
  // Hitting
  gamesPlayed?: number;
  atBats?: number;
  hits?: number;
  doubles?: number;
  triples?: number;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  stolenBases?: number;
  strikeOuts?: number;
  baseOnBalls?: number;
  avg?: number;
  obp?: number;
  slg?: number;
  ops?: number;
  // Pitching
  wins?: number;
  losses?: number;
  saves?: number;
  era?: number;
  inningsPitched?: number;
  earnedRuns?: number;
  whip?: number;
  strikeOutsPitching?: number;
  walksPitching?: number;
  // Fielding
  putOuts?: number;
  assists?: number;
  errors?: number;
  fieldingPercentage?: number;
}

export interface PlayerGameStats {
  playerId: number;
  gamePk: number;
  group: 'hitting' | 'pitching' | 'fielding';
  // Same stat fields as PlayerSeasonStats — single-game values
  gamesPlayed?: number;
  atBats?: number;
  hits?: number;
  doubles?: number;
  triples?: number;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  stolenBases?: number;
  strikeOuts?: number;
  baseOnBalls?: number;
  avg?: number;
  wins?: number;
  losses?: number;
  saves?: number;
  era?: number;
  inningsPitched?: number;
  earnedRuns?: number;
  whip?: number;
  strikeOutsPitching?: number;
  walksPitching?: number;
  // Fielding stats
  putOuts?: number;
  assists?: number;
  errors?: number;
  fieldingPercentage?: number;
}

// ─── Reference data ───────────────────────────────────────────────────────────

export interface ScheduleGame {
  gamePk: number;
  gameDate: string;
  status: MlbGameStatus;
  homeTeamId: number;
  awayTeamId: number;
  venue: string | null;
}

export interface ScheduleOptions {
  teamId?: number;
  sportId?: number;
}

export interface Schedule {
  date: string;
  games: ScheduleGame[];
}

export interface StandingsRecord {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  pct: number;
  gamesBack: string;
  divisionRank: number;
  leagueRank: number;
}

export interface Standings {
  season: number;
  divisions: {
    divisionId: number;
    divisionName: string;
    teams: StandingsRecord[];
  }[];
}

export interface Team {
  teamId: number;
  teamName: string;
  abbreviation: string;
  locationName: string;
  divisionId: number | null;
  leagueId: number | null;
}
