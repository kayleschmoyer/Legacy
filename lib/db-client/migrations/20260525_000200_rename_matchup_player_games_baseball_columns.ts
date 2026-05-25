import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Rename baseball-specific columns in the matchup_player_games table
 *
 * Purpose: Make it explicit which columns are baseball-only so developers
 * working on football code are not confused by ambiguous names.
 *
 * Renames:
 * - sp_skipped      → pitcher_start_skipped
 * - fielding_game_pos → game_position
 *
 * Pure rename — no data movement, no default changes, no type changes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.matchup_player_games
    RENAME COLUMN sp_skipped TO pitcher_start_skipped;
  `);

  await db.execute(`
    ALTER TABLE public.matchup_player_games
    RENAME COLUMN fielding_game_pos TO game_position;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.matchup_player_games
    RENAME COLUMN game_position TO fielding_game_pos;
  `);

  await db.execute(`
    ALTER TABLE public.matchup_player_games
    RENAME COLUMN pitcher_start_skipped TO sp_skipped;
  `);
};
