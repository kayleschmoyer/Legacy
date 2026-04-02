import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add player_facts table for the progressive disclosure minigame (LS-2103)
 *
 * Creates:
 *  - player_fact_category  ENUM — career_stat | season_stat | award | team_history | transaction | achievement
 *  - difficulty_tier       ENUM — vague | moderate | identifying
 *  - player_facts          TABLE — clue pool used by the disclosure game sessions
 *
 * Seeding (populating facts from existing player/stats data) is handled by the
 * seed script at lib/db-client/src/seeds/seedPlayerFacts.ts and is intentionally
 * kept separate from this structural migration.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Enums
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE player_fact_category AS ENUM (
        'career_stat',
        'season_stat',
        'award',
        'team_history',
        'transaction',
        'achievement'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE difficulty_tier AS ENUM (
        'vague',
        'moderate',
        'identifying'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Core fact pool table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_facts (
      id              SERIAL PRIMARY KEY,
      player_id       INTEGER NOT NULL
                        REFERENCES players(id) ON DELETE CASCADE,
      clue_text       TEXT NOT NULL,
      category        player_fact_category NOT NULL,
      difficulty_tier difficulty_tier NOT NULL,
      season          SMALLINT,
      sort_order      INTEGER NOT NULL DEFAULT 0,

      CONSTRAINT player_facts_player_clue_unique UNIQUE (player_id, clue_text)
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS player_facts_player_id_idx
      ON player_facts (player_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS player_facts_player_tier_idx
      ON player_facts (player_id, difficulty_tier);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS player_facts;`);
  await db.execute(`DROP TYPE IF EXISTS difficulty_tier;`);
  await db.execute(`DROP TYPE IF EXISTS player_fact_category;`);
};
