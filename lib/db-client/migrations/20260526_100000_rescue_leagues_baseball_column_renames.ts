import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Rescue leagues table — ensure baseball-prefixed columns exist (LS-4870)
 *
 * Background:
 *   20260301_100000_add_era_filter_to_leagues      — adds era_filter, hof_only,
 *     custom_era_start_year, custom_era_end_year
 *   20260525_000000_rename_leagues_baseball_columns — renames:
 *     sp_starts_per_matchup → pitcher_starts_per_matchup
 *     era_filter            → baseball_era_filter
 *     hof_only              → baseball_hof_only
 *
 * Neither migration was applied to production before the lambda was deployed,
 * causing INSERT failures. This migration is fully idempotent and resolves the
 * DB to the state both prior migrations would have produced, regardless of which
 * (if any) of them have run.
 *
 * Possible DB states handled:
 *   A) Neither prior migration ran  — adds/renames all columns from scratch.
 *   B) Only 20260301 ran            — old intermediate names exist; renames them.
 *   C) Only 20260525 ran (unlikely) — correct names already present; no-op.
 *   D) Both prior migrations ran    — correct names present; no-op.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Ensure the era_filter enum exists (added by 20260301; idempotent).
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

  // 2. pitcher_starts_per_matchup
  //    If sp_starts_per_matchup still exists, rename it; otherwise ensure the
  //    target column exists (adds it when both migration 20260301 and 20260525
  //    were fully skipped).
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'sp_starts_per_matchup'
      ) THEN
        ALTER TABLE public.leagues
          RENAME COLUMN sp_starts_per_matchup TO pitcher_starts_per_matchup;
      ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'pitcher_starts_per_matchup'
      ) THEN
        ALTER TABLE public.leagues
          ADD COLUMN pitcher_starts_per_matchup integer NOT NULL DEFAULT 1;
      END IF;
    END $$;
  `);

  // 3. baseball_era_filter
  //    If era_filter exists (20260301 ran, 20260525 didn't), rename it.
  //    If neither name exists (both prior migrations skipped), add the column.
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'era_filter'
      ) THEN
        ALTER TABLE public.leagues
          RENAME COLUMN era_filter TO baseball_era_filter;
      ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'baseball_era_filter'
      ) THEN
        ALTER TABLE public.leagues
          ADD COLUMN baseball_era_filter "public"."era_filter" NOT NULL DEFAULT 'all';
      END IF;
    END $$;
  `);

  // 4. baseball_hof_only — same pattern as era_filter.
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'hof_only'
      ) THEN
        ALTER TABLE public.leagues
          RENAME COLUMN hof_only TO baseball_hof_only;
      ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'baseball_hof_only'
      ) THEN
        ALTER TABLE public.leagues
          ADD COLUMN baseball_hof_only boolean NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  // 5. custom_era_start_year — added by 20260301 with ADD COLUMN IF NOT EXISTS;
  //    replicate that safety here.
  await db.execute(`
    ALTER TABLE public.leagues
      ADD COLUMN IF NOT EXISTS custom_era_start_year integer DEFAULT NULL;
  `);

  // 6. custom_era_end_year — same as above.
  await db.execute(`
    ALTER TABLE public.leagues
      ADD COLUMN IF NOT EXISTS custom_era_end_year integer DEFAULT NULL;
  `);

  // 7. Check constraint ensuring custom_era_start_year <= custom_era_end_year
  //    (added by 20260301; idempotent).
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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop the check constraint and the two purely-added columns first.
  await db.execute(`
    ALTER TABLE public.leagues
      DROP CONSTRAINT IF EXISTS leagues_custom_era_years_check,
      DROP COLUMN IF EXISTS custom_era_end_year,
      DROP COLUMN IF EXISTS custom_era_start_year;
  `);

  // pitcher_starts_per_matchup: sp_starts_per_matchup pre-dated all three
  // migrations — up() always performs a RENAME (never an ADD) for this column.
  // Rename it back only when pitcher_starts_per_matchup exists and
  // sp_starts_per_matchup does not (i.e. we renamed it). If sp_starts_per_matchup
  // already exists, 20260525 ran and we were a no-op — nothing to undo.
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'pitcher_starts_per_matchup'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'sp_starts_per_matchup'
      ) THEN
        ALTER TABLE public.leagues
          RENAME COLUMN pitcher_starts_per_matchup TO sp_starts_per_matchup;
      END IF;
    END $$;
  `);

  // baseball_era_filter / baseball_hof_only: whether to DROP or RENAME back
  // depends on which DB state up() saw.
  //
  // • State B (20260301 ran): up() renamed era_filter → baseball_era_filter;
  //   down() should rename it back.
  // • State A (20260301 never ran): up() added baseball_era_filter from scratch;
  //   down() must DROP it — renaming would introduce era_filter which never
  //   originally existed.
  // • State C/D (20260525 ran): up() was a no-op; nothing to undo.
  //
  // We detect which case applied by checking drizzle.__drizzle_migrations,
  // whose hash column stores migration filenames.
  await db.execute(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'baseball_era_filter'
      ) THEN
        -- Already absent or never added — nothing to do.
        NULL;
      ELSIF EXISTS (
        SELECT 1 FROM drizzle.__drizzle_migrations
        WHERE hash = '20260301_100000_add_era_filter_to_leagues.ts'
      ) THEN
        -- State B: 20260301 had run; we renamed era_filter → baseball_era_filter.
        -- Rename it back (only if era_filter doesn't already exist).
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'leagues'
            AND column_name = 'era_filter'
        ) THEN
          ALTER TABLE public.leagues
            RENAME COLUMN baseball_era_filter TO era_filter;
        END IF;
      ELSE
        -- State A: 20260301 had NOT run; we added baseball_era_filter from scratch.
        -- Drop it to restore the original schema.
        ALTER TABLE public.leagues
          DROP COLUMN baseball_era_filter;
      END IF;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leagues'
          AND column_name = 'baseball_hof_only'
      ) THEN
        NULL;
      ELSIF EXISTS (
        SELECT 1 FROM drizzle.__drizzle_migrations
        WHERE hash = '20260301_100000_add_era_filter_to_leagues.ts'
      ) THEN
        -- State B: we renamed hof_only → baseball_hof_only. Rename back.
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'leagues'
            AND column_name = 'hof_only'
        ) THEN
          ALTER TABLE public.leagues
            RENAME COLUMN baseball_hof_only TO hof_only;
        END IF;
      ELSE
        -- State A: we added baseball_hof_only from scratch. Drop it.
        ALTER TABLE public.leagues
          DROP COLUMN baseball_hof_only;
      END IF;
    END $$;
  `);
};
