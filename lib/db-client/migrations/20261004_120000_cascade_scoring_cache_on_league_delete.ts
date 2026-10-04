import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Cascade scoring-cache rows on league delete (LS-10555)
 *
 * Problem:
 * - player_scoring_cache.league_id and football_player_scoring_cache.league_id
 *   were created as bare INTEGER columns with no FK to leagues. Leagues are
 *   hard-deleted and child cleanup relies on ON DELETE CASCADE, so every
 *   deleted league left its per-league cache rows (one per player) behind.
 * - On dev, player_scoring_cache had grown to ~21.7M rows (7.4 GB), of which
 *   ~21.65M belonged to 593 league ids that no longer exist. Only the 23.6k
 *   default (league_id IS NULL) rows were live.
 *
 * Changes:
 * - player_scoring_cache: keep only default rows and rows whose league still
 *   exists, via copy → TRUNCATE → re-insert (instead of a DELETE of ~21.6M
 *   rows, which would leave the heap and indexes bloated), then add a
 *   league_id FK → leagues(id) ON DELETE CASCADE.
 * - football_player_scoring_cache: delete orphaned rows (none on dev today)
 *   and add the same FK.
 *
 * Each table's cleanup and FK add run in one db.execute() call. Postgres runs
 * a multi-statement simple query as a single implicit transaction, so a
 * league deleted mid-migration can't create an orphan between the cleanup and
 * the FK validation. The existing (league_id, player_id) unique index leads
 * with league_id, so the cascade delete is index-backed and needs no new
 * index.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TEMP TABLE player_scoring_cache_keep ON COMMIT DROP AS
      SELECT c.*
      FROM public.player_scoring_cache c
      WHERE c.league_id IS NULL
         OR EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = c.league_id);

    TRUNCATE public.player_scoring_cache;

    INSERT INTO public.player_scoring_cache
      SELECT * FROM player_scoring_cache_keep;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'player_scoring_cache_league_id_fkey'
          AND conrelid = 'public.player_scoring_cache'::regclass
      ) THEN
        ALTER TABLE public.player_scoring_cache
          ADD CONSTRAINT player_scoring_cache_league_id_fkey
          FOREIGN KEY (league_id) REFERENCES public.leagues(id)
          ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await db.execute(`
    DELETE FROM public.football_player_scoring_cache c
    WHERE c.league_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = c.league_id);

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'football_player_scoring_cache_league_id_fkey'
          AND conrelid = 'public.football_player_scoring_cache'::regclass
      ) THEN
        ALTER TABLE public.football_player_scoring_cache
          ADD CONSTRAINT football_player_scoring_cache_league_id_fkey
          FOREIGN KEY (league_id) REFERENCES public.leagues(id)
          ON DELETE CASCADE;
      END IF;
    END $$;
  `);
};

// Orphaned rows can't be restored; down only drops the FKs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.football_player_scoring_cache
      DROP CONSTRAINT IF EXISTS football_player_scoring_cache_league_id_fkey;
    ALTER TABLE public.player_scoring_cache
      DROP CONSTRAINT IF EXISTS player_scoring_cache_league_id_fkey;
  `);
};
