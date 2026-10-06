import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: backfill players.total_games for football (LS-10647)
 *
 * total_games was only ever written by the baseball career loader, so every
 * football row kept the column default of 0. 20 Questions builds its medium
 * and hard pools from total_games, so Football Medium/Hard had empty pools and
 * startGame threw "No eligible players found for difficulty".
 *
 * Football total_games = career games played: the max `g` across the
 * career_football_* tables (a player's rushing and receiving rows describe the
 * same games, so summing would double-count). load-football-career-stats.ts
 * now maintains the same value on every load.
 *
 * Data-only and idempotent; no DDL.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    UPDATE players p
    SET total_games = GREATEST(
      COALESCE((SELECT g FROM career_football_passing   WHERE player_id = p.id), 0),
      COALESCE((SELECT g FROM career_football_rushing   WHERE player_id = p.id), 0),
      COALESCE((SELECT g FROM career_football_receiving WHERE player_id = p.id), 0),
      COALESCE((SELECT g FROM career_football_kicking   WHERE player_id = p.id), 0),
      COALESCE((SELECT g FROM career_football_defense   WHERE player_id = p.id), 0),
      COALESCE((SELECT MAX(g) FROM career_football_defense_idp WHERE player_id = p.id), 0)
    )
    WHERE p.sport = 'football';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    UPDATE players SET total_games = 0 WHERE sport = 'football';
  `);
};
