import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add draft_queue table (LS-473)
 *
 * Purpose:
 * - Allow users to set a ranked queue of players they want the auto-pick
 *   system to select on their behalf.
 * - When auto-pick fires, the system checks this queue first (ordered by
 *   priority ASC) and picks the first available, eligible, undrafted player.
 *   Falls back to the FPG × positional-scarcity algorithm if the queue is
 *   empty or all queued players have already been taken.
 *
 * Changes:
 * - Creates public.draft_queue table with (draft_id, team_id, player_id, priority)
 * - Unique constraint on (draft_id, team_id, player_id) — one entry per player
 * - Unique constraint on (draft_id, team_id, priority) — no duplicate priorities
 * - Indexes for fast lookup by draft+team
 * - Cascade on draft deletion
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.draft_queue (
      id          SERIAL PRIMARY KEY,
      draft_id    INTEGER NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
      team_id     INTEGER NOT NULL,
      player_id   INTEGER NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
      priority    INTEGER NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT draft_queue_uk_draft_team_player
        UNIQUE (draft_id, team_id, player_id),

      CONSTRAINT draft_queue_uk_draft_team_priority
        UNIQUE (draft_id, team_id, priority)
    );

    CREATE INDEX IF NOT EXISTS draft_queue_draft_team_idx
      ON public.draft_queue (draft_id, team_id);

    CREATE INDEX IF NOT EXISTS draft_queue_player_idx
      ON public.draft_queue (player_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS public.draft_queue;
  `);
};
