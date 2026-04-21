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
