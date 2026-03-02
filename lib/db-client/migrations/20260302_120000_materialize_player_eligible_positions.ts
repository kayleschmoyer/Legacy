import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Materialize player_eligible_positions view (LS-369)
 *
 * Purpose:
 * - Fix 1.6 s LIMIT scan on player_eligible_positions
 * - Plain VIEW with UNION + ORDER BY forces a full sequential scan even for
 *   LIMIT 10 because PostgreSQL cannot push the LIMIT through a UNION.
 * - Converting to a MATERIALIZED VIEW with indexes makes:
 *     SELECT * FROM player_eligible_positions LIMIT 10  → <1 ms
 *     EXISTS/NOT EXISTS patterns in the draft picker     → fast index seeks
 *
 * Changes:
 * - Drop plain VIEW player_eligible_positions
 * - Create MATERIALIZED VIEW player_eligible_positions (same SQL)
 * - Add UNIQUE index on (player_id, position)  — replaces logical PK
 * - Add index on (player_id)                   — for EXISTS/NOT EXISTS in draft picker
 * - VACUUM ANALYZE the three underlying season tables so the planner
 *   has fresh statistics the first time it scans them for the initial REFRESH
 *
 * Refresh strategy:
 * - The materialized view is refreshed after each bulk stats-load run
 *   (stats-lambda SQS batch and CLI loadCareerStats command).
 * - CONCURRENTLY is used so reads are not blocked during refresh.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Drop the existing plain view
  await db.execute(sql`
    DROP VIEW IF EXISTS public.player_eligible_positions CASCADE
  `);

  // 2. Create the materialized view with identical query
  await db.execute(sql`
    CREATE MATERIALIZED VIEW public.player_eligible_positions AS
    SELECT cfbp.player_id,
           cfbp.pos    AS position,
           cfbp.g      AS games
    FROM   career_fielding_by_position cfbp
    JOIN   career_batting cb ON cb.player_id = cfbp.player_id
    WHERE  cfbp.pos != 'P'
      AND  (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
    UNION
    SELECT player_id,
           'SP' AS position,
           gs   AS games
    FROM   career_pitching
    WHERE  gs >= 100 OR (g > 0 AND gs * 10 >= g)
    UNION
    SELECT player_id,
           'RP'       AS position,
           (g - gs)   AS games
    FROM   career_pitching
    WHERE  (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
    ORDER BY player_id, games DESC
    WITH DATA
  `);

  // 3. Unique index on (player_id, position) — logical primary key for the mat-view
  await db.execute(sql`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
  `);

  // 4. Non-unique index on player_id for EXISTS / NOT EXISTS draft-picker queries
  await db.execute(sql`
    CREATE INDEX idx_player_eligible_positions_player_id
      ON public.player_eligible_positions (player_id)
  `);

  // 5. Refresh statistics on the underlying season tables so the planner has
  //    accurate row estimates for future manual refreshes.
  await db.execute(sql`
    VACUUM ANALYZE public.season_batting, public.season_fielding, public.season_pitching
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop the materialized view (and its indexes automatically)
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);

  // Restore plain view
  await db.execute(sql`
    CREATE VIEW public.player_eligible_positions AS
    SELECT cfbp.player_id,
           cfbp.pos    AS position,
           cfbp.g      AS games
    FROM   career_fielding_by_position cfbp
    JOIN   career_batting cb ON cb.player_id = cfbp.player_id
    WHERE  cfbp.pos != 'P'
      AND  (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
    UNION
    SELECT player_id,
           'SP' AS position,
           gs   AS games
    FROM   career_pitching
    WHERE  gs >= 100 OR (g > 0 AND gs * 10 >= g)
    UNION
    SELECT player_id,
           'RP'       AS position,
           (g - gs)   AS games
    FROM   career_pitching
    WHERE  (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
    ORDER BY player_id, games DESC
  `);
};
