import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Update player_eligible_positions view threshold
 *
 * Purpose:
 * - Change from a hard 50-game career threshold to a hybrid approach:
 *   "10% of career games at that position OR 100 games"
 * - Short-career players (e.g. 24 career games) were excluded entirely
 *   under the old threshold, even when they played most of their games
 *   at a single position
 * - The hybrid approach ensures:
 *   - Short-career players qualify if they played 10%+ at a position
 *   - Long-career players qualify with either 10% or 100 games
 * - Uses integer multiplication (g * 10 >= total_g) to avoid floating point
 *
 * Related: LS-128 matchup UI position avatars
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(sql`
    DROP VIEW IF EXISTS player_eligible_positions;

    CREATE VIEW "public"."player_eligible_positions" AS (
      SELECT cfbp.player_id,
             cfbp.pos AS position
      FROM career_fielding_by_position cfbp
      JOIN career_batting cb ON cb.player_id = cfbp.player_id
      WHERE cfbp.pos != 'P'
        AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
      UNION
      SELECT player_id,
             'SP' AS position
      FROM career_pitching
      WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
      UNION
      SELECT player_id,
             'RP' AS position
      FROM career_pitching
      WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(sql`
    DROP VIEW IF EXISTS player_eligible_positions;

    CREATE VIEW "public"."player_eligible_positions" AS (
      SELECT player_id,
             pos AS position
      FROM career_fielding_by_position
      WHERE g > 50
        AND POS != 'P'
      UNION
      SELECT player_id,
             'SP' AS position
      FROM career_pitching
      WHERE gs > 50
      UNION
      SELECT player_id,
             'RP' AS position
      FROM career_pitching
      WHERE g - gs > 50
    );
  `);
};
