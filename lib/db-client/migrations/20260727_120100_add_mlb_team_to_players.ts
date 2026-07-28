import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add mlb_team column to players (LS-8597)
 *
 * mlb_team — current MLB team abbreviation, FK -> mlb_teams.abbreviation;
 * nullable — populated by the MLB Stats API data pipeline for baseball
 * players with a known mlb_player_id, null until synced (same nullable
 * backfill precedent as mlb_player_id itself).
 *
 * The mlb_teams reference table was created in migration
 * 20260727_120000_create_mlb_teams.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "mlb_team" VARCHAR(3);
  `);

  await db.execute(`
    DO $$ BEGIN
      ALTER TABLE "public"."players"
        ADD CONSTRAINT "players_mlb_team_fk"
          FOREIGN KEY ("mlb_team") REFERENCES "public"."mlb_teams" ("abbreviation")
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
      DROP CONSTRAINT IF EXISTS "players_mlb_team_fk";
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "mlb_team";
  `);
};
