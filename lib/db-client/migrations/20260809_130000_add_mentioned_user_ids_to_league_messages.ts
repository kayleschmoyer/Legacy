import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add mentioned_user_ids to league_messages (LS-9216)
 *
 * Purpose:
 * - Persist which league members were @mentioned in a chat message so the
 *   server can push-notify them, and clients can eventually query "messages
 *   that mention me". Follow-up to LS-9097 (client-only @mention UI).
 *
 * Changes:
 * - Add `mentioned_user_ids` JSONB nullable — array of user ids resolved
 *   server-side from `@TeamName` tokens in the message text. Null/absent
 *   when the message has no mentions. A dedicated column (rather than
 *   reusing the existing `metadata` JSONB column) since `metadata` is
 *   already typed per messageType for system-event cards (trade/waiver
 *   payloads — see 20260226_120000_add_league_message_type.ts) and mixing
 *   concerns there would be confusing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      ADD COLUMN IF NOT EXISTS mentioned_user_ids JSONB;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      DROP COLUMN IF EXISTS mentioned_user_ids;
  `);
};
