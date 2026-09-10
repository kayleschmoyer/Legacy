import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add position column to league_scoring_change_log (LS-9721)
 *
 * Purpose:
 * - `league_scoring_change_log` predates LS-9104's position bonuses and has
 *   no `position` column. LS-9665 carries the position in the free-text
 *   `change_reason varchar(120)` as `position_bonus:<POSITION>`, which is
 *   lossless for the staleness signal (reads only `changed_at`) but hurts
 *   audit query ergonomics — filtering/grouping by position requires a
 *   `LIKE 'position_bonus:%'` string match instead of a column predicate.
 *
 * Approach:
 * - Add a nullable `position varchar(10)` column (base-multiplier rows have
 *   no position, so NULL is the correct baseline).
 * - Backfill existing `position_bonus:<POSITION>`-prefixed `change_reason`
 *   rows: parse the position out, write it to the new column, and clear
 *   `change_reason` on those rows now that the position lives in its own
 *   column. This is a safe backfill — the value is derivable exactly from
 *   data already in the row.
 */

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_scoring_change_log
    ADD COLUMN position varchar(10);
  `);

  await db.execute(`
    UPDATE public.league_scoring_change_log
    SET position = substring(change_reason FROM 'position_bonus:(.*)'),
        change_reason = NULL
    WHERE change_reason LIKE 'position_bonus:%';
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // No-op: `change_reason` was cleared on backfilled rows in `up` and cannot
  // be reconstructed (the original free-text value is gone), so restoring
  // the pre-migration `position_bonus:<POSITION>` string would require data
  // we no longer have. Only the column itself is reversible.
  await db.execute(`
    ALTER TABLE public.league_scoring_change_log
    DROP COLUMN IF EXISTS position;
  `);
};
