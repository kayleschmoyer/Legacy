import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add partial index for mock draft weekly count query (LS-5138)
 *
 * The initializeMockDraft mutation counts a user's mock drafts in the past 7 days:
 *   WHERE owner = $1 AND is_mock_draft = true AND created_at >= $2
 *
 * Without a covering index this is a sequential scan over all leagues rows.
 * A partial index (WHERE is_mock_draft = true) keeps the index small — only
 * mock draft rows are indexed — while fully covering the query predicate.
 * The two remaining filter columns (owner, created_at) become the index key.
 */
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_leagues_owner_created_at_mock
      ON public.leagues (owner, created_at)
      WHERE is_mock_draft = true;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP INDEX IF EXISTS public.idx_leagues_owner_created_at_mock;
  `);
};
