/**
 * Migration: Add partial unique index on matchup_chat_blocks for league-scoped blocks
 * Created: 2026-08-23
 * Ticket: LS-6297
 *
 * blockLeagueChatUser (LS-6297) does a SELECT-then-INSERT to avoid duplicate
 * blocks, but that check isn't atomic — two concurrent requests can both pass
 * the check and both insert, producing duplicate rows for the same
 * (blocking_user_id, blocked_user_id, league_id) pair. Scoped to
 * scope = 'league' only (matching the Badges table's partial-index pattern)
 * so it doesn't constrain the unused matchup-scoped block path, which may
 * legitimately want per-matchup rows for the same user pair in the future.
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Defensive dedupe: keep the earliest row per key in case any duplicates
  // already exist, so the unique index below can be created.
  await db.execute(`
    DELETE FROM matchup_chat_blocks a
      USING matchup_chat_blocks b
      WHERE a.scope = 'league'
        AND b.scope = 'league'
        AND a.blocking_user_id = b.blocking_user_id
        AND a.blocked_user_id = b.blocked_user_id
        AND a.league_id = b.league_id
        AND a.id > b.id;
  `);

  await db.execute(`
    CREATE UNIQUE INDEX matchup_chat_blocks_league_uk
      ON matchup_chat_blocks(blocking_user_id, blocked_user_id, league_id)
      WHERE scope = 'league';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`DROP INDEX IF EXISTS matchup_chat_blocks_league_uk;`);
};
