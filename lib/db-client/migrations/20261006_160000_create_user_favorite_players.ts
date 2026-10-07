/**
 * Migration: Create public.user_favorite_players (LS-10861)
 * Created: 2026-10-06
 * Ticket: LS-10861 (slice 1 of LS-10789, "Global favorite players")
 *
 * Starred players in the draft room were plain component state and vanished
 * on reload. Product decision (LS-10789): stars become global per-user
 * favorites, server-backed and shared across every league and draft. They are
 * kept separate from the per-draft draft_queue.
 *
 * Changes:
 * - Creates public.user_favorite_players: one row per (user, player). Rows
 *   cascade when the user or the player is deleted.
 * - sport is denormalised from players.sport so myFavoritePlayers(sport) can
 *   filter without a join.
 * - UNIQUE (user_id, player_id) makes addFavoritePlayer idempotent
 *   (ON CONFLICT DO NOTHING) and also serves user_id lookups.
 *
 * Additive only, so it is safe ahead of any lambda deploy. Re-runnable.
 */

interface MigrationDb {
  execute: (query: string) => Promise<unknown>;
}

export const up = async ({ db }: { db: MigrationDb }): Promise<void> => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.user_favorite_players (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
      sport sport_kind NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT user_favorite_players_user_id_player_id_uk UNIQUE (user_id, player_id)
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS user_favorite_players_player_id_idx
      ON public.user_favorite_players(player_id);
  `);
};

export const down = async ({ db }: { db: MigrationDb }): Promise<void> => {
  await db.execute(`DROP TABLE IF EXISTS public.user_favorite_players;`);
};
