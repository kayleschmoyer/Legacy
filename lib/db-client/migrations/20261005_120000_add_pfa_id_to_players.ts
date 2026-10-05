import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add players.pfa_id (LS-10588, ADR 0023)
 *
 * Pro Football Archives player id for football players that have no
 * obtainable pfr_id (careers that ended before nflverse's 1974 players.csv
 * floor, e.g. Johnny Unitas). Those rows keep pfr_id NULL and use
 * bref_id = 'pfa-' || pfa_id; the per-game corpus key is
 * pfr_id ?? 'pfa-' || pfa_id.
 *
 * Partial unique index, same shape as players_pfr_id_unique: one row per
 * pfa_id when set, any number of NULLs. Additive only — nothing reads the
 * column until the seed-pfa-football-players command writes it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "pfa_id" VARCHAR(20);
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS players_pfa_id_unique
      ON "public"."players" (pfa_id)
      WHERE pfa_id IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP INDEX IF EXISTS "public"."players_pfa_id_unique";`);
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "pfa_id";
  `);
};
