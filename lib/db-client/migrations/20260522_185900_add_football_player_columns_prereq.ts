import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Pre-seed prereq — add football identity columns to players (LS-257)
 *
 * 20260524_000100_add_football_columns_to_players (LS-246) adds these columns
 * but carries a May-24 timestamp, while 20260522_190200_seed_football_dst_players
 * (also LS-246) carries a May-22 timestamp and references them.  The runner
 * applies migrations in chronological order, so the seed executes before the
 * column-add and fails on any DB that was behind by both.
 *
 * This migration inserts itself at 20260522_185900 — just before the seed — and
 * adds the same columns with IF NOT EXISTS / idempotent guards so it is a no-op
 * on any DB that already has them via the May-24 migration.
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
  // Intentional no-op: the May-24 migration owns the authoritative down for
  // these columns.  Running both downs in order is safe — IF EXISTS guards
  // make each idempotent.
};
