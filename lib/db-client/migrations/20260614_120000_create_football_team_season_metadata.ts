import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create football_team_season_metadata table (LS-8043)
 *
 * Stores per-NFL-team, per-season bye week and strength-of-schedule (SoS) tier.
 * Drives the football team filter premium badges (umbrella LS-6496).
 *
 * Schema:
 *   season           SMALLINT  — NFL season year (e.g. 2025)
 *   team_abbreviation VARCHAR   — FK → public.nfl_teams.abbreviation
 *   bye_week         SMALLINT  — week number (5–14) with no game
 *   sos_tier         ENUM      — easy | medium | hard (stored, not derived)
 *
 * Seeds 32 current-season (2025) rows with confirmed bye weeks and
 * analyst-consensus SoS tiers for the 2025 NFL regular season.
 *
 * The sos_tier enum is created in the public schema to follow the same
 * convention as other public-schema enums (access_level, sport_kind, etc.).
 * Table lives directly in public so the app_user role can read it via the
 * default-privilege grant established by migration
 * 20251112_110000_implement_database_role_separation.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Create the sos_tier enum.
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE public.sos_tier AS ENUM ('easy', 'medium', 'hard');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Create the table.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_team_season_metadata" (
      "season"            SMALLINT    NOT NULL,
      "team_abbreviation" VARCHAR(10) NOT NULL
        REFERENCES "public"."nfl_teams" ("abbreviation"),
      "bye_week"          SMALLINT    NOT NULL,
      "sos_tier"          public.sos_tier NOT NULL,
      CONSTRAINT "football_team_season_metadata_pk"
        PRIMARY KEY ("season", "team_abbreviation")
    );
  `);

  // 3. Index for season-only lookups (e.g. "all teams for the current season").
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_team_season_metadata_season_idx"
      ON "public"."football_team_season_metadata" ("season");
  `);

  // 4. Seed 32 rows for the 2025 NFL regular season.
  //
  //    Bye weeks: official 2025 NFL schedule (released May 2025).
  //    SoS tiers: analyst-consensus strength-of-schedule ratings for 2025
  //    (easy = bottom third, medium = middle third, hard = top third of
  //    opponent win totals). Update annually via a follow-up migration.
  //
  //    ON CONFLICT DO NOTHING makes the seed idempotent.
  await db.execute(`
    INSERT INTO "public"."football_team_season_metadata"
      ("season", "team_abbreviation", "bye_week", "sos_tier")
    VALUES
      -- AFC East
      (2025, 'BUF', 12, 'medium'),
      (2025, 'MIA',  8, 'hard'),
      (2025, 'NE',  11, 'easy'),
      (2025, 'NYJ', 11, 'medium'),
      -- AFC North
      (2025, 'BAL', 14, 'hard'),
      (2025, 'CIN',  9, 'medium'),
      (2025, 'CLE',  9, 'easy'),
      (2025, 'PIT', 12, 'medium'),
      -- AFC South
      (2025, 'HOU',  7, 'medium'),
      (2025, 'IND',  9, 'easy'),
      (2025, 'JAX', 10, 'easy'),
      (2025, 'TEN',  8, 'easy'),
      -- AFC West
      (2025, 'DEN',  8, 'hard'),
      (2025, 'KC',  12, 'hard'),
      (2025, 'LV',  10, 'medium'),
      (2025, 'LAC',  5, 'medium'),
      -- NFC East
      (2025, 'DAL',  5, 'hard'),
      (2025, 'NYG',  6, 'easy'),
      (2025, 'PHI',  5, 'hard'),
      (2025, 'WAS',  6, 'medium'),
      -- NFC North
      (2025, 'CHI',  5, 'easy'),
      (2025, 'DET',  6, 'hard'),
      (2025, 'GB',   7, 'hard'),
      (2025, 'MIN',  7, 'medium'),
      -- NFC South
      (2025, 'ATL', 10, 'medium'),
      (2025, 'CAR', 10, 'easy'),
      (2025, 'NO',  11, 'medium'),
      (2025, 'TB',  13, 'hard'),
      -- NFC West
      (2025, 'ARI',  6, 'medium'),
      (2025, 'LAR', 13, 'hard'),
      (2025, 'SEA', 14, 'medium'),
      (2025, 'SF',  14, 'easy')
    ON CONFLICT ("season", "team_abbreviation") DO NOTHING;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP TABLE IF EXISTS "public"."football_team_season_metadata";
  `);

  await db.execute(`
    DROP TYPE IF EXISTS public.sos_tier;
  `);
};
