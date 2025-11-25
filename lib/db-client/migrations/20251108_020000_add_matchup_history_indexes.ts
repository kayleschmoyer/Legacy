/**
 * Migration: Add matchup history indexes
 * Created: 2025-11-08
 * Ticket: LS-22
 *
 * Adds performance indexes for matchup history and standings queries:
 * - League + season composite index
 * - League + status composite index
 * - Team participation indexes (team1_id, team2_id)
 * - Time-based queries (end_time DESC)
 * - League + team + status composite indexes
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Composite index for league + season queries (most common)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchups_league_season 
      ON matchups (league_id, selected_season);
  `);

  // Index for league + status queries (for completed matchups)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchups_league_status 
      ON matchups (league_id, status);
  `);

  // Index for team participation queries (head-to-head records)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchups_team1 
      ON matchups (team1_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchups_team2 
      ON matchups (team2_id);
  `);

  // Index for time-based queries (recent matchups, date ranges)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchups_end_time 
      ON matchups (end_time DESC);
  `);

  // Composite index for league + team + status (team history queries)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchups_league_team1_status 
      ON matchups (league_id, team1_id, status);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchups_league_team2_status 
      ON matchups (league_id, team2_id, status);
  `);

  // Add comments for documentation
  await db.execute(`
    COMMENT ON INDEX idx_matchups_league_season IS 'Optimizes queries for league standings filtered by season';
    COMMENT ON INDEX idx_matchups_league_status IS 'Optimizes queries for completed matchups in a league';
    COMMENT ON INDEX idx_matchups_team1 IS 'Optimizes head-to-head and team history queries';
    COMMENT ON INDEX idx_matchups_team2 IS 'Optimizes head-to-head and team history queries';
    COMMENT ON INDEX idx_matchups_end_time IS 'Optimizes recent matchup queries sorted by end time';
    COMMENT ON INDEX idx_matchups_league_team1_status IS 'Optimizes team-specific matchup history queries';
    COMMENT ON INDEX idx_matchups_league_team2_status IS 'Optimizes team-specific matchup history queries';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop all indexes (in reverse order)
  await db.execute(`DROP INDEX IF EXISTS idx_matchups_league_team2_status;`);
  await db.execute(`DROP INDEX IF EXISTS idx_matchups_league_team1_status;`);
  await db.execute(`DROP INDEX IF EXISTS idx_matchups_end_time;`);
  await db.execute(`DROP INDEX IF EXISTS idx_matchups_team2;`);
  await db.execute(`DROP INDEX IF EXISTS idx_matchups_team1;`);
  await db.execute(`DROP INDEX IF EXISTS idx_matchups_league_status;`);
  await db.execute(`DROP INDEX IF EXISTS idx_matchups_league_season;`);
};
