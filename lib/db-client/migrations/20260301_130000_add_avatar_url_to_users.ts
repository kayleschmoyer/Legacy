import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add avatar_url to app_internal.users and update public.users VIEW
 *
 * Purpose:
 * - Stores a user's profile picture URL (LS-288: user avatars)
 * - Nullable — existing users have no avatar by default
 *
 * Fix (LS-399): The initial schema created public.users VIEW without avatar_url.
 * This migration must also recreate the VIEW so Drizzle's generated queries
 * (which include avatar_url) succeed against the public.users view.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Adding avatar_url column to app_internal.users...');

  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `);

  console.log('📝 Recreating public.users VIEW to expose avatar_url...');

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
             username,
             access_level::character varying::access_level AS access_level,
             avatar_url
      FROM app_internal.users;
  `);

  console.log('✅ avatar_url column added and public.users VIEW updated');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('⬇️ Reverting public.users VIEW to exclude avatar_url...');

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."users" AS
      SELECT id,
             email,
             username,
             access_level::character varying::access_level AS access_level
      FROM app_internal.users;
  `);

  console.log('⬇️ Dropping avatar_url column from app_internal.users...');

  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS avatar_url;
  `);

  console.log('✅ Reverted: avatar_url column and VIEW change rolled back');
};
