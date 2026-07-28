import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Drop injury columns from players (LS-8608, epic LS-8604)
 *
 * Purpose:
 * - Legacy Sports is a historical-data platform where in-progress injuries
 *   can never happen, so the injury-status pipeline is injury-derived and is
 *   being removed (epic LS-8604). LS-8607 already removed the GraphQL
 *   surface; nothing reads these columns anymore.
 *
 * Changes:
 * - DROP COLUMN players.injury_status
 * - DROP COLUMN players.injury_designation
 * - DROP COLUMN players.injuries_last_synced_at
 *
 * Out of scope: players.news (shipped with LS-5436) is a separate product
 * decision (see epic open question) and is left untouched.
 *
 * Columns are feed-populated only, so data loss on drop is acceptable per
 * product decision. Each statement is individually re-runnable (the runner
 * is autocommit, LS-8254).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's db handle is untyped across runner/lambda sandbox boundaries
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "injury_status",
      DROP COLUMN IF EXISTS "injury_designation",
      DROP COLUMN IF EXISTS "injuries_last_synced_at";
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's db handle is untyped across runner/lambda sandbox boundaries
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "injury_status" TEXT,
      ADD COLUMN IF NOT EXISTS "injury_designation" TEXT,
      ADD COLUMN IF NOT EXISTS "injuries_last_synced_at" TIMESTAMPTZ;
  `);
};
