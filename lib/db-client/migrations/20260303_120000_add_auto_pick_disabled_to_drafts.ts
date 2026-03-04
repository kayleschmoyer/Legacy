import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add auto_pick_disabled flag to drafts (LS-481)
 *
 * Purpose:
 * - Allows the commissioner to disable auto-pick for the entire draft
 * - When true, the system will not automatically make picks when deadlines
 *   expire, and individual teams cannot enable their own auto-pick toggle
 * - Gives commissioners full manual control over a live draft
 *
 * Changes:
 * - Adds `auto_pick_disabled BOOLEAN NOT NULL DEFAULT FALSE` to public.drafts
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.drafts
      ADD COLUMN IF NOT EXISTS auto_pick_disabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.drafts
      DROP COLUMN IF EXISTS auto_pick_disabled;
  `);
};
