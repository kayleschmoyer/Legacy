/**
 * Season-related constants for data availability
 *
 * Baseball-Reference only has complete game-level data from 1901 onwards.
 * Pre-1901 seasons have incomplete or missing game logs, which causes
 * stats loading failures.
 */

/**
 * Minimum season year with reliable game-level data on Baseball-Reference.
 * Any season before this year should be filtered out to avoid stats loading failures.
 */
export const MIN_SEASON_WITH_GAME_DATA = 1901;

/**
 * Number of matchup periods in a full season.
 * Used to calculate the minimum games threshold for player eligibility and
 * fantasy-points-per-game (FPG) computations: minGames = gamesPerMatchup * SEASON_MATCHUP_MULTIPLIER.
 */
export const SEASON_MATCHUP_MULTIPLIER = 2;

/**
 * Check if a season has reliable game-level data available
 * @param season - The season year to check
 * @returns true if the season has game-level data, false otherwise
 */
export function hasGameLevelData(season: number): boolean {
  return season >= MIN_SEASON_WITH_GAME_DATA;
}
