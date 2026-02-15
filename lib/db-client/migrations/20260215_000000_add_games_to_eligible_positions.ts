import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Add games column to player_eligible_positions view
 *
 * Purpose:
 * - Add games played count to the player_eligible_positions view
 * - This enables sorting positions by frequency (most played first)
 * - Fixes LS-131: Eligible positions should be sorted by play frequency
 *
 * Changes:
 * - View now includes 'g' (games) column from source tables
 * - Positions sorted by games descending within each player
 * - Frontend can display positions in order of frequency
 * - Uses hybrid eligibility threshold: 100 games OR 10% of career games
 *
 * Note: Builds on 20260214 migration's new eligibility logic
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop existing view
  await db.execute(sql`
    DROP VIEW IF EXISTS player_eligible_positions CASCADE;
  `);

  // Recreate view with games column and ordering
  await db.execute(sql`
    CREATE VIEW player_eligible_positions AS
    SELECT cfbp.player_id, cfbp.pos AS position, cfbp.g AS games
    FROM career_fielding_by_position cfbp
    JOIN career_batting cb ON cb.player_id = cfbp.player_id
    WHERE cfbp.pos != 'P'
      AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
    UNION
    SELECT player_id, 'SP' AS position, gs AS games
    FROM career_pitching
    WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
    UNION
    SELECT player_id, 'RP' AS position, (g - gs) AS games
    FROM career_pitching
    WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
    ORDER BY player_id, games DESC;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop updated view
  await db.execute(sql`
    DROP VIEW IF EXISTS player_eligible_positions CASCADE;
  `);

  // Restore view from 20260214 migration (without games column)
  await db.execute(sql`
    CREATE VIEW player_eligible_positions AS
    SELECT cfbp.player_id, cfbp.pos AS position
    FROM career_fielding_by_position cfbp
    JOIN career_batting cb ON cb.player_id = cfbp.player_id
    WHERE cfbp.pos != 'P'
      AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
    UNION
    SELECT player_id, 'SP' AS position
    FROM career_pitching
    WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
    UNION
    SELECT player_id, 'RP' AS position
    FROM career_pitching
    WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g);
  `);
};
