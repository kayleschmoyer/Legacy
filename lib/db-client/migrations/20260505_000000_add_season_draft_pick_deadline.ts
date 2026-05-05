import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add pick deadline columns to season_draft_games
 *
 * Purpose:
 * - Support server-authoritative countdown timers for each pick
 * - Allow different games to run at different paces
 *
 * Changes:
 * - Add pick_deadline_seconds INTEGER NOT NULL DEFAULT 60 to season_draft_games
 * - Add current_pick_deadline TIMESTAMPTZ (nullable) to season_draft_games
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE season_draft_games
      ADD COLUMN IF NOT EXISTS pick_deadline_seconds INTEGER NOT NULL DEFAULT 60,
      ADD COLUMN IF NOT EXISTS current_pick_deadline TIMESTAMP WITH TIME ZONE;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE season_draft_games
      DROP COLUMN IF EXISTS current_pick_deadline,
      DROP COLUMN IF EXISTS pick_deadline_seconds;
  `);
};
