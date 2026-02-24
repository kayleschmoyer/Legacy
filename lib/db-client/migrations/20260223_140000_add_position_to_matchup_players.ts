import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add positionId to matchup_players
 *
 * Purpose:
 * - Store the position assignment per-matchup so rosters are preserved historically
 * - Previously, positions were looked up from team_members at query time, which
 *   meant dropped players lost their position info for past matchups
 * - Enables matchup-specific lineup management independent of the active roster
 *
 * Changes:
 * - Add position_id column to matchup_players (nullable FK → league_positions)
 * - Backfill existing matchup_players with positions from team_members
 * - Add index on matchup_id + team_id for efficient roster queries
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Add position_id column to matchup_players
  await db.execute(`
    ALTER TABLE public.matchup_players
    ADD COLUMN IF NOT EXISTS position_id INTEGER
    REFERENCES public.league_positions(id);
  `);

  // 2. Backfill existing matchup_players with positions from team_members
  await db.execute(`
    UPDATE public.matchup_players mp
    SET position_id = tm.position_id
    FROM public.team_members tm
    WHERE mp.player_id = tm.player_id
      AND mp.team_id = tm.team_id
      AND mp.position_id IS NULL
      AND tm.position_id IS NOT NULL;
  `);

  // 3. Add composite index for efficient matchup roster lookups
  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_players_matchup_team_idx
    ON public.matchup_players(matchup_id, team_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS matchup_players_matchup_team_idx;
  `);

  await db.execute(`
    ALTER TABLE public.matchup_players
    DROP COLUMN IF EXISTS position_id;
  `);
};
