import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add jersey_number to players (LS-6236)
 *
 * - jersey_number: nullable integer for NFL jersey number display
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "jersey_number" INTEGER;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "jersey_number";
  `);
};
