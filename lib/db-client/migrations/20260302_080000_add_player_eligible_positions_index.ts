import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add index on player_eligible_positions(player_id)
 *
 * Purpose:
 * - Fix a severe query performance issue where loading a team roster causes
 *   a full sequential scan on player_eligible_positions for every request.
 *
 * Root cause:
 * - The `createEligiblePositionsLoader` DataLoader in lambdas/db fires a
 *   `SELECT ... WHERE player_id IN (...)` query for up to 25 player IDs at once.
 * - Without an index, each such query does a full table scan (1659ms+ on dev data),
 *   causing the GetTeamMembers GraphQL query to time out.
 * - Apollo returns undefined on timeout → frontend falls back to `|| []` →
 *   roster page shows all player slots as empty even though the data exists.
 *
 * Changes:
 * - Add `idx_player_eligible_positions_player_id` on `player_eligible_positions(player_id)`
 *
 * Tracked by: LS-371
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_player_eligible_positions_player_id
      ON public.player_eligible_positions (player_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS public.idx_player_eligible_positions_player_id;
  `);
};
