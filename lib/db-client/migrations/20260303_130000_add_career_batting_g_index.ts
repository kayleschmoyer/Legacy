import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add index on career_batting.g for eligibility threshold queries (LS-436)
 *
 * Purpose:
 * - pg_stat_statements showed repeated near-full-scan queries filtering on
 *   career_batting.g (total career games played):
 *     SELECT count(*) FROM career_batting WHERE g >= ?
 *       293 calls × 333ms mean = 97s total (1.8% DB time)
 *       50 calls × 1,200ms mean = 60s total (1.1% DB time)
 *     SELECT player_id, … FROM career_batting WHERE g >= ? ORDER BY …
 *       138 calls × 431ms, 39 calls × 464ms, 82 calls × 765ms
 * - career_batting was previously a plain VIEW backed by complex CTEs; PostgreSQL
 *   cannot index a view column or an aggregate, so every WHERE g >= N required a
 *   full re-aggregation of all player data.
 * - LS-433 converts career_batting to a MATERIALIZED VIEW and includes this g
 *   index in its migration.  This migration is a standalone idempotent guard:
 *   IF NOT EXISTS ensures it is a no-op when LS-433 ran first (the expected
 *   production path), and it remains safe to run in any order.
 *
 * Changes:
 * - CREATE INDEX IF NOT EXISTS idx_career_batting_g ON public.career_batting (g)
 *
 * Expected impact:
 * - Count/filter queries drop from 333–1,200ms to <5ms after materialization.
 * - IS a no-op when this index already exists (created by LS-433).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Idempotent: no-op if LS-433 already created this index as part of
  // materializing the career_batting view.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_career_batting_g
      ON public.career_batting (g)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS public.idx_career_batting_g
  `);
};
