// Players feature exports
export { FreeAgents } from './FreeAgents';
export { PlayerDetail, PlayerDetailById } from './PlayerDetail';
export { PlayerRow } from './PlayerRow';
export { PlayersGrid } from './PlayersGrid';
export {
  PlayersStatsTable,
  BASEBALL_STAT_COLUMNS,
  sortPlayers,
} from './PlayersStatsTable';
export type { StatColumn, PlayersStatsTableProps } from './PlayersStatsTable';
export { PlayersTable } from './PlayersTable';

// Player comparison (shared, cross-platform — LS-7804)
export {
  PlayerComparison,
  PLAYER_COMPARISON_FEATURE_DESCRIPTION,
} from './PlayerComparison';
export type { PlayerComparisonProps } from './PlayerComparison';

// Advanced player statistics components
export {
  PlayerStatsDataGrid,
  BATTING_SORT_FIELDS,
  isValidBattingSortField,
} from './PlayerStatsDataGrid';
export { PitchingStatsDataGrid } from './PitchingStatsDataGrid';
export {
  normalizeViewMode,
  PlayerStatsPage,
  STATS_COLUMN_GROUPS,
  STATS_TOGGLEABLE_COLUMN_KEYS,
  battingSortFilter,
  DEFAULT_BATTING_SORT_BY,
  DEFAULT_BATTING_SORT_DIR,
} from './PlayerStatsPage';
export type { ExportFormat, PlayerStatsExportData } from './PlayerStatsPage';

// NFL player statistics — sport-agnostic shell binding (LS-8442)
export { FootballStatsPage } from './FootballStatsPage';
export type { FootballStatsPageProps } from './football/footballStatsConfig';
export type {
  FootballStatsFilters,
  FootballStatsView,
} from './football/footballStatsHelpers';
export {
  isFootballSortField,
  normalizeFootballView,
  parseFootballPositions,
} from './football/footballStatsHelpers';

// Players tab card feed — mobile-first card feed redesign (LS-8832)
export * from './cardFeed';

// Column-visibility helpers + serialization (LS-7105 / PST-001)
export {
  NO_COLUMNS_SENTINEL,
  parseVisibleColumns,
  serializeVisibleColumns,
} from './columnVisibility';
export type { StatsFormat } from './columnVisibility';

// Career statistics services and types
export * from './services/CareerStatsService';

// Player statistics types and utilities
export type {
  PlayerStatsColumn,
  PlayerStatsViewMode,
  PlayerStatsFilters,
  PlayerWithStats,
} from './PlayerStatsTypes';

// Projections
export {
  usePlayerProjections,
  formatProjection,
  type BaseballScoringSettings,
  type PlayerCareerStats,
  type ScoringStatRecord,
  type PlayerProjectionsResult,
  type ProjectionMap,
} from './usePlayerProjections';

// API exports
export * from './PlayersApi';

// Types
export type { PlayerRowData, PlayerRowProps } from './PlayerRow';
export type { PlayersGridProps, PlayersViewMode } from './PlayersGrid';
export type { PlayersTableProps } from './PlayersTable';
export type { LeagueOption } from './shell/LeaguePicker';
