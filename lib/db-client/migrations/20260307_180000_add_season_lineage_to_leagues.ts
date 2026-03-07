import type { PgDatabase } from 'drizzle-orm/pg-core';

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Add self-referential FK for league lineage (points to the previous season's league)
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN previous_league_id integer,
      ADD COLUMN frozen_at timestamp with time zone,
      ADD COLUMN season_number integer NOT NULL DEFAULT 1
  `);

  await db.execute(`
    ALTER TABLE leagues
      ADD CONSTRAINT leagues_previous_league_id_fk
        FOREIGN KEY (previous_league_id) REFERENCES leagues (id)
  `);

  await db.execute(`
    CREATE INDEX leagues_previous_league_id_idx ON leagues (previous_league_id)
      WHERE previous_league_id IS NOT NULL
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS leagues_previous_league_id_idx
  `);

  await db.execute(`
    ALTER TABLE leagues
      DROP CONSTRAINT IF EXISTS leagues_previous_league_id_fk
  `);

  await db.execute(`
    ALTER TABLE leagues
      DROP COLUMN IF EXISTS previous_league_id,
      DROP COLUMN IF EXISTS frozen_at,
      DROP COLUMN IF EXISTS season_number
  `);
};
