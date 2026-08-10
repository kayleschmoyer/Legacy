import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add is_test_user to app_internal.users (LS-9222)
 *
 * Purpose:
 * - There's no queryable signal distinguishing test/seed users from real
 *   users. The only existing signal is an informal convention — E2E/seed
 *   accounts use emails on the @test.legacysports.dev domain.
 *
 * Semantics:
 * - Purely informational. Nothing in app behavior (entitlements, auth,
 *   matchmaking, analytics, etc.) may read or branch on it.
 * - Nullable: existing rows matching the test-domain convention are
 *   backfilled `true`; all other existing rows are left NULL. Application
 *   code sets it explicitly (true/false) at user-creation time going
 *   forward, so it stays accurate without a recurring backfill job.
 *
 * Changes:
 * - Adds is_test_user boolean column to app_internal.users.
 * - Backfills true for rows whose canonical_email matches
 *   '%@test.legacysports.dev'.
 * - Recreates public.users VIEW to expose is_test_user.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner hands each migration a PgDatabase<any>; this is the shared signature across all migrations
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN;
  `);

  await db.execute(`
    UPDATE app_internal.users
    SET is_test_user = true
    WHERE canonical_email LIKE '%@test.legacysports.dev'
      AND is_test_user IS DISTINCT FROM true;
  `);

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             canonical_email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier,
             theme_preference,
             canonical_email_source::text AS canonical_email_source,
             is_test_user
      FROM app_internal.users;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner hands each migration a PgDatabase<any>; this is the shared signature across all migrations
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             canonical_email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier,
             theme_preference,
             canonical_email_source::text AS canonical_email_source
      FROM app_internal.users;
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS is_test_user;
  `);
};
