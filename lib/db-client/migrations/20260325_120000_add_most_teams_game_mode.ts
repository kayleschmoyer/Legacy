import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add 'most_teams' game mode to Season Draft Game
 *
 * Purpose:
 * - Support a new draft minigame mode where the stat is COUNT(DISTINCT team)
 *   from season_batting/pitching — i.e., how many teams a player played for.
 *
 * Changes:
 * - Add 'most_teams' value to season_draft_game_mode enum
 */

export const up = async ({ db }: { db: PgDatabase<Record<string, unknown>> }) => {
  await db.execute(`
    ALTER TYPE season_draft_game_mode ADD VALUE IF NOT EXISTS 'most_teams';
  `);
};

export const down = async ({ db }: { db: PgDatabase<Record<string, unknown>> }) => {
  // PostgreSQL does not support removing enum values directly.
  // To roll back, recreate the type without 'most_teams' and update the column.
  await db.execute(`
    UPDATE season_draft_games SET game_mode = 'season' WHERE game_mode = 'most_teams';
  `);
  await db.execute(`
    ALTER TABLE season_draft_games ALTER COLUMN game_mode TYPE VARCHAR(20);
  `);
  await db.execute(`
    DROP TYPE IF EXISTS season_draft_game_mode;
    CREATE TYPE season_draft_game_mode AS ENUM ('season', 'career_team');
  `);
  await db.execute(`
    ALTER TABLE season_draft_games
      ALTER COLUMN game_mode TYPE season_draft_game_mode
      USING game_mode::season_draft_game_mode;
  `);
};
