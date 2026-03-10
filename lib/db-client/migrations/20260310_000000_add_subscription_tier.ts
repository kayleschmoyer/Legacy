import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add subscription_tier to app_internal.users
 *
 * Purpose:
 * - Introduces premium tier tracking at the user level
 * - Required for LS-825 GraphQL middleware for premium feature gating
 *
 * Changes:
 * - Creates app_internal.subscription_tier enum ('free', 'premium')
 * - Adds subscription_tier column to app_internal.users (default 'free')
 * - Updates public.users view to expose subscription_tier as text
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.subscription_tier AS ENUM ('free', 'premium');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS subscription_tier app_internal.subscription_tier NOT NULL DEFAULT 'free';
  `);

  await db.execute(`
    CREATE OR REPLACE VIEW public.users AS
    SELECT
      id,
      email,
      username,
      access_level::character varying::access_level AS access_level,
      avatar_url,
      subscription_tier::text AS subscription_tier
    FROM app_internal.users;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE OR REPLACE VIEW public.users AS
    SELECT
      id,
      email,
      username,
      access_level::character varying::access_level AS access_level,
      avatar_url
    FROM app_internal.users;
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN subscription_tier;
  `);

  await db.execute(`
    DROP TYPE app_internal.subscription_tier;
  `);
};
