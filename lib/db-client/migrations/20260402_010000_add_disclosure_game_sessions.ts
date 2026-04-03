import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add disclosure_game_sessions table for the progressive disclosure minigame (LS-2106)
 *
 * Creates:
 *  - disclosure_session_status  ENUM — active | won | lost | given_up
 *  - disclosure_game_sessions   TABLE — one row per played game session
 *
 * Depends on: 20260402_000000_add_player_facts_table (player_facts table must exist)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE disclosure_session_status AS ENUM (
        'active',
        'won',
        'lost',
        'given_up'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS disclosure_game_sessions (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL,
      player_id        INTEGER NOT NULL
                         REFERENCES players(id),
      status           disclosure_session_status NOT NULL DEFAULT 'active',
      clues_revealed   INTEGER NOT NULL DEFAULT 0,
      ordered_fact_ids JSONB NOT NULL,
      score            INTEGER,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at     TIMESTAMPTZ
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS disclosure_game_sessions_user_id_idx
      ON disclosure_game_sessions (user_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS disclosure_game_sessions_status_idx
      ON disclosure_game_sessions (status);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS disclosure_game_sessions;`);
  await db.execute(`DROP TYPE IF EXISTS disclosure_session_status;`);
};
