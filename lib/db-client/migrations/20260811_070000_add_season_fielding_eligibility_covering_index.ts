import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add covering index on season_fielding (player_id, season, lg_id) (LS-9317)
 *
 * Purpose:
 * - The draft-processor buildPlayerPool fielding-eligibility query
 *   (WHERE player_id = ANY($1) AND season >= $2 AND (lg_id IS NULL OR
 *   lg_id NOT IN (...))) had no index covering `season`/`lg_id`, so it fell
 *   back to a bitmap scan of season_fielding_pk — (player_id, season, pos,
 *   team, row_id) — followed by a heap fetch per row to read `g`/`lg_id`.
 *   pg_stat_statements on dev RDS showed this query at 1,767 calls, mean
 *   827.55ms, max 33.9s.
 *
 * - season_batting already has a covering index for its equivalent
 *   eligibility query (idx_season_batting_player_lgid_season, added by
 *   20260302_120000_add_draft_pool_query_indexes) — this closes the same
 *   gap for season_fielding.
 *
 * Changes:
 * - idx_season_fielding_player_season_lgid: composite index on
 *   (player_id, season, lg_id) INCLUDE (g) so the eligibility scan can be
 *   satisfied with an index-only scan (season/lg_id filters resolved in the
 *   index; `g` returned without a heap fetch).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_fielding_player_season_lgid
      ON public.season_fielding (player_id, season, lg_id) INCLUDE (g);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS public.idx_season_fielding_player_season_lgid;
  `);
};
