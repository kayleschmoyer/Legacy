import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add unique slot constraint to matchup_players
 *
 * Purpose:
 * - Enforce that only one player per team can occupy a given position slot in a
 *   matchup at a time.
 * - Previously there was no DB-level constraint, which allowed the
 *   updateMatchupPlayerPosition mutation to leave two players at the same slot
 *   when the previous occupant was not cleared first.
 *
 * Changes:
 * - Deduplicate any existing rows that share (matchup_id, team_id, position_id)
 *   by keeping the most recently updated row and moving duplicates to the bench
 *   (position_id = NULL).
 * - Add a partial unique index on (matchup_id, team_id, position_id) WHERE
 *   position_id IS NOT NULL. A partial index is used so multiple bench players
 *   (position_id IS NULL) remain allowed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Deduplicate: for each (matchup_id, team_id, position_id) group that has
  //    more than one row, keep the row with the highest id (most recently
  //    inserted) and null-out the rest.
  await db.execute(`
    UPDATE public.matchup_players
    SET position_id = NULL
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY matchup_id, team_id, position_id
            ORDER BY id DESC
          ) AS rn
        FROM public.matchup_players
        WHERE position_id IS NOT NULL
      ) ranked
      WHERE rn > 1
    );
  `);

  // 2. Add a partial unique index so the DB enforces one player per slot.
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS matchup_players_unique_slot_idx
    ON public.matchup_players (matchup_id, team_id, position_id)
    WHERE position_id IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS public.matchup_players_unique_slot_idx;
  `);
};
