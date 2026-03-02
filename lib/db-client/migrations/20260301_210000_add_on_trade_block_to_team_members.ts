import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add on_trade_block flag to team_members
 *
 * Purpose:
 * - Enables managers to explicitly mark roster players as available for trade
 * - Backs the real trade block GraphQL query/mutation (replacing the stub that
 *   inferred bench players as trade candidates)
 *
 * Changes:
 * - Add `on_trade_block BOOLEAN NOT NULL DEFAULT FALSE` to public.team_members
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.team_members
      ADD COLUMN IF NOT EXISTS on_trade_block BOOLEAN NOT NULL DEFAULT FALSE;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.team_members
      DROP COLUMN IF EXISTS on_trade_block;
  `);
};
