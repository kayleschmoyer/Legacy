import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';

/**
 * Migration: Add injury_status, injury_designation, and news columns to players
 * (LS-5436 — Football Player Detail: Injury Status and News feature)
 *
 * Adds three nullable TEXT columns to the public.players table to store
 * per-player injury data for football players. All columns are nullable —
 * they remain NULL for baseball players and for football players until the
 * injury data pipeline populates them.
 *
 *   injury_status      — e.g. "Questionable", "Out", "IR", "Doubtful"
 *   injury_designation — e.g. "Right Knee", "Hamstring"
 *   news               — latest injury note / news blurb for the player
 *
 * No index required for these columns; they are read-only fields fetched
 * as part of the individual player lookup (single-row fetch by PK).
 */

export const up = async ({ db }: { db: PgDatabase<NodePgQueryResultHKT> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "injury_status"      TEXT,
      ADD COLUMN IF NOT EXISTS "injury_designation" TEXT,
      ADD COLUMN IF NOT EXISTS "news"               TEXT;
  `);
};

export const down = async ({ db }: { db: PgDatabase<NodePgQueryResultHKT> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "injury_status",
      DROP COLUMN IF EXISTS "injury_designation",
      DROP COLUMN IF EXISTS "news";
  `);
};
