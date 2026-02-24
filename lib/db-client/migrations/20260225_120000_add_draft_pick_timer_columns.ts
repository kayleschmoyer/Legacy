import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add draft pick timer columns
 *
 * Purpose:
 * - Support deadline-based draft pick timers with automatic auto-pick
 * - Allow commissioners to configure per-league pick time limits
 *
 * Changes:
 * - Add pick_time_limit_seconds (integer, default 120) to drafts table
 * - Add current_pick_deadline (timestamptz, nullable) to drafts table
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE drafts
    ADD COLUMN pick_time_limit_seconds INTEGER NOT NULL DEFAULT 120,
    ADD COLUMN current_pick_deadline TIMESTAMP WITH TIME ZONE;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE drafts
    DROP COLUMN IF EXISTS current_pick_deadline,
    DROP COLUMN IF EXISTS pick_time_limit_seconds;
  `);
};
