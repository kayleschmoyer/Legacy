import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add indexes to career_batting for slow sort queries
 *
 * Purpose:
 * - pg_stat_statements shows two recurring full-table scans on career_batting
 * - Query 1: ORDER BY hr DESC with g >= filter (mean 4603ms, max 6427ms)
 * - Query 2: ORDER BY offensive_war DESC with pa > filter (mean ~2300ms)
 *
 * Changes:
 * - Add idx_career_batting_g_hr on (g, hr DESC NULLS LAST)
 * - Add idx_career_batting_pa_offensive_war on (pa, offensive_war DESC NULLS LAST)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // CONCURRENTLY requires each statement to run outside a transaction block;
  // use separate execute calls so each runs in its own implicit transaction.
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_career_batting_g_hr
      ON career_batting (g, hr DESC NULLS LAST)
  `);

  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_career_batting_pa_offensive_war
      ON career_batting (pa, offensive_war DESC NULLS LAST)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_career_batting_g_hr
  `);

  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_career_batting_pa_offensive_war
  `);
};
