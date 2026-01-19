import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add primary keys to game stats tables
 *
 * Purpose:
 * - Add PRIMARY KEY constraints to game_batting, game_pitching, game_fielding
 * - Prevents duplicate records when loading stats
 * - Makes onConflictDoNothing() actually work
 * - Removes any existing duplicates before adding constraint
 *
 * Changes:
 * - game_batting: PK on (player_id, season, game_number)
 * - game_pitching: PK on (player_id, season, game_num)
 * - game_fielding: PK on (player_id, season, game_num, pos)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Remove duplicates from game_batting (keep first occurrence)
  await db.execute(`
    DELETE FROM game_batting
    WHERE ctid NOT IN (
      SELECT MIN(ctid)
      FROM game_batting
      GROUP BY player_id, season, game_number
    );
  `);

  // Add primary key to game_batting
  await db.execute(`
    ALTER TABLE game_batting
    ADD PRIMARY KEY (player_id, season, game_number);
  `);

  // Remove duplicates from game_pitching
  await db.execute(`
    DELETE FROM game_pitching
    WHERE ctid NOT IN (
      SELECT MIN(ctid)
      FROM game_pitching
      GROUP BY player_id, season, game_num
    );
  `);

  // Add primary key to game_pitching
  await db.execute(`
    ALTER TABLE game_pitching
    ADD PRIMARY KEY (player_id, season, game_num);
  `);

  // Remove duplicates from game_fielding
  await db.execute(`
    DELETE FROM game_fielding
    WHERE ctid NOT IN (
      SELECT MIN(ctid)
      FROM game_fielding
      GROUP BY player_id, season, game_num
    );
  `);

  // Add primary key to game_fielding
  await db.execute(`
    ALTER TABLE game_fielding
    ADD PRIMARY KEY (player_id, season, game_num);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Remove primary keys
  await db.execute(`
    ALTER TABLE game_batting DROP CONSTRAINT IF EXISTS game_batting_pkey;
  `);

  await db.execute(`
    ALTER TABLE game_pitching DROP CONSTRAINT IF EXISTS game_pitching_pkey;
  `);

  await db.execute(`
    ALTER TABLE game_fielding DROP CONSTRAINT IF EXISTS game_fielding_pkey;
  `);
};
