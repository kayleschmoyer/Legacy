import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type postgres from 'postgres';

/**
 * Migration: Fix SF (sacrifice flies) column data type
 *
 * The `sf` column was incorrectly stored as character varying instead of integer.
 * This migration converts it to the correct type.
 *
 * Tables affected:
 * - game_batting
 * - season_batting
 */
export const up = async ({
  db,
  sql: rawSql,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('🔧 Fixing SF column data type...');

  // Drop the aggregate view that depends on season_batting.sf
  console.log('🗑️ Temporarily dropping aggregate_season_batting view...');
  await db.execute(sql`DROP VIEW IF EXISTS aggregate_season_batting CASCADE`);

  // Fix season_batting.sf (game_batting.sf is already integer)
  console.log('📊 Converting season_batting.sf to integer...');
  await rawSql`
    ALTER TABLE public.season_batting 
    ALTER COLUMN sf TYPE integer USING (
      CASE 
        WHEN sf IS NULL OR TRIM(sf) = '' THEN NULL
        ELSE sf::integer
      END
    )
  `;

  // Recreate the aggregate view (now without needing to cast sf)
  console.log('📊 Recreating aggregate_season_batting view...');
  await rawSql`
    CREATE VIEW public.aggregate_season_batting AS
    SELECT 
      player_id,
      season,
      (SUM(g))::integer AS g,
      (SUM(pa))::integer AS pa,
      (SUM(ab))::integer AS ab,
      (SUM(r))::integer AS r,
      (SUM(h))::integer AS h,
      (SUM(doubles))::integer AS doubles,
      (SUM(triples))::integer AS triples,
      (SUM(hr))::integer AS hr,
      (SUM(rbi))::integer AS rbi,
      (SUM(sb))::integer AS sb,
      (SUM(cs))::integer AS cs,
      (SUM(bb))::integer AS bb,
      (SUM(so))::integer AS so,
      (SUM(tb))::integer AS tb,
      (SUM(gidp))::integer AS gidp,
      (SUM(hbp))::integer AS hbp,
      (SUM(sh))::integer AS sh,
      (SUM(sf))::integer AS sf,
      (SUM(ibb))::integer AS ibb
    FROM public.season_batting
    WHERE public.is_major_league((lg_id)::text)
    GROUP BY player_id, season
  `;

  // Add comment
  await db.execute(sql`
    COMMENT ON VIEW aggregate_season_batting IS 
    '@foreignKey (player_id) references public.players (id)'
  `);

  console.log('✅ Successfully converted SF columns to integer');
};

export const down = async ({
  db,
  sql: rawSql,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('⬇️ Reverting SF column data type...');

  // Drop the aggregate view first
  console.log('🗑️ Temporarily dropping aggregate_season_batting view...');
  await db.execute(sql`DROP VIEW IF EXISTS aggregate_season_batting CASCADE`);

  // Revert season_batting.sf (game_batting.sf was already integer, so no revert needed)
  console.log('📊 Reverting season_batting.sf to character varying...');
  await db.execute(sql`
    ALTER TABLE public.season_batting 
    ALTER COLUMN sf TYPE character varying USING sf::text
  `);

  // Recreate the aggregate view with SF cast
  console.log('📊 Recreating aggregate_season_batting view with SF cast...');
  await rawSql`
    CREATE VIEW public.aggregate_season_batting AS
    SELECT 
      player_id,
      season,
      (SUM(g))::integer AS g,
      (SUM(pa))::integer AS pa,
      (SUM(ab))::integer AS ab,
      (SUM(r))::integer AS r,
      (SUM(h))::integer AS h,
      (SUM(doubles))::integer AS doubles,
      (SUM(triples))::integer AS triples,
      (SUM(hr))::integer AS hr,
      (SUM(rbi))::integer AS rbi,
      (SUM(sb))::integer AS sb,
      (SUM(cs))::integer AS cs,
      (SUM(bb))::integer AS bb,
      (SUM(so))::integer AS so,
      (SUM(tb))::integer AS tb,
      (SUM(gidp))::integer AS gidp,
      (SUM(hbp))::integer AS hbp,
      (SUM(sh))::integer AS sh,
      (SUM(CASE WHEN sf IS NULL OR TRIM(sf) = '' THEN 0 ELSE sf::integer END))::integer AS sf,
      (SUM(ibb))::integer AS ibb
    FROM public.season_batting
    WHERE public.is_major_league((lg_id)::text)
    GROUP BY player_id, season
  `;

  // Add comment
  await db.execute(sql`
    COMMENT ON VIEW aggregate_season_batting IS 
    '@foreignKey (player_id) references public.players (id)'
  `);

  console.log('✅ Successfully reverted SF column to character varying');
};
