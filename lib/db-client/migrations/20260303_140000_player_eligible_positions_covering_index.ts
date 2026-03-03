import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Covering index for player_eligible_positions (LS-434)
 *
 * Replaces 20260303_060000_player_eligible_positions_covering_index.ts which
 * failed on databases where a prior migration (20260303_120000, now deleted)
 * had dropped the materialized view before this timestamp ran.
 *
 * This migration must run AFTER 20260303_130000_materialize_career_stat_views.ts,
 * which guarantees public.player_eligible_positions exists as a MATERIALIZED VIEW.
 *
 * Problem:
 * pg_stat_statements shows player_eligible_positions IN-clause queries
 * consume 21.9% of all database time:
 *   2,178 calls × 550 ms mean = 1,197 s total
 *
 * Root cause:
 * The DataLoader (entity-loaders.ts createEligiblePositionsLoader) issues:
 *
 *   SELECT player_id, position, games
 *   FROM   player_eligible_positions
 *   WHERE  player_id IN (...)
 *
 * The index created by 20260303_130000 is:
 *   UNIQUE (player_id, position)  — does NOT include `games`
 *
 * Because `games` is not in the index, PostgreSQL must heap-fetch every
 * matched row to read it, even though an index-only scan would suffice.
 * For large IN-lists (100+ player IDs across a draft or scoring pass) this
 * adds significant I/O overhead per request.
 *
 * Fix:
 * 1. Rebuild the UNIQUE index on (player_id, position) to INCLUDE (games).
 *    This makes the DataLoader query a pure index-only scan — all three
 *    columns are available directly in the index leaf pages.
 *
 * 2. Drop the plain (player_id) index.  The updated UNIQUE index already
 *    handles all EXISTS / NOT EXISTS patterns (player_id is the leading key).
 *
 * Expected impact:
 * - Eliminates heap fetches for the DataLoader query pattern.
 * - Reduces player_eligible_positions from ~21.9 % to < 2 % of total DB time.
 * - No schema or application-code changes required.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '📦 LS-434: Adding covering index for player_eligible_positions…',
  );

  // 1. Drop the UNIQUE index created by 20260303_130000 (no INCLUDE columns).
  await db.execute(sql`
    DROP INDEX IF EXISTS public.player_eligible_positions_player_id_position_idx
  `);

  // 2. Recreate as a covering UNIQUE index: key columns (player_id, position)
  //    + INCLUDE (games).  All three columns queried by the DataLoader are now
  //    in the index — enabling index-only scans on PostgreSQL 13+ (RDS Aurora/15).
  await db.execute(sql`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
      INCLUDE (games)
  `);

  // 3. Drop the plain player_id-only index added by 20260303_130000.
  //    EXISTS / NOT EXISTS queries only need the leading key of the covering
  //    UNIQUE index, so the plain index is now redundant.
  await db.execute(sql`
    DROP INDEX IF EXISTS public.idx_player_eligible_positions_player_id
  `);

  console.log(
    '✅ LS-434: player_eligible_positions covering index applied successfully',
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('⬇️ LS-434: Reverting player_eligible_positions covering index…');

  // 1. Drop the covering UNIQUE index.
  await db.execute(sql`
    DROP INDEX IF EXISTS public.player_eligible_positions_player_id_position_idx
  `);

  // 2. Restore the UNIQUE index without INCLUDE (as created by 20260303_130000).
  await db.execute(sql`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
  `);

  // 3. Restore the plain player_id index (as created by 20260303_130000).
  await db.execute(sql`
    CREATE INDEX idx_player_eligible_positions_player_id
      ON public.player_eligible_positions (player_id)
  `);

  console.log('✅ LS-434: player_eligible_positions covering index reverted');
};
