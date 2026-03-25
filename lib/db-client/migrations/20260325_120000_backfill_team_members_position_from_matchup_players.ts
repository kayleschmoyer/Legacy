import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Backfill team_members.positionId from matchup_players (LS-1767)
 *
 * Purpose:
 * - LS-1761 fixed `autoPopulateFirstMatchupLineup()` to mirror position
 *   assignments from `matchup_players` to `team_members` for NEW drafts.
 * - However, leagues drafted before that fix still have
 *   `team_members.position_id = NULL` for all players, causing the
 *   My Roster page to show an empty lineup (all players on bench).
 *
 * Approach:
 * - For each team_member with position_id IS NULL, copy the position_id
 *   from the most recent matchup_players row (by matchup week_number DESC)
 *   that has a non-null position_id for the same (team_id, player_id).
 * - Uses DISTINCT ON to pick one assignment per (team_id, player_id).
 * - Respects the unique constraint team_members_uk_team_position by only
 *   assigning a position if no other team_member on the same team already
 *   holds that position.
 */

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Backfill in a single idempotent UPDATE.
  // The CTE finds the "best" position assignment for each (team_id, player_id)
  // from matchup_players, preferring the most recent matchup week.
  // The WHERE clause ensures we don't violate the unique (team_id, position_id)
  // constraint on team_members.
  await db.execute(`
    WITH latest_mp_positions AS (
      SELECT DISTINCT ON (mp.team_id, mp.player_id)
        mp.team_id,
        mp.player_id,
        mp.position_id,
        m.league_id
      FROM public.matchup_players mp
      JOIN public.matchups m ON m.id = mp.matchup_id
      WHERE mp.position_id IS NOT NULL
      ORDER BY mp.team_id, mp.player_id, m.week_number DESC, m.end_time DESC NULLS LAST, m.id DESC
    )
    UPDATE public.team_members tm
    SET position_id = lmp.position_id
    FROM latest_mp_positions lmp
    WHERE tm.team_id = lmp.team_id
      AND tm.player_id = lmp.player_id
      AND tm.league_id = lmp.league_id
      AND tm.position_id IS NULL
      -- Respect the unique constraint: only assign if no other team_member
      -- on the same team already occupies this position.
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_members tm2
        WHERE tm2.team_id = tm.team_id
          AND tm2.position_id = lmp.position_id
      );
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // No-op: we cannot reliably distinguish positions that were backfilled by
  // this migration from positions manually set by users or populated by the
  // fixed autoPopulateFirstMatchupLineup. Rolling back would risk clearing
  // legitimate user-set positions.
  await db.execute(`SELECT 1 /* LS-1767 down: intentional no-op */`);
};
