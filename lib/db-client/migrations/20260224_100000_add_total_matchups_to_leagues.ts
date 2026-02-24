import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add total_matchups to leagues
 *
 * Purpose:
 * - Store a league-level setting for the total number of matchup weeks in a season
 * - Default is 10 weeks
 * - When the draft completes, all matchups are created at once up to this limit
 * - When edited, matchups are added or removed to match the new total
 *
 * Changes:
 * - Add total_matchups column to leagues (integer DEFAULT 10 NOT NULL)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS total_matchups INTEGER NOT NULL DEFAULT 10;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
    DROP COLUMN IF EXISTS total_matchups;
  `);
};
