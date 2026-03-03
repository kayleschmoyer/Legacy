import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add game configuration columns to Season Draft Game
 *
 * Purpose:
 * - Support stat selection (HR, Hits, RBI, etc.) at game-creation time
 * - Support two game modes: 'season' (player+year) and 'career_team' (player+team career)
 * - Support hitter vs pitcher drafts with different roster layouts
 *
 * Changes:
 * - Create enum season_draft_player_type
 * - Create enum season_draft_game_mode
 * - Add stat_key, game_mode, player_type columns to season_draft_games
 * - Add team column to season_draft_picks (for career_team mode)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create enums
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE season_draft_player_type AS ENUM ('hitter', 'pitcher');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE season_draft_game_mode AS ENUM ('season', 'career_team');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 2. Add columns to season_draft_games with defaults for backward compat
  await db.execute(`
    ALTER TABLE season_draft_games
      ADD COLUMN IF NOT EXISTS stat_key VARCHAR(20) NOT NULL DEFAULT 'hr',
      ADD COLUMN IF NOT EXISTS game_mode season_draft_game_mode NOT NULL DEFAULT 'season',
      ADD COLUMN IF NOT EXISTS player_type season_draft_player_type NOT NULL DEFAULT 'hitter';
  `);

  // 3. Add team column to season_draft_picks (nullable, only used in career_team mode)
  await db.execute(`
    ALTER TABLE season_draft_picks
      ADD COLUMN IF NOT EXISTS team VARCHAR(50);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE season_draft_picks DROP COLUMN IF EXISTS team;
  `);

  await db.execute(`
    ALTER TABLE season_draft_games
      DROP COLUMN IF EXISTS stat_key,
      DROP COLUMN IF EXISTS game_mode,
      DROP COLUMN IF EXISTS player_type;
  `);

  await db.execute(`
    DROP TYPE IF EXISTS season_draft_game_mode;
    DROP TYPE IF EXISTS season_draft_player_type;
  `);
};
