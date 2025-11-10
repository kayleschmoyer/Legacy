/**
 * Migration: Add matchup team pairings and scoring
 * Created: 2025-11-08
 * Ticket: LS-18
 *
 * Adds support for team-based matchups with scoring:
 * - matchup_status enum for tracking matchup state
 * - Team pairing columns (team1_id, team2_id) with foreign keys
 * - Score tracking (team1_score, team2_score)
 * - Matchup timing and configuration
 * - League-level matchup configuration
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Create matchup status enum
  await db.execute(
    `CREATE TYPE matchup_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');`,
  );

  // Add team pairing columns to matchups table
  await db.execute(`
    ALTER TABLE matchups
      ADD COLUMN team1_id integer,
      ADD COLUMN team2_id integer;
  `);

  // Add score columns
  await db.execute(`
    ALTER TABLE matchups
      ADD COLUMN team1_score numeric(10, 2),
      ADD COLUMN team2_score numeric(10, 2);
  `);

  // Add status column with default
  await db.execute(`
    ALTER TABLE matchups
      ADD COLUMN status matchup_status NOT NULL DEFAULT 'scheduled';
  `);

  // Add matchup configuration columns
  await db.execute(`
    ALTER TABLE matchups
      ADD COLUMN selected_season integer,
      ADD COLUMN games_per_matchup integer,
      ADD COLUMN start_time timestamp,
      ADD COLUMN end_time timestamp;
  `);

  // Add foreign key constraints to teams
  await db.execute(`
    ALTER TABLE matchups
      ADD CONSTRAINT matchups_team1_fk
        FOREIGN KEY (team1_id)
        REFERENCES teams(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
      ADD CONSTRAINT matchups_team2_fk
        FOREIGN KEY (team2_id)
        REFERENCES teams(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;
  `);

  // Add league configuration columns for matchup rules
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN min_games_per_season integer DEFAULT 10,
      ADD COLUMN games_per_matchup integer DEFAULT 5;
  `);

  // Add column comments for documentation
  await db.execute(`
    COMMENT ON COLUMN matchups.team1_id IS 'First team in the matchup';
    COMMENT ON COLUMN matchups.team2_id IS 'Second team in the matchup';
    COMMENT ON COLUMN matchups.team1_score IS 'Score for team 1 after matchup completion';
    COMMENT ON COLUMN matchups.team2_score IS 'Score for team 2 after matchup completion';
    COMMENT ON COLUMN matchups.status IS 'Current status of the matchup';
    COMMENT ON COLUMN matchups.selected_season IS 'The single season used for all players in this matchup';
    COMMENT ON COLUMN matchups.games_per_matchup IS 'Number of games to select per player for this matchup';
    COMMENT ON COLUMN matchups.start_time IS 'When the matchup period begins';
    COMMENT ON COLUMN matchups.end_time IS 'When the matchup period ends';
    COMMENT ON COLUMN leagues.min_games_per_season IS 'Minimum games a player must have in a season for that season to be eligible for selection';
    COMMENT ON COLUMN leagues.games_per_matchup IS 'Default number of games to select per player per matchup';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop column comments
  await db.execute(`
    COMMENT ON COLUMN matchups.team1_id IS NULL;
    COMMENT ON COLUMN matchups.team2_id IS NULL;
    COMMENT ON COLUMN matchups.team1_score IS NULL;
    COMMENT ON COLUMN matchups.team2_score IS NULL;
    COMMENT ON COLUMN matchups.status IS NULL;
    COMMENT ON COLUMN matchups.selected_season IS NULL;
    COMMENT ON COLUMN matchups.games_per_matchup IS NULL;
    COMMENT ON COLUMN matchups.start_time IS NULL;
    COMMENT ON COLUMN matchups.end_time IS NULL;
    COMMENT ON COLUMN leagues.min_games_per_season IS NULL;
    COMMENT ON COLUMN leagues.games_per_matchup IS NULL;
  `);

  // Drop league configuration columns
  await db.execute(`
    ALTER TABLE leagues
      DROP COLUMN IF EXISTS min_games_per_season,
      DROP COLUMN IF EXISTS games_per_matchup;
  `);

  // Drop foreign key constraints
  await db.execute(`
    ALTER TABLE matchups
      DROP CONSTRAINT IF EXISTS matchups_team1_fk,
      DROP CONSTRAINT IF EXISTS matchups_team2_fk;
  `);

  // Drop matchup columns (in reverse order of creation)
  await db.execute(`
    ALTER TABLE matchups
      DROP COLUMN IF EXISTS end_time,
      DROP COLUMN IF EXISTS start_time,
      DROP COLUMN IF EXISTS games_per_matchup,
      DROP COLUMN IF EXISTS selected_season,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS team2_score,
      DROP COLUMN IF EXISTS team1_score,
      DROP COLUMN IF EXISTS team2_id,
      DROP COLUMN IF EXISTS team1_id;
  `);

  // Drop matchup status enum
  await db.execute(`DROP TYPE IF EXISTS matchup_status;`);
};
