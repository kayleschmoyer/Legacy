import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add player_id indexes on career_batting, career_fielding, career_pitching
 *
 * Purpose:
 * - pg_stat_statements shows several sequential scans on career stats tables
 * - career_batting player_id lookups: ~5,588ms mean (50 calls, 5.1% of total DB time)
 * - career_fielding player_id lookups: ~579–1,371ms mean across many call sets
 * - career_pitching: same pattern (no index on player_id)
 *
 * Changes:
 * - CREATE INDEX idx_career_batting_player_id ON career_batting (player_id)
 * - CREATE INDEX idx_career_fielding_player_id ON career_fielding (player_id)
 * - CREATE INDEX idx_career_pitching_player_id ON career_pitching (player_id)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_career_batting_player_id ON career_batting (player_id);
    CREATE INDEX IF NOT EXISTS idx_career_fielding_player_id ON career_fielding (player_id);
    CREATE INDEX IF NOT EXISTS idx_career_pitching_player_id ON career_pitching (player_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS idx_career_batting_player_id;
    DROP INDEX IF EXISTS idx_career_fielding_player_id;
    DROP INDEX IF EXISTS idx_career_pitching_player_id;
  `);
};
