import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Drop career_football_defense_idp TABLE if it was created by 000000 (LS-4759)
 *
 * Migration 20260524_000000 (LS-250) created career_football_defense_idp as a TABLE.
 * Migration 20260524_100250 (LS-255, immutable in main) issues:
 *   DROP VIEW IF EXISTS "public"."career_football_defense_idp"
 * PostgreSQL raises an error when the named object exists as a TABLE rather than a VIEW,
 * even with IF EXISTS. On fresh CI databases where all migrations run from scratch,
 * 000000 creates the TABLE before 100250 runs, causing a failure.
 *
 * This migration drops the TABLE-form of career_football_defense_idp (if present) so
 * 100250's DROP VIEW IF EXISTS becomes a safe no-op. The VIEW is subsequently created
 * by 100300/100301 (backed by football_season_defense_idp).
 *
 * Uses a pg_class lookup to avoid issuing DROP TABLE on an object that may be a VIEW
 * (DROP TABLE IF EXISTS also errors if the name belongs to a view).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DO $$
    DECLARE obj_type char;
    BEGIN
      SELECT c.relkind INTO obj_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'career_football_defense_idp';
      IF obj_type = 'r' THEN
        EXECUTE 'DROP TABLE "public"."career_football_defense_idp" CASCADE';
      END IF;
    END $$;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // No-op: 000000 owns the original table creation; reversing this migration
  // alone without reversing 000000 is not meaningful.
};
