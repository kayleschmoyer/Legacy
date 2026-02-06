/**
 * Utility functions for identifying and filtering baseball leagues
 */

/**
 * Negro League IDs that don't have game-level statistics available on Baseball Reference
 * These leagues only have season-level data, so players cannot be assigned individual games
 */
export const NEGRO_LEAGUE_IDS = Object.freeze(
  new Set([
    'NNL', // Negro National League
    'NAL', // Negro American League
    'ANL', // Another Negro League variant
    'EWL', // East-West League
    'ECL', // Eastern Colored League
    'NSL', // Negro Southern League
    'NN2', // Negro National League II
    '2LG', // Two-league (likely Negro leagues)
  ]),
);

/**
 * Major league IDs that have full game-level statistics
 */
export const MAJOR_LEAGUE_IDS = Object.freeze(
  new Set([
    'AL', // American League
    'NL', // National League
  ]),
);

/**
 * Check if a league ID represents a Negro League
 * @param lgId - League ID from season stats (lg_id column)
 * @returns true if the league is a Negro League without game-level data
 */
export function isNegroLeague(lgId: string | null | undefined): boolean {
  if (!lgId) return false;
  return NEGRO_LEAGUE_IDS.has(lgId);
}

/**
 * Check if a league ID represents a major league with game-level data
 * @param lgId - League ID from season stats (lg_id column)
 * @returns true if the league has full game-level statistics available
 */
export function isMajorLeague(lgId: string | null | undefined): boolean {
  if (!lgId) return false;
  return MAJOR_LEAGUE_IDS.has(lgId);
}

/**
 * Check if a season is eligible for matchup game selection
 * A season is eligible if it's NOT from a Negro League (which lacks game-level data)
 * @param lgId - League ID from season stats
 * @returns true if the season can be used for game selection
 */
export function isSeasonEligibleForGameSelection(
  lgId: string | null | undefined,
): boolean {
  // Exclude Negro Leagues (no game data available)
  if (isNegroLeague(lgId)) return false;

  // Include major leagues (AL/NL) and other minor leagues that have game data
  return true;
}
