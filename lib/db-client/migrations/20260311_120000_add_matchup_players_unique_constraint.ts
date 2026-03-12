import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add unique constraint to matchup_players
 *
 * Purpose:
 * - Enforce that a (matchup_id, player_id, team_id) combination is unique in
 *   matchup_players, eliminating the need for a prior SELECT to prevent
 *   duplicates on INSERT.
 * - Enables INSERT ... ON CONFLICT DO NOTHING to replace the N*2 SELECT+INSERT
 *   loop in addClaimedPlayerToCurrentMatchup (LS-1085).
 *
 * Changes:
 * - ADD UNIQUE CONSTRAINT matchup_players_matchup_player_team_unique
 *   ON matchup_players(matchup_id, player_id, team_id)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Remove duplicate rows before adding the unique constraint, but first
  // reassign any associated matchup_player_games records to a canonical
  // matchup_players row per (matchup_id, player_id, team_id) to avoid losing
  // existing matchup stats/history via ON DELETE CASCADE.
  await db.execute(`
    WITH matchup_player_candidates AS (
      SELECT
        mp.id,
        mp.matchup_id,
        mp.player_id,
        mp.team_id,
        COALESCE(mpg.game_count, 0) AS game_count,
        ROW_NUMBER() OVER (
          PARTITION BY mp.matchup_id, mp.player_id, mp.team_id
          ORDER BY COALESCE(mpg.game_count, 0) DESC, mp.id ASC
        ) AS rn
      FROM public.matchup_players mp
      LEFT JOIN (
        SELECT matchup_player_id, COUNT(*) AS game_count
        FROM public.matchup_player_games
        GROUP BY matchup_player_id
      ) AS mpg ON mpg.matchup_player_id = mp.id
    ),
    canonicals AS (
      SELECT id AS canonical_id, matchup_id, player_id, team_id
      FROM matchup_player_candidates WHERE rn = 1
    ),
    dupes AS (
      SELECT id AS duplicate_id, matchup_id, player_id, team_id
      FROM matchup_player_candidates WHERE rn > 1
    ),
    reassigned AS (
      UPDATE public.matchup_player_games AS g
      SET matchup_player_id = c.canonical_id
      FROM dupes d
      JOIN canonicals c
        ON c.matchup_id = d.matchup_id
       AND c.player_id = d.player_id
       AND c.team_id = d.team_id
      WHERE g.matchup_player_id = d.duplicate_id
      RETURNING 1
    )
    DELETE FROM public.matchup_players AS mp
    USING dupes d WHERE mp.id = d.duplicate_id;
  `);

  await db.execute(`
    ALTER TABLE public.matchup_players
    ADD CONSTRAINT matchup_players_matchup_player_team_unique
    UNIQUE (matchup_id, player_id, team_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.matchup_players
    DROP CONSTRAINT IF EXISTS matchup_players_matchup_player_team_unique;
  `);
};
