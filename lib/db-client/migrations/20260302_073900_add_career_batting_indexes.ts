import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add indexes to season_batting to speed up career_batting view
 *
 * Purpose:
 * - pg_stat_statements shows two recurring full-table scans on career_batting
 * - Query 1: ORDER BY hr DESC with g >= filter (mean 4603ms, max 6427ms)
 * - Query 2: ORDER BY offensive_war DESC with pa > filter (mean ~2300ms)
 *
 * Root cause:
 * - career_batting is a VIEW (not a table) — indexes cannot be created on views
 * - The view aggregates season_batting by player_id, so we index the base table
 *
 * Changes:
 * - Add idx_season_batting_player_g_hr on season_batting (player_id, g, hr)
 *   → covers the GROUP BY player_id and helps pre-sort g/hr for the aggregation
 * - Add idx_season_batting_player_pa on season_batting (player_id, pa)
 *   → covers the GROUP BY player_id and helps pre-sort pa for the aggregation
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_batting_player_g_hr
      ON season_batting (player_id, g, hr DESC NULLS LAST)
  `);

  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_batting_player_pa
      ON season_batting (player_id, pa DESC NULLS LAST)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_season_batting_player_g_hr
  `);

  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_season_batting_player_pa
  `);
};
