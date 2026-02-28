import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add gif_url column to league_messages
 *
 * Purpose:
 * - Enable GIF messages in league chat (LS-307)
 * - Matches the gifUrl field already present on matchup_messages
 *
 * Changes:
 * - Add nullable `gif_url` TEXT column to `league_messages`
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      ADD COLUMN IF NOT EXISTS gif_url TEXT;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      DROP COLUMN IF EXISTS gif_url;
  `);
};
