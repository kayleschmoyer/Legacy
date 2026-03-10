import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add composite (player_id, game_identifier) indexes
 *
 * Purpose:
 * - Optimize EXISTS subqueries that correlate game_batting ↔ game_pitching
 *   on (player_id, game_identifier) during game selection
 * - Replace expensive JOIN + DISTINCT with index-backed semi-join
 *
 * Changes:
 * - game_batting: add index on (player_id, game_identifier)
 * - game_pitching: add index on (player_id, game_identifier)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS game_batting_player_id_game_identifier_idx
      ON game_batting (player_id, game_identifier);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS game_pitching_player_id_game_identifier_idx
      ON game_pitching (player_id, game_identifier);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS game_batting_player_id_game_identifier_idx;
  `);
  await db.execute(`
    DROP INDEX IF EXISTS game_pitching_player_id_game_identifier_idx;
  `);
};
