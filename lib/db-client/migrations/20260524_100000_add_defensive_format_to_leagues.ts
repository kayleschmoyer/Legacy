import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add defensive_format column to leagues (LS-246)
 *
 * 'dst' | 'idp' — meaningful only for football leagues.
 * Defaults to 'dst' so all existing leagues (baseball and football) are
 * unaffected.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."leagues"
      ADD COLUMN IF NOT EXISTS "defensive_format" VARCHAR(10) NOT NULL DEFAULT 'dst';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."leagues" DROP COLUMN IF EXISTS "defensive_format";
  `);
};
