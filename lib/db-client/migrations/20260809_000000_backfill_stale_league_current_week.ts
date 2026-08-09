import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Backfill stale leagues.current_week / current_matchup (LS-9125).
 *
 * autoSelectGames' bootstrap step used to promote the lowest 'scheduled'
 * matchup week to 'in_progress' whenever a league had zero 'in_progress'
 * matchups, with no check against leagues.current_week. The stats lambda
 * (game-state-manager.ts::updateMatchupStatus) marks a matchup 'completed'
 * directly, independent of advanceLeagueWeekInternal — the only place that
 * bumps current_week. So a league could sit with zero in_progress matchups
 * between the stats lambda completing the current week and the Sunday
 * autoAdvanceMatchups cron promoting the next one; if autoSelectGames' nightly
 * run landed in that gap, it activated the next scheduled week itself,
 * leaving current_week permanently stuck while matchups kept progressing
 * (e.g. league 5670 stuck on "week 1/10" with 3 completed weeks).
 *
 * The code path is fixed to gate on current_week (see
 * lambdas/db/src/schema/matchups/scheduled-mutations.ts). This migration
 * repairs leagues already left inconsistent by the old behavior: for each
 * league whose current_week trails the earliest non-completed matchup week,
 * advance current_week/current_matchup to match reality. Only ever moves
 * current_week forward, never backward, so it is safe to re-run.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    UPDATE leagues l
       SET current_week = sub.week_number,
           current_matchup = sub.matchup_id
      FROM (
        SELECT DISTINCT ON (league_id)
               league_id,
               week_number,
               id AS matchup_id
          FROM matchups
         WHERE status IN ('in_progress', 'scheduled')
         ORDER BY league_id, week_number ASC, id ASC
      ) sub
     WHERE l.id = sub.league_id
       AND l.current_week IS NOT NULL
       AND l.current_week < sub.week_number;
  `);
};

export const down = async (_ctx: { db: PgDatabase<any> }): Promise<void> => {
  // Intentional no-op: reverting would re-introduce the stale current_week
  // values this migration fixes and is not a meaningful rollback.
};
