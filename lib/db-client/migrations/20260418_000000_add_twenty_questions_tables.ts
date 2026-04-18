import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    -- Add handedness columns to players (LS-1790)
    -- Populated by the Baseball Reference import pipeline; columns just need to exist.
    ALTER TABLE players ADD COLUMN IF NOT EXISTS bat_hand TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS throw_hand TEXT;

    -- Game sessions: one row per user per game attempt
    CREATE TABLE twenty_questions_games (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           INTEGER     NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      target_player_id  INTEGER     NOT NULL REFERENCES players(id),
      status            TEXT        NOT NULL DEFAULT 'active',
      questions_used    INTEGER     NOT NULL DEFAULT 0,
      max_questions     INTEGER     NOT NULL DEFAULT 20,
      difficulty        TEXT        NOT NULL,
      tokens_earned     INTEGER,
      started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at      TIMESTAMPTZ,
      CONSTRAINT tqg_status_check CHECK (status IN ('active', 'won', 'lost', 'abandoned')),
      CONSTRAINT tqg_difficulty_check CHECK (difficulty IN ('easy', 'medium', 'hard'))
    );

    CREATE INDEX idx_tqg_user_status ON twenty_questions_games(user_id, status);
    CREATE INDEX idx_tqg_started_at  ON twenty_questions_games(started_at DESC);

    -- Question log: one row per question asked within a game
    CREATE TABLE twenty_questions_questions (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id          UUID        NOT NULL REFERENCES twenty_questions_games(id) ON DELETE CASCADE,
      question_number  INTEGER     NOT NULL,
      category         TEXT        NOT NULL,
      parameter        JSONB       NOT NULL,
      answer           BOOLEAN     NOT NULL,
      is_guess         BOOLEAN     NOT NULL DEFAULT false,
      guess_player_id  INTEGER     REFERENCES players(id),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT tqq_category_check CHECK (
        category IN (
          'position', 'team', 'era', 'hall_of_fame',
          'stat_threshold', 'batting_hand', 'throwing_hand', 'active_status'
        )
      )
    );

    CREATE INDEX idx_tqq_game_id ON twenty_questions_questions(game_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS twenty_questions_questions;
    DROP TABLE IF EXISTS twenty_questions_games;
    ALTER TABLE players DROP COLUMN IF EXISTS bat_hand;
    ALTER TABLE players DROP COLUMN IF EXISTS throw_hand;
  `);
};
