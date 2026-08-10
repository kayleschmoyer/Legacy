import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add no_game_data_found column to matchup_player_games (LS-9122)
 *
 * `pitcher_start_skipped` was being reused for two unrelated situations:
 * (1) an SP probabilistically not starting for a game day (its real,
 * documented purpose), and (2) the stats lambda finding zero per-game box
 * scores for a player's assigned season after loading stats, for ANY
 * position — a data-availability gap, not an off day. Conflating the two
 * inflated the "off days" count shown to users for hitters who simply had
 * no scraped per-game data.
 *
 * `no_game_data_found` — true when selectAndAssignGameIdentifiers /
 * selectAndAssignFootballGameIdentifiers could not find any valid game
 * identifier for the player's assigned season; nullable-free, defaults
 * false like its sibling flag.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."matchup_player_games"
      ADD COLUMN IF NOT EXISTS "no_game_data_found" BOOLEAN NOT NULL DEFAULT false;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."matchup_player_games"
      DROP COLUMN IF EXISTS "no_game_data_found";
  `);
};
