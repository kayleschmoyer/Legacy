import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Make user_id nullable on league_messages
 *
 * Purpose:
 * - Allow "system messages" — automated notifications (trade actions, waiver
 *   wire results, draft setting changes) — to be stored in the league chat
 *   without being attributed to any specific user.
 * - Previously every message required a non-null user_id; system events were
 *   inserted with the acting user's id, which falsely attributed them.
 *
 * Changes:
 * - ALTER league_messages.user_id to DROP NOT NULL
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      ALTER COLUMN user_id DROP NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Re-add NOT NULL only after back-filling any nulls with a placeholder
  await db.execute(`
    UPDATE public.league_messages SET user_id = 0 WHERE user_id IS NULL;
    ALTER TABLE public.league_messages
      ALTER COLUMN user_id SET NOT NULL;
  `);
};
