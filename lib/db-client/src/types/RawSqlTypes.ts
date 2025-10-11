/**
 * Type definitions for raw SQL query results
 * These interfaces provide type safety for database introspection and script operations
 * that bypass Drizzle's schema-based typing
 */

/**
 * Database introspection result types for schema verification
 */
export interface DatabaseIntrospectionResult {
  enum_exists: boolean;
  column_exists: boolean;
  table_exists: boolean;
}

export interface EnumValueResult {
  enumlabel: string;
}

export interface MigrationHistoryResult {
  hash: string;
  created_at: Date;
}

/**
 * Player query result types for debug scripts
 */
export interface PlayerWithPositionStatsResult {
  id: number;
  first_name: string;
  last_name: string;
  bref_id: string;
  max_fielding_games?: number;
  pitching_games?: number;
  pitching_starts?: number;
  batting_games?: number;
}

export interface PlayerFieldingStatsResult {
  player_id: number;
  pos: string;
  g: number;
  first_name: string;
  last_name: string;
}

export interface PlayerPitchingStatsResult {
  player_id: number;
  g: number;
  gs: number;
  first_name: string;
  last_name: string;
}

export interface PlayerBattingStatsResult {
  player_id: number;
  g: number;
  ab: number;
  h: number;
  first_name: string;
  last_name: string;
}

/**
 * League and draft status query results
 */
export interface LeagueStatusResult {
  id: number;
  name: string;
  draft_status: string;
  owner: string;
}

export interface DraftStatusUpdateResult {
  id: number;
  name: string;
  draft_status: string;
}

/**
 * Statistical count results
 */
export interface CountResult {
  count: number;
}

/**
 * Games distribution analysis results
 */
export interface GamesDistributionResult {
  first_name: string;
  last_name: string;
  max_fielding_games: number;
  pitching_games: number;
  pitching_starts: number;
  batting_games: number;
}

/**
 * Type guards for runtime validation of raw SQL results
 */
export function isDatabaseIntrospectionResult(obj: unknown): obj is DatabaseIntrospectionResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('enum_exists' in obj || 'column_exists' in obj || 'table_exists' in obj)
  );
}

export function isEnumValueResult(obj: unknown): obj is EnumValueResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'enumlabel' in obj &&
    typeof (obj as EnumValueResult).enumlabel === 'string'
  );
}

export function isPlayerWithPositionStatsResult(obj: unknown): obj is PlayerWithPositionStatsResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'first_name' in obj &&
    'last_name' in obj &&
    'bref_id' in obj &&
    typeof (obj as PlayerWithPositionStatsResult).id === 'number' &&
    typeof (obj as PlayerWithPositionStatsResult).first_name === 'string' &&
    typeof (obj as PlayerWithPositionStatsResult).last_name === 'string' &&
    typeof (obj as PlayerWithPositionStatsResult).bref_id === 'string'
  );
}

export function isLeagueStatusResult(obj: unknown): obj is LeagueStatusResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'draft_status' in obj &&
    'owner' in obj &&
    typeof (obj as LeagueStatusResult).id === 'number' &&
    typeof (obj as LeagueStatusResult).name === 'string' &&
    typeof (obj as LeagueStatusResult).draft_status === 'string' &&
    typeof (obj as LeagueStatusResult).owner === 'string'
  );
}

export function isCountResult(obj: unknown): obj is CountResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'count' in obj &&
    typeof (obj as CountResult).count === 'number'
  );
}

/**
 * Utility function to safely extract typed results from raw SQL queries
 */
export function extractTypedResults<T>(
  results: { rows: unknown[] },
  typeGuard: (obj: unknown) => obj is T
): T[] {
  return results.rows.filter(typeGuard);
}

/**
 * Safe single result extractor with proper error handling
 */
export function extractSingleTypedResult<T>(
  results: { rows: unknown[] },
  typeGuard: (obj: unknown) => obj is T
): T | null {
  if (results.rows.length === 0) {
    return null;
  }
  
  const firstRow = results.rows[0];
  if (typeGuard(firstRow)) {
    return firstRow;
  }
  
  throw new Error('Query result does not match expected type');
}
