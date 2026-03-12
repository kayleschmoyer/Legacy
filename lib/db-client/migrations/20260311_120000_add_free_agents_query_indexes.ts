import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add indexes to support freeAgents query optimization (LS-1081)
 *
 * Purpose:
 * - Support the LEFT JOIN … IS NULL pattern used to exclude rostered players:
 *     LEFT JOIN team_members tm ON tm.player_id = p.id AND tm.league_id = ?
 *     WHERE tm.player_id IS NULL
 * - Support ORDER BY last_name, first_name without a full-sort on the players
 *   table by providing a covering index that Postgres can scan in order.
 *
 * Changes:
 * - team_members(league_id, player_id): composite for the JOIN condition above.
 *   The existing single-column indexes (team_members_league_id_idx and
 *   team_members_player_id_idx) cannot satisfy a composite predicate as
 *   efficiently as a single composite index. league_id is first because the
 *   join condition filters on a specific league before matching player_id.
 * - players(last_name, first_name): supports the ORDER BY clause on the outer
 *   query so Postgres can return rows already sorted rather than sorting the
 *   entire filtered result set.
 *
 * Notes:
 * - season_batting(lg_id, player_id) was already added by migration
 *   20260310_060000_add_query_performance_indexes (idx_season_batting_lgid_playerid).
 *   No duplicate is created here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Composite index on team_members(league_id, player_id) for the
  //    LEFT JOIN anti-join pattern in freeAgents.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_team_members_league_player
    ON public.team_members (league_id, player_id)
  `);

  // 2. Composite index on players(last_name, first_name) for the ORDER BY
  //    clause in freeAgents so the planner avoids a full sort step.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_players_last_name_first_name
    ON public.players (last_name, first_name)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS public.idx_team_members_league_player;
    DROP INDEX IF EXISTS public.idx_players_last_name_first_name;
  `);
};
