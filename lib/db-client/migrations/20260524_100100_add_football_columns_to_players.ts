import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add football identity columns to players (LS-246)
 *
 * - sport: discriminates baseball vs football players (default 'baseball')
 * - pfr_id: Pro Football Reference player ID (unique, nullable)
 * - is_dst: true for synthetic DST team-defense players
 * - nfl_team: current team abbreviation (nullable)
 * - position: football position for skill/IDP players (uses existing player_position enum)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "sport" "public"."sport_kind" NOT NULL DEFAULT 'baseball',
      ADD COLUMN IF NOT EXISTS "pfr_id" VARCHAR(20),
      ADD COLUMN IF NOT EXISTS "is_dst" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "nfl_team" VARCHAR(10),
      ADD COLUMN IF NOT EXISTS "position" "public"."player_position";
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS players_pfr_id_unique
      ON "public"."players" (pfr_id)
      WHERE pfr_id IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP INDEX IF EXISTS "public"."players_pfr_id_unique";`,
  );
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "sport",
      DROP COLUMN IF EXISTS "pfr_id",
      DROP COLUMN IF EXISTS "is_dst",
      DROP COLUMN IF EXISTS "nfl_team",
      DROP COLUMN IF EXISTS "position";
  `);
};
