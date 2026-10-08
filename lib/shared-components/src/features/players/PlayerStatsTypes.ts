/**
 * Type definitions for Player Statistics feature
 */

// Player statistics filter interface
export interface PlayerStatsFilters {
  // Team and Position filters
  team?: string;
  position?: string;
  playerType?: string;

  // Games filters
  minGames?: number;
  maxGames?: number;

  // Batting statistics filters
  minHomeRuns?: number;
  maxHomeRuns?: number;
  minRBI?: number;
  maxRBI?: number;
  minBattingAvg?: number;
  maxBattingAvg?: number;

  // Search functionality
  searchTerm?: string;

  // Sort persistence — the batting grid's sort column + direction so a shared
  // URL restores the user's chosen sort instead of reverting to the HR default
  // (LS-7115 / PST-022). `sortBy` is the GraphQL sort field (e.g. 'homeRuns',
  // 'battingAverage'); `sortDir` is the order direction.
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  // Pitching grid sort, persisted independently of the batting sort so the
  // Combined view can carry both (LS-10690). `pitchingSortBy` is the GraphQL
  // `careerPitchingStats` orderBy field (e.g. 'outsRecorded', 'whip').
  pitchingSortBy?: string;
  pitchingSortDir?: 'asc' | 'desc';

  // Pitching statistics filters
  minWins?: number;
  maxWins?: number;
  minERA?: number;
  maxERA?: number;
  minStrikeouts?: number;
  maxStrikeouts?: number;

  // Date range filters
  activeSince?: string;
  activeUntil?: string;

  // Availability filter — free agents / rostered in user's fantasy leagues
  availabilityFilter?: 'all' | 'free_agents' | 'rostered';
}

// Player with statistics interface for the PlayerStats feature
export interface PlayerWithStats {
  id: number | string;
  name: string;
  firstName?: string;
  lastName?: string;
  // Add any additional statistics properties as needed
  stats?: Record<string, unknown>;
}

// Column configuration for statistics tables
export interface PlayerStatsColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

// Player statistics view modes
export type PlayerStatsViewMode =
  | 'batting'
  | 'pitching'
  | 'fielding'
  | 'combined'
  | 'hitters'
  | 'pitchers';
