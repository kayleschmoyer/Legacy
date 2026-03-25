import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Rename season_pitching.bwar → pwar
 *
 * The `bwar` column on season_pitching was incorrectly named — it stores
 * pitcher WAR from Baseball Reference, which is a fundamentally different
 * metric from position-player bWAR stored in season_batting.bwar.
 *
 * Renaming to `pwar` eliminates the naming collision and makes the data
 * pipeline unambiguous. (LS-1851)
 */

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE season_pitching
    RENAME COLUMN bwar TO pwar;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE season_pitching
    RENAME COLUMN pwar TO bwar;
  `);
};
