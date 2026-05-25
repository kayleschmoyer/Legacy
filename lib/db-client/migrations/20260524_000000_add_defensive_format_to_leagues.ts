import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add defensive_format column to leagues (LS-246)
 *
 * Captures whether a football league uses team D/ST or Individual Defensive
 * Players (IDP). Only meaningful when leagues.sport = 'football'; baseball
 * leagues inherit the default and ignore the value.
 *
 * Values:
 *   'dst' — team defense (default, covers the vast majority of fantasy leagues)
 *   'idp' — individual defensive players (DL / LB / DB)
 *
 * A CHECK constraint enforces the allowed values at the DB level.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."leagues"
      ADD COLUMN IF NOT EXISTS "defensive_format" VARCHAR(10) NOT NULL DEFAULT 'dst'
      CONSTRAINT "leagues_defensive_format_check" CHECK ("defensive_format" IN ('dst', 'idp'));
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."leagues" DROP COLUMN IF EXISTS "defensive_format";
  `);
};
