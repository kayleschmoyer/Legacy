import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add Discord OAuth columns to app_internal.users
 *
 * Purpose:
 * - Stores Discord account information for users who link their Discord account
 *   or sign up via Discord OAuth2 (LS-1675: Discord OAuth login and account linking)
 * - discord_id: Discord user snowflake ID (unique identifier)
 * - discord_username: Display name on Discord
 * - discord_avatar: Discord avatar hash (used to construct avatar URL)
 * - All nullable — existing users have no Discord account linked by default
 * - discord_id has a unique constraint to prevent multiple users linking the same Discord account
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Adding Discord OAuth columns to app_internal.users...');

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

  console.log('📝 Updating public.users VIEW to expose Discord columns...');

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

  console.log('✅ Discord OAuth columns added and public.users VIEW updated');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('⬇️ Removing Discord OAuth columns from app_internal.users...');

  await db.execute(`
    DROP INDEX IF EXISTS app_internal.idx_users_discord_id;
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS discord_id,
    DROP COLUMN IF EXISTS discord_username,
    DROP COLUMN IF EXISTS discord_avatar;
  `);

  console.log('✅ Reverted: Discord OAuth columns removed');
};
