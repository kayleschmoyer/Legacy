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
 * Absolute floor on the number of games a player must have played in a season
 * before that season may be assigned for game selection (LS-9534).
 *
 * Why a floor exists at all: game selection draws one distinct game per matchup
 * slot and only repeats a game once the distinct pool is exhausted. When a
 * season's game pool is barely larger than `gamesPerMatchup`, the draw stops
 * being a draw — the matchup consumes most or all of the season, and the same
 * game lands in several slots.
 *
 * Why 25 and not "a bit more than `gamesPerMatchup`":
 * - The pre-existing floor is `gamesPerMatchup * SEASON_MATCHUP_MULTIPLIER`,
 *   i.e. 10 games for the default 5-game matchup and 14 for a 7-game one. At
 *   10, a matchup consumes half the season; concentration is still heavy.
 * - LS-9532 changes scoring so a repeated game counts once per *slot* rather
 *   than once per game. That makes a thin season strictly better than a deep
 *   one — five slots on one great game beats five average games — so the floor
 *   is the mitigation and has to be high enough to remove the incentive.
 * - 25 caps a default 5-game matchup at 20% of the season (5/25) and a 7-game
 *   matchup at 28%. Below that ratio the lineup is a sample of the season;
 *   above it, it is most of the season.
 * - Measured on dev RDS (2026-08-22, 269 duplicated
 *   `(matchup_player_id, game_identifier)` pairs across 143 distinct
 *   player-seasons): 42% of those player-seasons are under 25 games. The
 *   remaining tail runs past 100 games, which is not season thinness — it is
 *   game-log cache warm-up and the SP `GS=1` filter narrowing the pool, and no
 *   season floor addresses it.
 * - 40 (≈ a quarter season) was rejected: it covers 59% of the thin-season
 *   cases but pushes 198 of 728 rostered dev players (27%) onto the fallback
 *   floor below, collapsing a random season choice into a fixed one for over a
 *   quarter of the league. 25 costs 25 additional players (3.4%).
 */
export const MIN_SEASON_GAMES_FOR_SELECTION = 25;

/** Which floor produced the eligible season list returned by {@link resolveEligibleSeasons}. */
export type SeasonEligibilityTier = 'preferred' | 'fallback' | 'none';

export interface EligibleSeasons {
  /** Seasons that may be assigned, from the best tier that yielded any. */
  seasons: number[];
  /** The games-played floor the returned seasons actually cleared. */
  minGamesApplied: number;
  /** `preferred` = cleared MIN_SEASON_GAMES_FOR_SELECTION, `fallback` = cleared only the matchup floor. */
  tier: SeasonEligibilityTier;
}

/**
 * Resolve which of a player's seasons may be assigned for game selection.
 *
 * Two tiers, applied in order (LS-9534):
 * 1. **preferred** — seasons with at least
 *    `max(matchupMinGames, MIN_SEASON_GAMES_FOR_SELECTION)` games. Whenever the
 *    player has one, only these are eligible.
 * 2. **fallback** — seasons clearing only `matchupMinGames`. Used solely when
 *    tier 1 is empty, so a player whose entire career is short (a career
 *    backup, a September call-up) keeps the eligibility they have today rather
 *    than dropping out of the matchup. The fallback deliberately does not go
 *    below `matchupMinGames`: doing so would newly admit 1- and 2-game seasons,
 *    which under LS-9532's per-slot scoring are the strongest concentration
 *    vector of all.
 *
 * `tier: 'none'` means the player has no assignable season — callers must skip
 * the player gracefully, never throw.
 *
 * @param seasonGames - season -> games played (already max/summed across stat types)
 * @param matchupMinGames - the league's own floor, `gamesPerMatchup * SEASON_MATCHUP_MULTIPLIER`
 */
export function resolveEligibleSeasons(
  seasonGames: ReadonlyMap<number, number>,
  matchupMinGames: number,
): EligibleSeasons {
  const preferredFloor = Math.max(
    matchupMinGames,
    MIN_SEASON_GAMES_FOR_SELECTION,
  );

  const clearing = (floor: number): number[] => {
    const seasons: number[] = [];
    seasonGames.forEach((games, season) => {
      if (games >= floor) seasons.push(season);
    });
    return seasons.sort((a, b) => a - b);
  };

  const preferred = clearing(preferredFloor);
  if (preferred.length > 0) {
    return {
      seasons: preferred,
      minGamesApplied: preferredFloor,
      tier: 'preferred',
    };
  }

  const fallback = clearing(matchupMinGames);
  if (fallback.length > 0) {
    return {
      seasons: fallback,
      minGamesApplied: matchupMinGames,
      tier: 'fallback',
    };
  }

  return { seasons: [], minGamesApplied: matchupMinGames, tier: 'none' };
}

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
