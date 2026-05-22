import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Migration: Add ORDER BY indexes for career_batting / career_pitching leaderboards (LS-4695)
 *
 * Purpose:
 * - pg_stat_statements shows the top-hitters leaderboard `SELECT ... FROM career_batting
 *   WHERE g >= $1 ORDER BY hr DESC NULLS LAST LIMIT $2` at 327 ms mean (729 s total over
 *   2,228 calls), and the top-wins pitching equivalent (ORDER BY w DESC) at 196 ms mean
 *   (438 s total). Both fall back to a Sort node because no index supports the ORDER BY.
 * - `minGames` is a caller-supplied parameter (TypeSafeQueryBuilder + StatisticsService)
 *   so a partial index `WHERE g >= 100` would not be usable for all callers — the planner
 *   cannot prove `g >= $1` implies `g >= 100` when $1 is unknown. A plain DESC index lets
 *   Postgres walk the index in order, apply the g filter during the scan, and stop once
 *   LIMIT is reached, regardless of threshold.
 *
 * Changes:
 * - idx_career_batting_hr  on career_batting  (hr DESC NULLS LAST)
 * - idx_career_pitching_w  on career_pitching (w  DESC NULLS LAST)
 *
 * CONCURRENTLY mirrors the pattern in 20260302_073900_add_career_batting_indexes.ts so
 * writers (REFRESH MATERIALIZED VIEW CONCURRENTLY) are not blocked while the index builds.
 */

export const up = async ({ db }: { db: PostgresJsDatabase }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_career_batting_hr
      ON career_batting (hr DESC NULLS LAST)
  `);

  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_career_pitching_w
      ON career_pitching (w DESC NULLS LAST)
  `);
};

export const down = async ({ db }: { db: PostgresJsDatabase }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_career_batting_hr
  `);

  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_career_pitching_w
  `);
};
