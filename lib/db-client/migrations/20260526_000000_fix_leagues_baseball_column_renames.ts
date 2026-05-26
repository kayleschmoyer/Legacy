type MigrationDb = { execute: (sql: unknown) => Promise<unknown> };

/**
 * Migration: Idempotent catch-up for leagues baseball column renames (LS-4866)
 *
 * 20260525_000000_rename_leagues_baseball_columns performed bare RENAME COLUMN
 * statements that are NOT idempotent. If the preceding
 * 20260301_100000_add_era_filter_to_leagues migration was skipped or failed
 * (e.g. fresh CI database, DB restore), the rename throws and the columns end
 * up in neither their old nor new form. The current Drizzle schema expects
 * baseball_era_filter, baseball_hof_only, and pitcher_starts_per_matchup, so
 * any SELECT against the leagues table fails until the columns exist.
 *
 * This migration is fully idempotent and handles all states:
 *   1. Columns in old form  (era_filter, hof_only, sp_starts_per_matchup)
 *      → renames them to the new names
 *   2. Columns already in new form (e.g. prior rename ran successfully)
 *      → no-op
 *   3. Columns missing entirely (neither old nor new name present)
 *      → adds them with the correct type and default
 */

export const up = async ({ db }: { db: MigrationDb }) => {
  // 1. Ensure era_filter enum type exists (idempotent)
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

  // 2. Ensure football era values are present in the enum (idempotent)
  await db.execute(`
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'pioneer';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'single_platoon';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'super_bowl_era';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'west_coast';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'salary_cap_era';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'spread_offense';
  `);

  // 3. baseball_era_filter: rename from era_filter if present, else add directly
  await db.execute(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'era_filter'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues RENAME COLUMN era_filter TO baseball_era_filter;
      ELSIF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'baseball_era_filter'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues
          ADD COLUMN baseball_era_filter "public"."era_filter" NOT NULL DEFAULT 'all';
      END IF;
    END $$;
  `);

  // 4. baseball_hof_only: rename from hof_only if present, else add directly
  await db.execute(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'hof_only'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues RENAME COLUMN hof_only TO baseball_hof_only;
      ELSIF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'baseball_hof_only'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues
          ADD COLUMN baseball_hof_only boolean NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  // 5. custom_era_start_year / custom_era_end_year — added by 20260301_100000
  //    but that migration may have been skipped; ADD COLUMN IF NOT EXISTS is safe
  await db.execute(`
    ALTER TABLE public.leagues
      ADD COLUMN IF NOT EXISTS custom_era_start_year integer DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS custom_era_end_year integer DEFAULT NULL;
  `);

  // 6. Re-add the check constraint if it was lost along with the columns
  await db.execute(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'leagues_custom_era_years_check'
          AND conrelid = 'public.leagues'::regclass
      ) THEN
        ALTER TABLE public.leagues
          ADD CONSTRAINT leagues_custom_era_years_check
          CHECK (
            custom_era_start_year IS NULL
            OR custom_era_end_year IS NULL
            OR custom_era_start_year <= custom_era_end_year
          );
      END IF;
    END $$;
  `);

  // 7. pitcher_starts_per_matchup: rename from sp_starts_per_matchup if present,
  //    else add directly (sp_starts_per_matchup was added by 20260223_120000)
  await db.execute(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'sp_starts_per_matchup'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues
          RENAME COLUMN sp_starts_per_matchup TO pitcher_starts_per_matchup;
      ELSIF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'pitcher_starts_per_matchup'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues
          ADD COLUMN pitcher_starts_per_matchup integer NOT NULL DEFAULT 1;
      END IF;
    END $$;
  `);
};

export const down = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'baseball_era_filter'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues RENAME COLUMN baseball_era_filter TO era_filter;
      END IF;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'baseball_hof_only'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues RENAME COLUMN baseball_hof_only TO hof_only;
      END IF;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.leagues'::regclass
          AND attname = 'pitcher_starts_per_matchup'
          AND NOT attisdropped
      ) THEN
        ALTER TABLE public.leagues
          RENAME COLUMN pitcher_starts_per_matchup TO sp_starts_per_matchup;
      END IF;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'leagues_custom_era_years_check'
          AND conrelid = 'public.leagues'::regclass
      ) THEN
        ALTER TABLE public.leagues
          DROP CONSTRAINT leagues_custom_era_years_check;
      END IF;
    END $$;
  `);

  await db.execute(`
    ALTER TABLE public.leagues
      DROP COLUMN IF EXISTS custom_era_start_year,
      DROP COLUMN IF EXISTS custom_era_end_year;
  `);
};
