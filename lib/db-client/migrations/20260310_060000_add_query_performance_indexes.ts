import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add missing database indexes for query performance (LS-910)
 *
 * Purpose:
 * - Improve query performance for common access patterns identified via EXPLAIN ANALYZE
 *
 * Changes:
 * - player_eligible_positions(position): position-only filter for eligible position queries
 * - season_batting(lg_id, player_id): lg_id-leading composite for pool filtering
 * - matchup_player_games(matchup_player_id, game_num): composite for game-count queries
 *
 * Notes:
 * - Several indexes from the audit already exist:
 *   draft_picks(draft_id, player_id) → covered by unique constraint draft_picks_uk_draft_player
 *   career views(player_id) → underlying season tables already indexed on player_id
 *   teams(league_id) → teams_league_id_idx exists
 *   league_members(league_id) → covered by PK (league_id, user_id)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Materialized view: position-only index for position filtering
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_player_eligible_positions_position
    ON public.player_eligible_positions (position)
  `);

  // 2. season_batting: lg_id-leading composite for pool filtering
  //    Existing idx_season_batting_player_lgid is (player_id, lg_id) which
  //    doesn't help when filtering by lg_id first.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_season_batting_lgid_playerid
    ON public.season_batting (lg_id, player_id)
  `);

  // 3. matchup_player_games: composite for game-count queries
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchup_player_games_player_game
    ON public.matchup_player_games (matchup_player_id, game_num)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS public.idx_player_eligible_positions_position;
    DROP INDEX IF EXISTS public.idx_season_batting_lgid_playerid;
    DROP INDEX IF EXISTS public.idx_matchup_player_games_player_game;
  `);
};
