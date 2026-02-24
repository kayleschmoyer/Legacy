import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add minimum career games and seasons settings to leagues
 *
 * Purpose:
 * - Allow commissioners to configure minimum career games played (default 50)
 *   and minimum career seasons (default 3) for their league
 * - These thresholds gate whether a player is eligible to appear in the draft
 *   player pool, on the free agents page, and whether they are considered
 *   eligible when placed in a starting roster slot
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN IF NOT EXISTS min_career_games   INTEGER NOT NULL DEFAULT 50,
      ADD COLUMN IF NOT EXISTS min_career_seasons INTEGER NOT NULL DEFAULT 3;

    COMMENT ON COLUMN leagues.min_career_games   IS 'Minimum career MLB games a player must have to appear in the player pool (draft / free agents). Default 50.';
    COMMENT ON COLUMN leagues.min_career_seasons IS 'Minimum distinct MLB seasons a player must have to appear in the player pool (draft / free agents). Default 3.';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      DROP COLUMN IF EXISTS min_career_games,
      DROP COLUMN IF EXISTS min_career_seasons;
  `);
};
