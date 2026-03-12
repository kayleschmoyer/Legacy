import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add covering indexes on (player_id, season, game_identifier) (LS-1086)
 *
 * Purpose:
 * - Optimize SELECT DISTINCT game_identifier FROM game_batting/pitching
 *   WHERE player_id = ? AND season = ? in selectAndAssignGameIdentifiers().
 *
 * Without these indexes, PostgreSQL must:
 *   1. Use the (player_id, season) index to find matching rows
 *   2. Fetch game_identifier from the heap for each row
 *   3. Deduplicate in memory
 *
 * With these covering indexes, PostgreSQL can perform an index-only scan:
 *   1. Walk (player_id, season, game_identifier) tuples directly from the index
 *      (a DISTINCT/unique step still handles any duplicate tuples)
 *   2. Usually avoid heap fetches for game_identifier when the visibility map is warm
 *
 * Changes:
 * - game_batting: add covering index on (player_id, season, game_identifier)
 * - game_pitching: add covering index on (player_id, season, game_identifier)
 * - game_fielding: add covering index on (player_id, season, game_identifier)
 *   for consistency and future-proofing (no heap fetch if game_identifier is needed)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS game_batting_player_id_season_game_identifier_idx
      ON game_batting (player_id, season, game_identifier);
  `);
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS game_pitching_player_id_season_game_identifier_idx
      ON game_pitching (player_id, season, game_identifier);
  `);
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS game_fielding_player_id_season_game_identifier_idx
      ON game_fielding (player_id, season, game_identifier);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS game_batting_player_id_season_game_identifier_idx;
  `);
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS game_pitching_player_id_season_game_identifier_idx;
  `);
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS game_fielding_player_id_season_game_identifier_idx;
  `);
};
