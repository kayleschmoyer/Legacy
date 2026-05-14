import type { PgDatabase } from 'drizzle-orm/pg-core';

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // The leagues_previous_league_id_fk constraint was added in
  // 20260307_180000_add_season_lineage_to_leagues without an ON DELETE action,
  // which defaults to NO ACTION. This blocks deletion of any league that is
  // referenced as the previous season by another league.
  // Re-create the constraint with ON DELETE SET NULL so deleting a prior-season
  // league severs the lineage link rather than blocking the delete.
  await db.execute(`
    ALTER TABLE leagues
      DROP CONSTRAINT IF EXISTS leagues_previous_league_id_fk
  `);

  await db.execute(`
    ALTER TABLE leagues
      ADD CONSTRAINT leagues_previous_league_id_fk
        FOREIGN KEY (previous_league_id) REFERENCES leagues (id)
        ON DELETE SET NULL
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      DROP CONSTRAINT IF EXISTS leagues_previous_league_id_fk
  `);

  await db.execute(`
    ALTER TABLE leagues
      ADD CONSTRAINT leagues_previous_league_id_fk
        FOREIGN KEY (previous_league_id) REFERENCES leagues (id)
  `);
};
