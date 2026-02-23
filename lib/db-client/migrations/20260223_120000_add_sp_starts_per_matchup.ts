import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add sp_starts_per_matchup columns
 *
 * Purpose:
 * - Allow leagues to configure how many games (starts) a starting pitcher
 *   gets per matchup.
 * - Copy the league setting onto individual matchups so changes mid-matchup
 *   are prevented.
 *
 * Changes:
 * - Add sp_starts_per_matchup column to leagues table (default 1)
 * - Add sp_starts_per_matchup column to matchups table (nullable — copied from league at matchup creation)
 * - Backfill existing matchups with the default value of 1
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Add column to leagues table
  await db.execute(`
    ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS sp_starts_per_matchup INTEGER NOT NULL DEFAULT 1;
  `);

  // Add column to matchups table (nullable — will be set at matchup creation)
  await db.execute(`
    ALTER TABLE public.matchups
    ADD COLUMN IF NOT EXISTS sp_starts_per_matchup INTEGER;
  `);

  // Backfill existing matchups with the league's current setting
  await db.execute(`
    UPDATE public.matchups m
    SET sp_starts_per_matchup = COALESCE(l.sp_starts_per_matchup, 1)
    FROM public.leagues l
    WHERE m.league_id = l.id
      AND m.sp_starts_per_matchup IS NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.matchups DROP COLUMN IF EXISTS sp_starts_per_matchup;
  `);

  await db.execute(`
    ALTER TABLE public.leagues DROP COLUMN IF EXISTS sp_starts_per_matchup;
  `);
};
