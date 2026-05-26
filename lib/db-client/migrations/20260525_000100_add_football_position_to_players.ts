import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add football_position column to players table (LS-4150)
 *
 * Stores the fantasy-relevant position for individual football players:
 *   QB | RB | WR | TE | K  — offensive skill positions
 *   DL | LB | DB            — IDP (individual defensive player) positions
 *
 * DST players use the `is_dst` flag; this column is null for them.
 * Baseball players also have null here.
 *
 * Populated by the pfr-client ingestion pipeline (LS-252) when it seeds
 * individual NFL players.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "football_position" VARCHAR(10);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "players_football_position_idx"
      ON "public"."players" ("football_position")
      WHERE "football_position" IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS "players_football_position_idx";
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "football_position";
  `);
};
