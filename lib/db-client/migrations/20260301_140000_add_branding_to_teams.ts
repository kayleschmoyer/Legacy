import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add avatar_url and banner_url to public.teams
 *
 * Purpose:
 * - Allows team GMs to personalise their team with a logo/avatar image
 * - Allows team GMs to set a banner/header image for their team page
 * - Both columns are nullable — existing teams have no branding by default
 *
 * Changes:
 * - Add `avatar_url TEXT` to `public.teams`
 * - Add `banner_url TEXT` to `public.teams`
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Adding avatar_url and banner_url columns to public.teams...');

  await db.execute(`
    ALTER TABLE public.teams
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS banner_url TEXT;
  `);

  console.log('✅ avatar_url and banner_url columns added successfully');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '⬇️ Dropping avatar_url and banner_url columns from public.teams...',
  );

  await db.execute(`
    ALTER TABLE public.teams
    DROP COLUMN IF EXISTS avatar_url,
    DROP COLUMN IF EXISTS banner_url;
  `);

  console.log('✅ avatar_url and banner_url columns dropped successfully');
};
