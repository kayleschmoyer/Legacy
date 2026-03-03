import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create Season Draft Game tables
 *
 * Purpose:
 * - Add Season Draft Game feature — a standalone turn-based drafting game
 *   where players select baseball player + season combos to fill roster slots.
 *
 * Changes:
 * - Create enum type season_draft_game_status
 * - Create table season_draft_games
 * - Create table season_draft_players
 * - Create table season_draft_roster_slots
 * - Create table season_draft_picks
 * - Add foreign keys, indexes, and unique constraints
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create the enum
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE season_draft_game_status AS ENUM ('setup', 'drafting', 'completed', 'cancelled');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 2. Create season_draft_games
  await db.execute(`
    CREATE TABLE IF NOT EXISTS season_draft_games (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_by INTEGER NOT NULL,
      status season_draft_game_status NOT NULL DEFAULT 'setup',
      num_players INTEGER NOT NULL,
      current_turn INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      started_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE
    );

    CREATE INDEX IF NOT EXISTS season_draft_games_status_idx
      ON season_draft_games(status);
    CREATE INDEX IF NOT EXISTS season_draft_games_created_by_idx
      ON season_draft_games(created_by);
  `);

  // 3. Create trigger for updated_at
  await db.execute(`
    CREATE TRIGGER season_draft_games_updated_at_trigger
    BEFORE UPDATE ON public.season_draft_games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // 4. Create season_draft_players
  await db.execute(`
    CREATE TABLE IF NOT EXISTS season_draft_players (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      player_name VARCHAR(255) NOT NULL,
      draft_order INTEGER NOT NULL,
      total_score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT season_draft_players_game_fk
        FOREIGN KEY (game_id) REFERENCES season_draft_games(id) ON DELETE CASCADE,
      CONSTRAINT season_draft_players_game_user_unique
        UNIQUE (game_id, user_id),
      CONSTRAINT season_draft_players_game_order_unique
        UNIQUE (game_id, draft_order)
    );

    CREATE INDEX IF NOT EXISTS season_draft_players_game_id_idx
      ON season_draft_players(game_id);
  `);

  // 5. Create trigger for updated_at
  await db.execute(`
    CREATE TRIGGER season_draft_players_updated_at_trigger
    BEFORE UPDATE ON public.season_draft_players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // 6. Create season_draft_roster_slots
  await db.execute(`
    CREATE TABLE IF NOT EXISTS season_draft_roster_slots (
      id SERIAL PRIMARY KEY,
      season_draft_player_id INTEGER NOT NULL,
      position VARCHAR(10) NOT NULL,
      slot_number INTEGER NOT NULL,
      is_filled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT season_draft_roster_slots_player_fk
        FOREIGN KEY (season_draft_player_id) REFERENCES season_draft_players(id) ON DELETE CASCADE,
      CONSTRAINT season_draft_roster_player_position_slot_unique
        UNIQUE (season_draft_player_id, position, slot_number)
    );

    CREATE INDEX IF NOT EXISTS season_draft_roster_slots_player_id_idx
      ON season_draft_roster_slots(season_draft_player_id);
  `);

  // 7. Create trigger for updated_at
  await db.execute(`
    CREATE TRIGGER season_draft_roster_slots_updated_at_trigger
    BEFORE UPDATE ON public.season_draft_roster_slots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // 8. Create season_draft_picks
  await db.execute(`
    CREATE TABLE IF NOT EXISTS season_draft_picks (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL,
      season_draft_player_id INTEGER NOT NULL,
      roster_slot_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      position VARCHAR(10) NOT NULL,
      stat_value INTEGER NOT NULL DEFAULT 0,
      pick_number INTEGER NOT NULL,
      picked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT season_draft_picks_game_fk
        FOREIGN KEY (game_id) REFERENCES season_draft_games(id) ON DELETE CASCADE,
      CONSTRAINT season_draft_picks_player_fk
        FOREIGN KEY (season_draft_player_id) REFERENCES season_draft_players(id) ON DELETE CASCADE,
      CONSTRAINT season_draft_picks_roster_slot_fk
        FOREIGN KEY (roster_slot_id) REFERENCES season_draft_roster_slots(id) ON DELETE CASCADE,
      CONSTRAINT season_draft_picks_baseball_player_fk
        FOREIGN KEY (player_id) REFERENCES players(id),
      CONSTRAINT season_draft_picks_roster_slot_unique
        UNIQUE (roster_slot_id),
      CONSTRAINT season_draft_picks_game_pick_number_unique
        UNIQUE (game_id, pick_number)
    );

    CREATE INDEX IF NOT EXISTS season_draft_picks_game_id_idx
      ON season_draft_picks(game_id);
    CREATE INDEX IF NOT EXISTS season_draft_picks_player_id_idx
      ON season_draft_picks(season_draft_player_id);
  `);

  // 9. Create trigger for updated_at
  await db.execute(`
    CREATE TRIGGER season_draft_picks_updated_at_trigger
    BEFORE UPDATE ON public.season_draft_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS season_draft_picks_updated_at_trigger ON public.season_draft_picks;
    DROP TABLE IF EXISTS season_draft_picks;
    DROP TRIGGER IF EXISTS season_draft_roster_slots_updated_at_trigger ON public.season_draft_roster_slots;
    DROP TABLE IF EXISTS season_draft_roster_slots;
    DROP TRIGGER IF EXISTS season_draft_players_updated_at_trigger ON public.season_draft_players;
    DROP TABLE IF EXISTS season_draft_players;
    DROP TRIGGER IF EXISTS season_draft_games_updated_at_trigger ON public.season_draft_games;
    DROP TABLE IF EXISTS season_draft_games;
    DROP TYPE IF EXISTS season_draft_game_status;
  `);
};
