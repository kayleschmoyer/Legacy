import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Separate career minimums for pitchers (LS-10807)
 *
 * The batter career minimums (min_career_games / min_career_seasons) read
 * career_batting, so pure pitchers — who have no batting row in the DH era —
 * pass them automatically. Commissioners can now set separate pitcher
 * thresholds, judged on pitching appearances:
 *
 * - leagues.min_career_pitcher_games   — career AL/NL games pitched
 * - leagues.min_career_pitcher_seasons — distinct AL/NL seasons with a pitching
 *   appearance
 *
 * Both default to 0 (off). While both are 0 the eligibility predicates in
 * lib/db-client/src/lib/DraftUtils.ts stay exactly as before, so existing
 * leagues don't change behaviour until a commissioner sets a pitcher value.
 *
 * career_pitching_appearances is a narrow materialized view of each player's
 * AL/NL games pitched and distinct pitching seasons — the pitching analogue of
 * career_batting.g / career_batting.seasons (LS-10552), so the pitcher rule is
 * a plain anti-join instead of a per-player COUNT(DISTINCT season) (LS-9311).
 * It reads only the season_pitching base table, so it doesn't pin the
 * career_batting / career_pitching / player_eligible_positions views that
 * later migrations drop and recreate. Refreshed by refreshCareerStats.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN IF NOT EXISTS min_career_pitcher_games   INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS min_career_pitcher_seasons INTEGER NOT NULL DEFAULT 0
  `);
  await db.execute(`
    COMMENT ON COLUMN leagues.min_career_pitcher_games IS 'Minimum career MLB games pitched a pitcher must have to appear in the player pool and start. 0 = off (LS-10807).'
  `);
  await db.execute(`
    COMMENT ON COLUMN leagues.min_career_pitcher_seasons IS 'Minimum distinct MLB seasons with a pitching appearance a pitcher must have to appear in the player pool and start. 0 = off (LS-10807).'
  `);

  await db.execute(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS public.career_pitching_appearances AS
    SELECT sp.player_id,
           sum(sp.g)::bigint                   AS g,
           count(DISTINCT sp.season)::integer  AS seasons
      FROM season_pitching sp
     WHERE sp.lg_id::text = ANY (ARRAY['AL'::text, 'NL'::text])
     GROUP BY sp.player_id
    WITH DATA
  `);

  // Unique index required for CONCURRENTLY refresh
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_career_pitching_appearances_player_id
      ON public.career_pitching_appearances (player_id)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.career_pitching_appearances
  `);
  await db.execute(`
    ALTER TABLE leagues
      DROP COLUMN IF EXISTS min_career_pitcher_games,
      DROP COLUMN IF EXISTS min_career_pitcher_seasons
  `);
};
