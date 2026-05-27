import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add theme_preference to app_internal.users (LS-4913)
 *
 * Stores the user's chosen theme ('system' | 'light' | 'dark') server-side so
 * the preference follows the user across devices instead of being trapped in
 * per-browser localStorage. Nullable — a NULL value means the user has not
 * synced a preference yet, and the client falls back to its local default.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10);
  `);

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier,
             discord_id,
             discord_username,
             discord_avatar,
             theme_preference
      FROM app_internal.users;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url,
             subscription_tier::text AS subscription_tier,
             discord_id,
             discord_username,
             discord_avatar
      FROM app_internal.users;
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS theme_preference;
  `);
};
