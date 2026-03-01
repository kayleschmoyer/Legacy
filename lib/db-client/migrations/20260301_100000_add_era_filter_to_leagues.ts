import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add era-based player pool filtering to leagues (LS-295)
 *
 * Purpose:
 * - Enable "Era-Based Leagues" and "Hall of Fame Draft Mode" — unique differentiators
 *   that historical-stats platforms cannot replicate.
 *
 * Changes:
 * - Creates `era_filter` ENUM with pre-defined baseball eras plus 'all' and 'custom'
 * - Adds `era_filter` column to leagues (default 'all' — existing leagues unaffected)
 * - Adds `hof_only` boolean — restrict draft board to Hall of Famers only
 * - Adds `custom_era_start_year` / `custom_era_end_year` — commissioner-defined eras
 * - Adds `decade_challenge` boolean — rotating decade player pool each week
 *
 * Era definitions:
 *   dead_ball    : pre-1920  (Dead Ball Era)
 *   golden_age   : 1920-1960 (Golden Age / Pre-integration + Integration)
 *   expansion    : 1961-1976 (Expansion Era)
 *   free_agency  : 1977-1993 (Free Agency Era)
 *   steroid_era  : 1994-2005 (Steroid Era)
 *   modern       : 2006+     (Modern Era / Analytics Era)
 *   custom       : commissioner-defined start/end years
 *   all          : no era restriction (default)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create the era_filter enum type (idempotent)
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE "public"."era_filter" AS ENUM(
        'all',
        'dead_ball',
        'golden_age',
        'expansion',
        'free_agency',
        'steroid_era',
        'modern',
        'custom'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Add era columns to leagues table (all idempotent)
  await db.execute(`
    ALTER TABLE "public"."leagues"
      ADD COLUMN IF NOT EXISTS "era_filter" "public"."era_filter" NOT NULL DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS "hof_only" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "custom_era_start_year" integer DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS "custom_era_end_year" integer DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS "decade_challenge" boolean NOT NULL DEFAULT false;
  `);

  // 3. Add a check constraint to ensure custom_era_start_year <= custom_era_end_year
  await db.execute(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'leagues_custom_era_years_check'
          AND conrelid = 'public.leagues'::regclass
      ) THEN
        ALTER TABLE "public"."leagues"
          ADD CONSTRAINT "leagues_custom_era_years_check"
          CHECK (
            custom_era_start_year IS NULL
            OR custom_era_end_year IS NULL
            OR custom_era_start_year <= custom_era_end_year
          );
      END IF;
    END $$;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."leagues"
      DROP CONSTRAINT IF EXISTS "leagues_custom_era_years_check",
      DROP COLUMN IF EXISTS "era_filter",
      DROP COLUMN IF EXISTS "hof_only",
      DROP COLUMN IF EXISTS "custom_era_start_year",
      DROP COLUMN IF EXISTS "custom_era_end_year",
      DROP COLUMN IF EXISTS "decade_challenge";
  `);

  await db.execute(`DROP TYPE IF EXISTS "public"."era_filter";`);
};
