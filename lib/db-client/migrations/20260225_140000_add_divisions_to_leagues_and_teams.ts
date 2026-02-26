import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add divisions support to leagues and teams
 *
 * Purpose:
 * - Support the default league format: 12 teams, 2 divisions, 10 weeks, division play only
 * - Store number_of_divisions on the league for configuration reference
 * - Store division_id on each team so divisional scheduling can group teams
 *
 * Changes:
 * - Add number_of_divisions column to leagues (integer DEFAULT 2 NOT NULL)
 * - Add division_id column to teams (integer, nullable — null means unassigned)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS number_of_divisions INTEGER NOT NULL DEFAULT 2;

    ALTER TABLE public.teams
    ADD COLUMN IF NOT EXISTS division_id INTEGER;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.teams
    DROP COLUMN IF EXISTS division_id;

    ALTER TABLE public.leagues
    DROP COLUMN IF EXISTS number_of_divisions;
  `);
};
