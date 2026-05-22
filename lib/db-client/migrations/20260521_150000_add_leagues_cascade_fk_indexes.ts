import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add FK indexes for leagues cascade delete (LS-4698)
 *
 * `DELETE FROM leagues WHERE id = $1` averaged 166 ms (max 6 s) in prod
 * because cascade-delete triggers were doing seq scans on child tables
 * whose `league_id` FK columns lacked a leading-column index.
 *
 * Audit of every cascade FK referencing `leagues(id)` against the drizzle
 * schema found two child tables with no usable index on `league_id`:
 *   - matchups
 *   - matchup_messages
 *
 * All other child tables of `leagues` are already covered — either by an
 * explicit btree index on `league_id`, by a leading-column composite, or by
 * a PK/UNIQUE constraint that starts with `league_id`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchups_league_id_idx
      ON matchups USING btree (league_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_messages_league_id_idx
      ON matchup_messages USING btree (league_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`DROP INDEX IF EXISTS matchups_league_id_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchup_messages_league_id_idx;`);
};
