import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Rename baseball-specific columns in the leagues table
 *
 * Purpose: Make it explicit which columns are baseball-only so developers
 * working on football code are not confused by ambiguous names.
 *
 * Renames:
 * - sp_starts_per_matchup  → pitcher_starts_per_matchup
 * - era_filter             → baseball_era_filter
 * - hof_only               → baseball_hof_only
 *
 * Pure rename — no data movement, no default changes, no type changes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
    RENAME COLUMN sp_starts_per_matchup TO pitcher_starts_per_matchup;
  `);

  await db.execute(`
    ALTER TABLE public.leagues
    RENAME COLUMN era_filter TO baseball_era_filter;
  `);

  await db.execute(`
    ALTER TABLE public.leagues
    RENAME COLUMN hof_only TO baseball_hof_only;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
    RENAME COLUMN baseball_hof_only TO hof_only;
  `);

  await db.execute(`
    ALTER TABLE public.leagues
    RENAME COLUMN baseball_era_filter TO era_filter;
  `);

  await db.execute(`
    ALTER TABLE public.leagues
    RENAME COLUMN pitcher_starts_per_matchup TO sp_starts_per_matchup;
  `);
};
