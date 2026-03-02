/**
 * Season Selector - re-exported from @legacy-sports/db-client
 *
 * The implementation was moved to lib/db-client so it can be shared with
 * lambdas/draft-processor without cross-lambda imports.
 */
export {
  selectSeasonsForPlayers,
  type PlayerSeasonStats,
  type SeasonSelection,
  type SeasonSelectionResult,
} from '@legacy-sports/db-client';
