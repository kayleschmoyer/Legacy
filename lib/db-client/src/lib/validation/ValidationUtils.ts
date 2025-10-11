/**
 * Runtime validation utilities for database operations
 * These help bridge the gap between untyped database results and TypeScript types
 */

import { 
  CareerBatting, 
  CareerPitching, 
  LeagueStatusResult,
  Player,
  PlayerWithPositionStatsResult
} from '../../types';

/**
 * Validation error for when data doesn't match expected type
 */
export class ValidationError extends Error {
  constructor(message: string, public readonly receivedData: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Type guard utilities for runtime validation
 */

/**
 * Check if a value is a valid Player object
 */
export function isPlayer(obj: unknown): obj is Player {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'firstName' in obj &&
    'lastName' in obj &&
    'brefId' in obj &&
    typeof (obj as Player).id === 'number' &&
    typeof (obj as Player).firstName === 'string' &&
    typeof (obj as Player).lastName === 'string' &&
    typeof (obj as Player).brefId === 'string'
  );
}

/**
 * Check if a value is a valid CareerBatting object
 */
export function isCareerBatting(obj: unknown): obj is CareerBatting {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'playerId' in obj &&
    'g' in obj &&
    'hr' in obj &&
    typeof (obj as CareerBatting).playerId === 'number' &&
    typeof (obj as CareerBatting).g === 'number' &&
    typeof (obj as CareerBatting).hr === 'number'
  );
}

/**
 * Check if a value is a valid CareerPitching object
 */
export function isCareerPitching(obj: unknown): obj is CareerPitching {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'playerId' in obj &&
    'w' in obj &&
    'so' in obj &&
    typeof (obj as CareerPitching).playerId === 'number' &&
    typeof (obj as CareerPitching).w === 'number' &&
    typeof (obj as CareerPitching).so === 'number'
  );
}

/**
 * Validate and transform a query result array
 */
export function validateQueryResults<T>(
  results: unknown[],
  validator: (obj: unknown) => obj is T,
  context: string
): T[] {
  const validResults: T[] = [];
  const invalidResults: unknown[] = [];

  for (const result of results) {
    if (validator(result)) {
      validResults.push(result);
    } else {
      invalidResults.push(result);
    }
  }

  if (invalidResults.length > 0) {
    console.warn(`Warning: ${invalidResults.length} invalid results in ${context}`, {
      invalidResults: invalidResults.slice(0, 3), // Log first 3 for debugging
    });
  }

  return validResults;
}

/**
 * Validate a single query result with detailed error information
 */
export function validateSingleResult<T>(
  result: unknown,
  validator: (obj: unknown) => obj is T,
  context: string
): T {
  if (validator(result)) {
    return result;
  }

  throw new ValidationError(
    `Invalid ${context} data received from database`,
    result
  );
}

/**
 * Safe extraction of typed results with fallback
 */
export function safeExtractResults<T>(
  queryResult: { rows?: unknown[] } | unknown[],
  validator: (obj: unknown) => obj is T,
  context: string
): T[] {
  try {
    // Handle both direct arrays and query result objects
    const rows = Array.isArray(queryResult) ? queryResult : queryResult.rows || [];
    
    return validateQueryResults(rows, validator, context);
  } catch (error) {
    console.error(`Error extracting ${context} results:`, error);
    return [];
  }
}

/**
 * Validate database connection result
 */
export function validateDatabaseConnection(result: unknown): boolean {
  return result !== null && result !== undefined;
}

/**
 * Validate and extract count from query result
 */
export function extractCount(result: unknown): number {
  if (
    typeof result === 'object' &&
    result !== null &&
    'count' in result &&
    typeof (result as { count: unknown }).count === 'number'
  ) {
    return (result as { count: number }).count;
  }

  if (typeof result === 'number') {
    return result;
  }

  throw new ValidationError('Invalid count result', result);
}

/**
 * Validate player statistics query results with proper error handling
 */
export function validatePlayerStatsResults(results: unknown[]): PlayerWithPositionStatsResult[] {
  return validateQueryResults(
    results,
    (obj): obj is PlayerWithPositionStatsResult => {
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
    },
    'PlayerWithPositionStats'
  );
}

/**
 * Validate league status query results
 */
export function validateLeagueStatusResults(results: unknown[]): LeagueStatusResult[] {
  return validateQueryResults(
    results,
    (obj): obj is LeagueStatusResult => {
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
    },
    'LeagueStatus'
  );
}

/**
 * Utility for creating type-safe query wrappers
 */
export function createTypeSafeWrapper<T>(
  validator: (obj: unknown) => obj is T,
  context: string
) {
  return {
    validateSingle: (result: unknown): T => validateSingleResult(result, validator, context),
    validateArray: (results: unknown[]): T[] => validateQueryResults(results, validator, context),
    safeExtract: (queryResult: { rows?: unknown[] } | unknown[]): T[] => 
      safeExtractResults(queryResult, validator, context),
  };
}
