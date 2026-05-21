import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add sport column to leagues (LS-4628)
 *
 * Foundation for multi-sport leagues. Today the League entity, GraphQL schema,
 * and DB schema implicitly assume baseball. This adds a `sport` discriminator
 * that downstream tickets will use to gate sport-specific behavior (era
 * options, player pool, roster sizes, premium rules).
 *
 * Changes:
 * - Creates `sport_kind` ENUM with values 'baseball' and 'football'
 * - Adds `leagues.sport sport_kind NOT NULL DEFAULT 'baseball'`
 *   (backfill is implicit — every existing league is baseball)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE "public"."sport_kind" AS ENUM('baseball', 'football');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    ALTER TABLE "public"."leagues"
      ADD COLUMN IF NOT EXISTS "sport" "public"."sport_kind" NOT NULL DEFAULT 'baseball';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."leagues" DROP COLUMN IF EXISTS "sport";
  `);
  await db.execute(`DROP TYPE IF EXISTS "public"."sport_kind";`);
};
