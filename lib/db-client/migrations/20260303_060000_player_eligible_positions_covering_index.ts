import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Covering index for player_eligible_positions (LS-434)
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
 * The existing indexes after migration LS-369 are:
 *   1. UNIQUE (player_id, position)  — does NOT include `games`
 *   2. INDEX  (player_id)            — does NOT include `position` or `games`
 *
 * Because `games` is not in either index, PostgreSQL must heap-fetch every
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
 * 3. VACUUM ANALYZE the materialized view so the planner's visibility map
 *    is fully up-to-date and PostgreSQL can choose index-only scans.
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

  // 1. Drop the UNIQUE index created in LS-369 (no INCLUDE columns).
  await db.execute(sql`
    DROP INDEX IF EXISTS public.player_eligible_positions_player_id_position_idx
  `);

  // 2. Recreate as a covering UNIQUE index: key columns (player_id, position)
  //    + INCLUDE (games).  All three columns queried by the DataLoader are now
  //    in the index — enabling index-only scans on supported PostgreSQL versions
  //    (13+, which is what RDS Aurora/15 uses).
  await db.execute(sql`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
      INCLUDE (games)
  `);

  // 3. Drop the plain player_id-only index added in LS-369.
  //    EXISTS / NOT EXISTS queries only need the leading key of the covering
  //    UNIQUE index, so the plain index is now redundant.
  await db.execute(sql`
    DROP INDEX IF EXISTS public.idx_player_eligible_positions_player_id
  `);

  // 4. VACUUM ANALYZE the materialized view so the planner visibility map is
  //    current and PostgreSQL is willing to use index-only scans.
  await db.execute(sql`
    VACUUM ANALYZE public.player_eligible_positions
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

  // 2. Restore the original UNIQUE index without INCLUDE.
  await db.execute(sql`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
  `);

  // 3. Restore the plain player_id index.
  await db.execute(sql`
    CREATE INDEX idx_player_eligible_positions_player_id
      ON public.player_eligible_positions (player_id)
  `);

  console.log('✅ LS-434: player_eligible_positions covering index reverted');
};
