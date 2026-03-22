import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add bWAR column to season_batting and season_pitching
 *
 * Purpose:
 * - Baseball Reference provides bWAR (Wins Above Replacement) as a per-season
 *   stat in their career tables (data-stat="war_bat" / "war_pitch")
 * - Currently the bref-client HTML parser skips these fields because there is
 *   no StatMapping entry. This migration adds the storage column so we can
 *   begin importing the value. (LS-1651)
 *
 * Changes:
 * - Adds nullable double precision `bwar` column to season_batting
 * - Adds nullable double precision `bwar` column to season_pitching
 */

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE season_batting
    ADD COLUMN IF NOT EXISTS bwar double precision;
  `);

  await db.execute(`
    ALTER TABLE season_pitching
    ADD COLUMN IF NOT EXISTS bwar double precision;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE season_batting DROP COLUMN IF EXISTS bwar;
  `);

  await db.execute(`
    ALTER TABLE season_pitching DROP COLUMN IF EXISTS bwar;
  `);
};
