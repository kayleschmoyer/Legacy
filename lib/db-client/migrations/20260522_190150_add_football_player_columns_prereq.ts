import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add football player columns prerequisite (LS-248)
 *
 * LS-251 (20260522_190200_seed_football_dst_players) was merged to main before
 * LS-246 (20260524_000100_add_football_columns_to_players), leaving the seed
 * migration dependent on columns that don't exist until later in the sequence.
 *
 * This migration adds sport, is_dst, and nfl_team using ADD COLUMN IF NOT EXISTS
 * so the seed can run successfully. The full LS-246 migration (pfr_id, partial
 * unique index, FK constraint) remains in 20260524_000100 and becomes a no-op
 * for the three overlapping columns.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "sport" "public"."sport_kind" NOT NULL DEFAULT 'baseball';
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "is_dst" BOOLEAN NOT NULL DEFAULT false;
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "nfl_team" VARCHAR(10);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // 20260524_000100 down drops these columns with IF EXISTS — this is a no-op
  // if that migration has already been rolled back first (correct rollback order).
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "nfl_team",
      DROP COLUMN IF EXISTS "is_dst",
      DROP COLUMN IF EXISTS "sport";
  `);
};
