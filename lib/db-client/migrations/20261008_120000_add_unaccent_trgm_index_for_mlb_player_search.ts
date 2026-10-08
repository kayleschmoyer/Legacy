import type { SQLWrapper } from 'drizzle-orm';

type MigrationDb = { execute: (query: SQLWrapper | string) => Promise<unknown> };

/**
 * Migration: GIN trigram index on the unaccented, lowercased full player name
 * for accent-insensitive MLB player search (LS-10728).
 *
 * buildPlayerNameSearch (lib/db-client/src/lib/query-builders/
 * TypeSafeQueryBuilder.ts) now matches
 * `lower(public.f_unaccent(first_name || ' ' || last_name)) ILIKE
 * public.f_unaccent('%term%')`, so "Rodriguez" finds Rodríguez and "Pena"
 * finds Peña. This index uses the identical expression so the planner can
 * keep using a trigram bitmap scan, as idx_players_name_trgm (LS-905) did for
 * the old accent-sensitive expression. idx_players_name_trgm is left in place;
 * dropping it is a separate cleanup once nothing reads that expression.
 *
 * public.f_unaccent() is the IMMUTABLE, search_path-safe wrapper created by
 * 20260614_060000 and fixed by 20261004_120000 — unaccent() itself is only
 * STABLE and cannot appear in an index expression.
 *
 * Idempotent: extensions and the index use IF NOT EXISTS, and an INVALID
 * leftover from an interrupted CONCURRENTLY build is dropped first so the
 * IF NOT EXISTS create cannot silently keep an unusable index. The migration
 * runner executes each statement in autocommit, so CONCURRENTLY is allowed.
 */

export const up = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  await db.execute(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await db.execute(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_index
        WHERE indexrelid = to_regclass('public.idx_players_unaccent_name_trgm')
          AND NOT indisvalid
      ) THEN
        DROP INDEX public.idx_players_unaccent_name_trgm;
      END IF;
    END
    $$
  `);
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_unaccent_name_trgm
      ON public.players
      USING gin ((lower(public.f_unaccent(first_name || ' ' || last_name))) gin_trgm_ops)
  `);
};

export const down = async ({ db }: { db: MigrationDb }) => {
  await db.execute(
    `DROP INDEX CONCURRENTLY IF EXISTS public.idx_players_unaccent_name_trgm`,
  );
};
