import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add median_game_enabled column to leagues
 *
 * Purpose (LS-6344 / FLD-036):
 * - Support the premium "median game" / "all-play" scoring option: each week
 *   a team also plays the league median score in addition to its normal
 *   head-to-head matchup.
 * - Existing leagues default to disabled (median_game_enabled = false).
 *
 * Changes:
 * - leagues.median_game_enabled BOOLEAN NOT NULL DEFAULT false
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN IF NOT EXISTS median_game_enabled BOOLEAN NOT NULL DEFAULT false;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      DROP COLUMN IF EXISTS median_game_enabled;
  `);
};
