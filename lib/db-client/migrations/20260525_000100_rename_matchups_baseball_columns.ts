import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Rename baseball-specific column in the matchups table
 *
 * Purpose: Make it explicit which columns are baseball-only so developers
 * working on football code are not confused by ambiguous names.
 *
 * Renames:
 * - sp_starts_per_matchup → pitcher_starts_per_matchup
 *
 * Pure rename — no data movement, no default changes, no type changes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.matchups
    RENAME COLUMN sp_starts_per_matchup TO pitcher_starts_per_matchup;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.matchups
    RENAME COLUMN pitcher_starts_per_matchup TO sp_starts_per_matchup;
  `);
};
