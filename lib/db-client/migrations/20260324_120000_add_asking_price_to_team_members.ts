import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add asking_price to team_members (LS-1814)
 *
 * Purpose:
 * - Allows managers to specify an optional starting/asking price when listing
 *   a player on the trade block, so other managers know what is expected in return.
 *
 * Changes:
 * - Add `asking_price TEXT` (nullable) to public.team_members
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.team_members
      ADD COLUMN IF NOT EXISTS asking_price TEXT;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.team_members
      DROP COLUMN IF EXISTS asking_price;
  `);
};
