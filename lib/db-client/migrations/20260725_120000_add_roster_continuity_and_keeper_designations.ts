import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add roster continuity + keeper designations (LS-8671)
 *
 * Purpose:
 * - Shared persistence foundation for keeper (LS-8385) and dynasty (LS-8386)
 *   draft modes: leagues declare how rosters carry across seasons, and keeper
 *   leagues store their commissioner-configured rules and per-team player
 *   designations.
 *
 * Changes:
 * - Creates `roster_continuity` enum ('redraft' | 'keeper' | 'dynasty')
 * - Creates `keeper_designation_status` enum ('pending' | 'locked' | 'applied' | 'released')
 * - Adds `roster_continuity` column to leagues (default 'redraft' — existing
 *   leagues keep full-reset behaviour)
 * - Adds `keeper_settings` jsonb column to leagues (null unless the league is
 *   a keeper league; shape documented on the Drizzle model / KeeperSettings)
 * - Creates `keeper_designations` table (league/team/player/season with
 *   cost_round / cost_amount and a status lifecycle), unique per
 *   (league, team, player, season)
 * - Adds updated_at trigger on keeper_designations
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner passes an untyped PgDatabase; matches every other migration in this directory
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create the enums (idempotent)
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE "public"."roster_continuity" AS ENUM(
        'redraft',
        'keeper',
        'dynasty'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE "public"."keeper_designation_status" AS ENUM(
        'pending',
        'locked',
        'applied',
        'released'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Add roster-continuity columns to leagues (idempotent)
  await db.execute(`
    ALTER TABLE "public"."leagues"
      ADD COLUMN IF NOT EXISTS "roster_continuity" "public"."roster_continuity" NOT NULL DEFAULT 'redraft',
      ADD COLUMN IF NOT EXISTS "keeper_settings" jsonb DEFAULT NULL;
  `);

  // 3. Create the keeper_designations table (idempotent)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."keeper_designations" (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      cost_round INTEGER,
      cost_amount INTEGER,
      status "public"."keeper_designation_status" NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT keeper_designations_league_fk
        FOREIGN KEY (league_id) REFERENCES "public"."leagues"(id) ON DELETE CASCADE,
      CONSTRAINT keeper_designations_team_fk
        FOREIGN KEY (team_id) REFERENCES "public"."teams"(id) ON DELETE CASCADE,
      CONSTRAINT keeper_designations_player_fk
        FOREIGN KEY (player_id) REFERENCES "public"."players"(id),
      CONSTRAINT keeper_designations_uk
        UNIQUE (league_id, team_id, player_id, season)
    );
  `);

  // 4. Add indexes (idempotent)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS keeper_designations_league_season_idx
      ON "public"."keeper_designations"(league_id, season);
    CREATE INDEX IF NOT EXISTS keeper_designations_team_id_idx
      ON "public"."keeper_designations"(team_id);
  `);

  // 5. Auto-update updated_at (drop first to be idempotent)
  await db.execute(`
    DROP TRIGGER IF EXISTS keeper_designations_updated_at_trigger ON "public"."keeper_designations";
    CREATE TRIGGER keeper_designations_updated_at_trigger
    BEFORE UPDATE ON "public"."keeper_designations"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner passes an untyped PgDatabase; matches every other migration in this directory
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS keeper_designations_updated_at_trigger ON "public"."keeper_designations";
    DROP TABLE IF EXISTS "public"."keeper_designations";
  `);

  await db.execute(`
    ALTER TABLE "public"."leagues"
      DROP COLUMN IF EXISTS "roster_continuity",
      DROP COLUMN IF EXISTS "keeper_settings";
  `);

  await db.execute(`
    DROP TYPE IF EXISTS "public"."keeper_designation_status";
    DROP TYPE IF EXISTS "public"."roster_continuity";
  `);
};
