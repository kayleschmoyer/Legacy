import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add covering index for career year range loader (LS-1079)
 *
 * Purpose:
 * - Adds idx_season_batting_player_lgid_season to support the
 *   createCareerYearRangeLoader query that computes MIN/MAX season per player.
 * - The index covers (player_id, lg_id, season), enabling PostgreSQL to satisfy
 *   MIN/MAX aggregation via an index-only scan without accessing the heap.
 *
 * Changes:
 * - CREATE INDEX CONCURRENTLY idx_season_batting_player_lgid_season
 *   ON public.season_batting (player_id ASC NULLS LAST, lg_id ASC NULLS LAST, season ASC NULLS LAST)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_batting_player_lgid_season
    ON public.season_batting (player_id ASC NULLS LAST, lg_id ASC NULLS LAST, season ASC NULLS LAST)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_season_batting_player_lgid_season
  `);
};
