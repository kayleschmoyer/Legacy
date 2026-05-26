import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Pre-requisite migration for 20260522_190200_seed_football_dst_players (LS-250 fix).
 *
 * On a fresh database, migrations execute in alphabetical filename order.
 * The DST player seeder (20260522_190200) inserts rows using sport/is_dst/nfl_team
 * columns, but those columns are added by 20260524_000100_add_football_columns_to_players
 * which sorts AFTER the seeder. This pre-req migration adds the three columns the seeder
 * needs — without FK constraints — so the seeder can run on a fresh DB.
 *
 * 20260524_000100 uses ADD COLUMN IF NOT EXISTS for all three columns, so this migration
 * is a no-op on existing databases where 000100 has already applied them.
 * The FK constraint (nfl_team → nfl_teams) is intentionally deferred to 000100, which
 * also handles the pfr_id column and unique index.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "sport" "public"."sport_kind" NOT NULL DEFAULT 'baseball';
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "is_dst" BOOLEAN NOT NULL DEFAULT false;
  `);

  // nfl_team added without FK constraint; 20260524_000100 adds the constraint later
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "nfl_team" VARCHAR(10);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // 20260524_000100's down() drops these columns with IF NOT EXISTS.
  // Only drop here if 000100 has not yet been applied (i.e. these columns are
  // exclusively owned by this pre-req migration). On a normal rollback sequence
  // 000100.down() runs first and removes them; this is intentionally a no-op.
};
