import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add avatar_url to app_internal.users
 *
 * Purpose:
 * - Stores a user's profile picture URL (LS-288: user avatars)
 * - Nullable — existing users have no avatar by default
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Adding avatar_url column to app_internal.users...');

  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `);

  console.log('✅ avatar_url column added successfully');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('⬇️ Dropping avatar_url column from app_internal.users...');

  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS avatar_url;
  `);

  console.log('✅ avatar_url column dropped successfully');
};
