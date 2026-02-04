import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type postgres from 'postgres';

/**
 * Migration: Fix broken aggregate season views
 *
 * The aggregate_season_batting, aggregate_season_pitching, aggregate_season_fielding,
 * and aggregate_season_fielding_by_pos views were corrupted (showing as "SELECT NULL WHERE false").
 * This migration recreates them with the proper definitions to aggregate multi-team seasons
 * into single records.
 *
 * These views are critical for:
 * - Game selection (matchup_players references these views)
 * - Season statistics queries
 * - Career statistics calculations
 *
 * Prerequisites:
 * - Requires is_major_league() function (created in 20260203_210000_create_is_major_league_function.ts)
 */
export const up = async ({
  db,
  sql: rawSql,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('🔧 Fixing aggregate season views...');

  // Drop existing broken views
  console.log('🗑️ Dropping existing views...');
  await db.execute(sql`DROP VIEW IF EXISTS aggregate_season_batting CASCADE`);
  await db.execute(sql`DROP VIEW IF EXISTS aggregate_season_pitching CASCADE`);
  await db.execute(sql`DROP VIEW IF EXISTS aggregate_season_fielding CASCADE`);
  await db.execute(
    sql`DROP VIEW IF EXISTS aggregate_season_fielding_by_pos CASCADE`,
  );
  console.log('✅ Views dropped');

  // Recreate aggregate_season_batting view (use raw client - Drizzle's wrapper still uses prepared statements)
  console.log('📊 Creating aggregate_season_batting view...');
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

  // Recreate aggregate_season_pitching view
  console.log('📊 Creating aggregate_season_pitching view...');
  await rawSql`
    CREATE VIEW public.aggregate_season_pitching AS
    SELECT 
      player_id,
      season,
      (SUM(w))::integer AS w,
      (SUM(l))::integer AS l,
      (SUM(g))::integer AS g,
      (SUM(gs))::integer AS gs,
      (SUM(gf))::integer AS gf,
      (SUM(cg))::integer AS cg,
      (SUM(sho))::integer AS sho,
      (SUM(sv))::integer AS sv,
      (SUM(h))::integer AS h,
      (SUM(r))::integer AS r,
      (SUM(er))::integer AS er,
      (SUM(hr))::integer AS hr,
      (SUM(bb))::integer AS bb,
      (SUM(ibb))::integer AS ibb,
      (SUM(so))::integer AS so,
      (SUM(hbp))::integer AS hbp,
      (SUM(bk))::integer AS bk,
      (SUM(wp))::integer AS wp,
      (SUM(batters_faced))::integer AS batters_faced,
      (SUM(outs_recorded))::integer AS outs_recorded
    FROM public.season_pitching
    WHERE public.is_major_league((lg_id)::text)
    GROUP BY player_id, season
  `;

  // Recreate aggregate_season_fielding view
  console.log('📊 Creating aggregate_season_fielding view...');
  await rawSql`
    CREATE VIEW public.aggregate_season_fielding AS
    SELECT 
      player_id,
      season,
      (SUM(g))::integer AS g,
      (SUM(gs))::integer AS gs,
      (SUM(cg))::integer AS cg,
      (SUM(inn_def))::integer AS inn_def,
      (SUM(chances))::integer AS chances,
      (SUM(po))::integer AS po,
      (SUM(a))::integer AS a,
      (SUM(e_def))::integer AS e_def,
      (SUM(dp_def))::integer AS dp_def,
      (SUM(sb))::integer AS sb,
      (SUM(cs))::integer AS cs,
      (SUM(pickoffs))::integer AS pickoffs,
      (SUM(wp))::integer AS wp
    FROM public.season_fielding
    WHERE public.is_major_league((lg_id)::text)
    GROUP BY player_id, season
  `;

  // Recreate aggregate_season_fielding_by_pos view
  console.log('📊 Creating aggregate_season_fielding_by_pos view...');
  await rawSql`
    CREATE VIEW public.aggregate_season_fielding_by_pos AS
    SELECT 
      player_id,
      season,
      pos,
      (SUM(g))::integer AS g,
      (SUM(gs))::integer AS gs,
      (SUM(cg))::integer AS cg,
      (SUM(inn_def))::integer AS inn_def,
      (SUM(chances))::integer AS chances,
      (SUM(po))::integer AS po,
      (SUM(a))::integer AS a,
      (SUM(e_def))::integer AS e_def,
      (SUM(dp_def))::integer AS dp_def,
      (SUM(sb))::integer AS sb,
      (SUM(cs))::integer AS cs,
      (SUM(pickoffs))::integer AS pickoffs,
      (SUM(wp))::integer AS wp
    FROM public.season_fielding
    WHERE public.is_major_league((lg_id)::text) 
      AND pos::text <> 'DH'
      AND pos::text <> 'OF'
      AND pos::text <> 'P'
    GROUP BY player_id, season, pos
  `;

  // Add comments to document the views
  console.log('📝 Adding view comments...');
  await db.execute(sql`
    COMMENT ON VIEW aggregate_season_batting IS 
    '@foreignKey (player_id) references public.players (id)'
  `);

  await db.execute(sql`
    COMMENT ON VIEW aggregate_season_pitching IS 
    '@foreignKey (player_id) references public.players (id)'
  `);

  await db.execute(sql`
    COMMENT ON VIEW aggregate_season_fielding IS 
    '@foreignKey (player_id) references public.players (id)'
  `);

  await db.execute(sql`
    COMMENT ON VIEW aggregate_season_fielding_by_pos IS 
    '@foreignKey (player_id) references public.players (id)'
  `);

  console.log('✅ Successfully recreated aggregate season views');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('⬇️ Dropping aggregate season views...');

  // Drop all 4 views (they will be recreated by earlier migrations if rolled back)
  await db.execute(sql`DROP VIEW IF EXISTS aggregate_season_batting CASCADE`);
  await db.execute(sql`DROP VIEW IF EXISTS aggregate_season_pitching CASCADE`);
  await db.execute(sql`DROP VIEW IF EXISTS aggregate_season_fielding CASCADE`);
  await db.execute(
    sql`DROP VIEW IF EXISTS aggregate_season_fielding_by_pos CASCADE`,
  );

  console.log('✅ Successfully dropped aggregate season views');
};
