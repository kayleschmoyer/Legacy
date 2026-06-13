import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Drop legacy discord_id / discord_username / discord_avatar columns
 * from app_internal.users (LS-7826 — Phase 3 "Contract" of epic LS-7821).
 *
 * All Discord identity data now lives exclusively in app_internal.user_identities
 * (backfilled in Phase 1, LS-7822). No code paths write to or read from the
 * legacy columns after this point — the dual-write shims introduced for
 * backward-compatibility have been removed.
 *
 * Changes:
 * - Drops the idx_users_discord_id partial unique index.
 * - Drops discord_id, discord_username, discord_avatar from app_internal.users.
 * - Recreates public.users VIEW without those columns.
 *
 * Rollback note: the columns can be re-added (down migration), but the data
 * would be empty. The source of truth is app_internal.user_identities and has
 * not been touched. To re-derive the column values from user_identities, run
 * the Phase 1 backfill query in reverse — see the up migration in
 * 20260607_120000_add_user_identities_table.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Drop the partial unique index on discord_id.
  await db.execute(`
    DROP INDEX IF EXISTS app_internal.idx_users_discord_id;
  `);

  // 2. Drop the public.users VIEW first — it depends on the discord_id column,
  //    so PostgreSQL rejects DROP COLUMN unless the view is removed first.
  await db.execute(`
    DROP VIEW IF EXISTS "public"."users";
  `);

  // 3. Drop the legacy Discord columns.
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS discord_id,
    DROP COLUMN IF EXISTS discord_username,
    DROP COLUMN IF EXISTS discord_avatar;
  `);

  // 4. Recreate public.users VIEW without the dropped columns.
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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Re-add the columns (empty — data lives in user_identities).
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS discord_id VARCHAR(32),
    ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS discord_avatar VARCHAR(255);
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id
    ON app_internal.users (discord_id)
    WHERE discord_id IS NOT NULL;
  `);

  // Restore the view with the columns.
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             canonical_email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier,
             discord_id,
             discord_username,
             discord_avatar,
             theme_preference,
             canonical_email_source::text AS canonical_email_source
      FROM app_internal.users;
  `);

  // Note: the down direction recreates the view after adding columns, so no
  // DROP VIEW is needed — CREATE OR REPLACE VIEW handles the update in place.
};
