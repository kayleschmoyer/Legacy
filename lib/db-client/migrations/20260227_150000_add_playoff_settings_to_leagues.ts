import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add playoff settings columns to leagues table (LS-259)
 *
 * Purpose:
 * - Enable leagues to configure playoffs directly on the league record
 * - These settings are used by autoAdvanceMatchups to automatically
 *   create a playoff bracket when the regular season ends.
 *
 * Changes:
 * - Adds `playoff_enabled` (boolean, default true) — whether playoffs are enabled
 * - Adds `playoff_format` (varchar, default '4-team') — bracket format: '4-team', '6-team', '8-team'
 * - Adds `playoff_multi_week` (boolean, default false) — whether each playoff round spans 2 weeks
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."leagues"
      ADD COLUMN IF NOT EXISTS "playoff_enabled" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "playoff_format" varchar(10) NOT NULL DEFAULT '4-team',
      ADD COLUMN IF NOT EXISTS "playoff_multi_week" boolean NOT NULL DEFAULT false;
  `);

  // Add a check constraint to validate the format value
  await db.execute(`
    ALTER TABLE "public"."leagues"
      ADD CONSTRAINT "leagues_playoff_format_check"
      CHECK ("playoff_format" IN ('4-team', '6-team', '8-team'));
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."leagues"
      DROP CONSTRAINT IF EXISTS "leagues_playoff_format_check",
      DROP COLUMN IF EXISTS "playoff_enabled",
      DROP COLUMN IF EXISTS "playoff_format",
      DROP COLUMN IF EXISTS "playoff_multi_week";
  `);
};
