import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add offline mock draft mode (LS-9144)
 *
 * Purpose: Let a mock draft be flagged as "offline" (solo practice, no pick
 * clock pressure, pausable) as distinct from the existing timed "shared"
 * mode. Mirrors the leagues.is_mock_draft boolean pattern.
 *
 * Changes:
 * - Adds leagues.is_offline_draft boolean (default false)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
      ADD COLUMN IF NOT EXISTS is_offline_draft BOOLEAN NOT NULL DEFAULT false;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
      DROP COLUMN IF EXISTS is_offline_draft;
  `);
};
