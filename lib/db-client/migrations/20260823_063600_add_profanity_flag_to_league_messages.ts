import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add contains_profanity to league_messages (LS-6296)
 *
 * Purpose:
 * - League chat (sendLeagueMessage) had no profanity detection at all, unlike
 *   matchup chat which carries a `contains_profanity` flag on
 *   `matchup_messages` (see 20251108_050000_add_matchup_chat_system.ts).
 *   Adds the same flag to `league_messages` so the resolver can persist the
 *   result of a server-side profanity check (FLD-044).
 *
 * Changes:
 * - Add `contains_profanity` boolean NOT NULL DEFAULT false.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      ADD COLUMN IF NOT EXISTS contains_profanity boolean NOT NULL DEFAULT false;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      DROP COLUMN IF EXISTS contains_profanity;
  `);
};
