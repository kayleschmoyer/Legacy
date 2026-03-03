import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add auto_pick flag to draft_teams
 *
 * Purpose:
 * - Enables per-team opt-in auto-pick preference for live drafts (LS-427)
 * - When enabled, the system immediately picks for the team as soon as it is
 *   their turn on the clock, rather than waiting for the deadline to expire
 * - Also set automatically when a team misses a pick (deadline expires)
 *
 * Changes:
 * - Adds `auto_pick BOOLEAN NOT NULL DEFAULT FALSE` to public.draft_teams
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.draft_teams
      ADD COLUMN IF NOT EXISTS auto_pick BOOLEAN NOT NULL DEFAULT FALSE;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.draft_teams
      DROP COLUMN IF EXISTS auto_pick;
  `);
};
