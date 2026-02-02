/**
 * Core types for matchup scheduling system
 */

/** Team information for scheduling */
export interface TeamInfo {
  id: number;
  name: string;
  leagueId: number;
  divisionId?: number; // Optional for divisional scheduling
}

/** League configuration for scheduling */
export interface LeagueConfig {
  id: number;
  minGamesPerSeason: number; // Minimum games a player needs in a season for eligibility
  gamesPerMatchup: number; // Number of games to select per matchup
}

/** Matchup pairing between two teams */
export interface MatchupPairing {
  team1Id: number;
  team2Id: number;
  weekNumber: number;
  gamesPerMatchup: number;
}

/** A scheduled matchup with full details */
export interface ScheduledMatchup {
  weekNumber: number;
  leagueId: number;
  team1Id: number | null; // null for bye weeks
  team2Id: number | null; // null for bye weeks
  gamesPerMatchup: number | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

/** Season eligibility information */
export interface SeasonInfo {
  season: number;
  eligibleTeamIds: number[]; // Teams that have all players with sufficient games
  totalGames: number; // Total games available in this season
}

/** Parameters for generating a schedule */
export interface ScheduleParams {
  teams: TeamInfo[];
  numberOfWeeks: number;
  leagueConfig: LeagueConfig;
  eligibleSeasons: SeasonInfo[];
}

/** Result of schedule generation */
export interface ScheduleResult {
  matchups: ScheduledMatchup[];
  seasonUsage: Map<number, number>; // season -> count of matchups using it
  warnings: string[]; // Any warnings about the generated schedule
}

/** Scheduling strategy type */
export type SchedulingStrategy = 'round-robin' | 'divisional' | 'random';

/** Player game count for season eligibility */
export interface PlayerGameCount {
  playerId: number;
  season: number;
  gamesPlayed: number;
}

/** Team roster information for season eligibility */
export interface TeamRoster {
  teamId: number;
  playerIds: number[];
}
