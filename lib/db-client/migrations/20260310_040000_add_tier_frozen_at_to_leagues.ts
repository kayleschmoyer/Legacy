import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add tier_frozen_at column to leagues
 *
 * Purpose:
 * - Track leagues that are frozen due to a subscription tier downgrade
 * - Distinct from frozen_at (season retirement) so the UI and queries can
 *   differentiate between "retired season" and "downgrade-restricted" leagues
 *
 * Changes:
 * - Add public.leagues.tier_frozen_at (nullable TIMESTAMPTZ)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS tier_frozen_at TIMESTAMPTZ;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
    DROP COLUMN IF EXISTS tier_frozen_at;
  `);
};
