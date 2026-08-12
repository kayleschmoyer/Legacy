import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add "Control All Teams" premium mock draft mode (LS-9253)
 *
 * Purpose: Let a mock draft be flagged so every team is human-controlled —
 * no CPU auto-picking anywhere on the board. Mirrors the
 * leagues.is_offline_draft boolean pattern.
 *
 * Changes:
 * - Adds leagues.control_all_teams boolean (default false)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
      ADD COLUMN IF NOT EXISTS control_all_teams BOOLEAN NOT NULL DEFAULT false;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
      DROP COLUMN IF EXISTS control_all_teams;
  `);
};
