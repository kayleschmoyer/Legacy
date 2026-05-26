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

// ── NFL Season Window ─────────────────────────────────────────────────────────
//
// The NFL regular season + playoffs span September 1 through mid-February.
// Update these each year if the league schedule shifts (e.g. expanded playoffs).
// Used by EventBridge-triggered football jobs to skip off-season invocations.

/** Month (1-indexed) the NFL season begins — September. */
export const NFL_SEASON_START_MONTH = 9;
/** Day of month the NFL season begins — September 1. */
export const NFL_SEASON_START_DAY = 1;
/** Month (1-indexed) the NFL season ends — February. */
export const NFL_SEASON_END_MONTH = 2;
/** Day of month the NFL season ends — February 15 (post-Super Bowl buffer). */
export const NFL_SEASON_END_DAY = 15;

/**
 * Returns true when `date` falls within the NFL active season window
 * (September 1 through February 15, inclusive). All comparisons use UTC.
 *
 * Update NFL_SEASON_START/END constants above if the league schedule changes.
 */
export function isNflSeason(date: Date = new Date()): boolean {
  const month = date.getUTCMonth() + 1; // convert 0-indexed to 1-indexed
  const day = date.getUTCDate();
  // Sept–Dec: regular season and early playoffs
  if (month >= NFL_SEASON_START_MONTH) return true;
  // January: conference championships and Super Bowl lead-up
  if (month === 1) return true;
  // February: Super Bowl + post-game buffer through the 15th
  if (month === NFL_SEASON_END_MONTH) return day <= NFL_SEASON_END_DAY;
  // March–August: off-season
  return false;
}
