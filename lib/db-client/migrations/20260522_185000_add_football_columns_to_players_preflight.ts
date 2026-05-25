import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Preflight migration: add football player columns before the DST seed (LS-4858)
 *
 * 20260522_190200_seed_football_dst_players inserts rows with sport, is_dst,
 * and nfl_team, but those columns are only formally added in
 * 20260524_000100_add_football_columns_to_players. On a fresh DB CI runs
 * migrations in timestamp order, so the seed fails with column-does-not-exist.
 *
 * This migration gates the seed by adding the three columns it needs, one
 * timestamp slot earlier. ADD COLUMN IF NOT EXISTS makes every statement a
 * no-op on the dev DB where 20260524_000100 has already been applied.
 *
 * The FK constraint and unique index for pfr_id are left to 20260524_000100
 * so that migration remains the single source of truth for the full schema
 * change; this file is strictly an ordering shim.
 *
 * Depends on:
 *   20260521_120000_add_sport_to_leagues — sport_kind enum exists
 */

export const up = async ({
  db,
}: {
  db: PgDatabase<Record<string, never>>;
}) => {
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

export const down = async ({
  db,
}: {
  db: PgDatabase<Record<string, never>>;
}) => {
  // 20260524_000100 down migration removes these columns (it runs before this
  // one in reverse order), so DROP COLUMN IF EXISTS is safe here.
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "nfl_team",
      DROP COLUMN IF EXISTS "is_dst",
      DROP COLUMN IF EXISTS "sport";
  `);
};
