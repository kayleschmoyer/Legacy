import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Remove unique constraint on (league_id, week_number) from matchups table
 *
 * The constraint was preventing multiple matchups in the same week for a league,
 * which is required for proper league scheduling (multiple team pairings per week).
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop the unique constraint (actual constraint name from database)
  await db.execute(`
    ALTER TABLE matchups 
    DROP CONSTRAINT IF EXISTS matchups_league_id_week_number_unique;
  `);

  console.log(
    '✓ Removed unique constraint matchups_league_id_week_number_unique from matchups table',
  );
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Re-add the unique constraint (for rollback)
  await db.execute(`
    ALTER TABLE matchups 
    ADD CONSTRAINT matchups_league_id_week_number_unique UNIQUE (league_id, week_number);
  `);

  console.log(
    '✓ Re-added unique constraint matchups_league_id_week_number_unique to matchups table',
  );
};
