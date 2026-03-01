import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add avatar and branding fields
 *
 * Purpose:
 * - Support user profile avatars (LS-288)
 * - Support team logos and custom colors (LS-288)
 * - Support league logos, banners, and custom colors (LS-288)
 *
 * Changes:
 * - Add avatar_url to app_internal.users
 * - Add logo_url, primary_color, secondary_color to teams
 * - Add logo_url, banner_url, primary_color, secondary_color to leagues
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Add avatar_url to the internal users table
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `);

  // Add branding columns to the teams table
  await db.execute(`
    ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7);
  `);

  // Add branding columns to the leagues table
  await db.execute(`
    ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS banner_url TEXT,
    ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS avatar_url;
  `);

  await db.execute(`
    ALTER TABLE teams
    DROP COLUMN IF EXISTS logo_url,
    DROP COLUMN IF EXISTS primary_color,
    DROP COLUMN IF EXISTS secondary_color;
  `);

  await db.execute(`
    ALTER TABLE leagues
    DROP COLUMN IF EXISTS logo_url,
    DROP COLUMN IF EXISTS banner_url,
    DROP COLUMN IF EXISTS primary_color,
    DROP COLUMN IF EXISTS secondary_color;
  `);
};
