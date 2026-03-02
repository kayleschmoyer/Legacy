import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add indexes to speed up the draft-pool available-player query
 *
 * Purpose:
 * - The getAvailableDraftPlayers query performs correlated subqueries on
 *   career_batting and season_batting filtered by player_id. Without indexes
 *   these resolve to sequential scans that grow expensive as player counts
 *   increase.
 *
 * Changes:
 * - idx_career_batting_player_g: composite index on (player_id, g) so the
 *   "g >= minCareerGames" filter can be satisfied with an index-only scan.
 * - idx_season_batting_player_lgid_season: composite index on
 *   (player_id, lg_id, season) so COUNT(DISTINCT season) group-bys used in
 *   the minCareerSeasons filter can be resolved via index without a full
 *   season_batting scan.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_career_batting_player_g
      ON public.career_batting (player_id, g);
  `);

  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_batting_player_lgid_season
      ON public.season_batting (player_id, lg_id, season);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS public.idx_career_batting_player_g;
  `);

  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS public.idx_season_batting_player_lgid_season;
  `);
};
