/**
 * Migration: Add team_id to matchup_players
 * Created: 2025-11-11
 *
 * Adds team_id column to matchup_players table to track which team
 * each player belongs to in a matchup. This supports the auto-population
 * feature where players are automatically assigned to matchups with
 * random historical seasons.
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Add team_id column to matchup_players (nullable first for existing data)
  await db.execute(`
    ALTER TABLE matchup_players
    ADD COLUMN team_id INTEGER;
  `);

  // For existing rows, we need to populate team_id
  // Get the team from the team_members table based on player_id
  await db.execute(`
    UPDATE matchup_players mp
    SET team_id = tm.team_id
    FROM team_members tm
    WHERE mp.player_id = tm.player_id
    AND mp.team_id IS NULL;
  `);

  // Now make it NOT NULL
  await db.execute(`
    ALTER TABLE matchup_players
    ALTER COLUMN team_id SET NOT NULL;
  `);

  // Add foreign key constraint
  await db.execute(`
    ALTER TABLE matchup_players
    ADD CONSTRAINT matchup_players_team_fk
    FOREIGN KEY (team_id) REFERENCES teams(id);
  `);

  // Add index for better query performance
  await db.execute(`
    CREATE INDEX matchup_players_team_id_idx ON matchup_players(team_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop index
  await db.execute(`
    DROP INDEX IF EXISTS matchup_players_team_id_idx;
  `);

  // Drop foreign key constraint
  await db.execute(`
    ALTER TABLE matchup_players
    DROP CONSTRAINT IF EXISTS matchup_players_team_fk;
  `);

  // Drop column
  await db.execute(`
    ALTER TABLE matchup_players
    DROP COLUMN IF EXISTS team_id;
  `);
};
