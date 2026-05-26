import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add football identity columns to players — prereq for DST seed (LS-246 / LS-4152)
 *
 * The DST player seed (20260522_190200) inserts rows with sport/is_dst/nfl_team
 * columns that were originally added by 20260524_000100_add_football_columns_to_players.
 * Because 20260524 > 20260522, fresh-DB migration runs fail: the seed executes
 * before the columns exist.
 *
 * This migration adds the same columns at a timestamp that precedes the seed,
 * making it safe to run from a blank database. The IF NOT EXISTS guards ensure
 * idempotency on databases that already applied the columns via 20260524_000100.
 *
 * 20260524_000100 remains in place as a no-op on forward runs; its down()
 * still correctly removes the columns when rolling back past this point.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "sport" "public"."sport_kind" NOT NULL DEFAULT 'baseball';
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "pfr_id" VARCHAR(20);
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "is_dst" BOOLEAN NOT NULL DEFAULT false;
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "nfl_team" VARCHAR(10);
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS "players_pfr_id_unique"
      ON "public"."players" ("pfr_id")
      WHERE "pfr_id" IS NOT NULL;
  `);

  await db.execute(`
    DO $$ BEGIN
      ALTER TABLE "public"."players"
        ADD CONSTRAINT "players_nfl_team_fk"
          FOREIGN KEY ("nfl_team") REFERENCES "public"."nfl_teams" ("abbreviation")
          ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // No-op on rollback: 20260524_000100 owns the canonical removal of these columns.
  // Rolling back this prereq alone (without rolling back 20260524_000100) would
  // leave the schema in an inconsistent state, so we deliberately do nothing here.
};
