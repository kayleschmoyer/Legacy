import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add football identity columns to players (LS-246)
 *
 * Extends the players table to support multi-sport player records.
 *
 * sport        — discriminator; all existing rows default to 'baseball'
 * pfr_id       — Pro Football Reference player ID (nullable); unique index
 *                enforces one row per pfr_id when non-null
 * is_dst       — true for the 32 synthetic DST team players (KC, SF, etc.)
 *                that stand in as roster targets for team defense scoring
 * nfl_team     — current NFL team abbreviation, FK → nfl_teams.abbreviation;
 *                set on DST synthetic players and real individual players;
 *                null for baseball players
 *
 * The nfl_teams reference table was created in migration
 * 20260522_180000_create_nfl_teams (LS-4156).
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
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP CONSTRAINT IF EXISTS "players_nfl_team_fk";
  `);

  await db.execute(`
    DROP INDEX IF EXISTS "players_pfr_id_unique";
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "nfl_team",
      DROP COLUMN IF EXISTS "is_dst",
      DROP COLUMN IF EXISTS "pfr_id",
      DROP COLUMN IF EXISTS "sport";
  `);
};
