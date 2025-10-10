-- Migration: Fix varchar field length limits causing truncation errors
-- Issue: PostgreSQL error 22001 (string data right truncation)
-- This migration drops views, alters column types, and recreates views

-- Drop views that depend on the columns we need to modify
DROP VIEW IF EXISTS "public"."career_batting" CASCADE;--> statement-breakpoint
DROP VIEW IF EXISTS "public"."career_pitching" CASCADE;--> statement-breakpoint
DROP VIEW IF EXISTS "public"."career_fielding" CASCADE;--> statement-breakpoint
DROP VIEW IF EXISTS "public"."career_fielding_by_position" CASCADE;--> statement-breakpoint
DROP VIEW IF EXISTS "public"."aggregate_season_batting" CASCADE;--> statement-breakpoint
DROP VIEW IF EXISTS "public"."aggregate_season_pitching" CASCADE;--> statement-breakpoint
DROP VIEW IF EXISTS "public"."aggregate_season_fielding" CASCADE;--> statement-breakpoint

-- Alter column types in season statistics tables
-- Season Batting
ALTER TABLE "public"."season_batting" ALTER COLUMN "sf" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "public"."season_batting" ALTER COLUMN "pos_season" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "public"."season_batting" ALTER COLUMN "lg_id" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "public"."season_batting" ALTER COLUMN "team" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "public"."season_batting" ALTER COLUMN "row_id" SET DATA TYPE varchar(50);--> statement-breakpoint

-- Season Pitching
ALTER TABLE "public"."season_pitching" ALTER COLUMN "row_id" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "public"."season_pitching" ALTER COLUMN "team" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "public"."season_pitching" ALTER COLUMN "lg_id" SET DATA TYPE varchar(50);--> statement-breakpoint

-- Season Fielding
ALTER TABLE "public"."season_fielding" ALTER COLUMN "pos" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "public"."season_fielding" ALTER COLUMN "lg_id" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "public"."season_fielding" ALTER COLUMN "team" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "public"."season_fielding" ALTER COLUMN "row_id" SET DATA TYPE varchar(50);--> statement-breakpoint

-- Game tables
ALTER TABLE "public"."game_batting" ALTER COLUMN "game_identifier" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "public"."game_fielding" ALTER COLUMN "game_identifier" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "public"."game_pitching" ALTER COLUMN "game_identifier" SET DATA TYPE varchar(20);--> statement-breakpoint

-- Recreate the career batting view
CREATE VIEW "public"."career_batting" AS
SELECT player_id,
    sum(g) AS g,
    sum(pa) AS pa,
    sum(ab) AS ab,
    sum(r) AS r,
    sum(h) AS h,
    sum(doubles) AS doubles,
    sum(triples) AS triples,
    sum(hr) AS hr,
    sum(rbi) AS rbi,
    sum(sb) AS sb,
    sum(cs) AS cs,
    sum(bb) AS bb,
    sum(so) AS so,
    sum(tb) AS tb,
    sum(gidp) AS gidp,
    sum(hbp) AS hbp,
    sum(sh) AS sh,
    sum(ibb) AS ibb
FROM "public"."season_batting"
WHERE public.is_major_league((lg_id)::text)
GROUP BY player_id;--> statement-breakpoint

-- Recreate the career fielding view
CREATE VIEW "public"."career_fielding" AS
SELECT 
    cf.player_id,
    cf.g,
    cf.gs,
    cf.cg,
    cf.inn_def,
    cf.chances,
    cf.po,
    cf.a,
    cf.e_def,
    cf.dp_def,
    cf.sb,
    cf.cs,
    cf.pickoffs,
    cf.wp,
    NULL::text AS pos,
    -- Aggregate positions played with game counts as JSON
    COALESCE(
        jsonb_object_agg(
            pos_agg.pos, 
            jsonb_build_object(
                'games', pos_agg.g, 
                'gamesStarted', pos_agg.gs,
                'position', pos_agg.pos
            )
        ) FILTER (WHERE pos_agg.pos IS NOT NULL),
        '{}'::jsonb
    ) AS positions_played
FROM (
    SELECT player_id,
        sum(g) AS g,
        sum(gs) AS gs,
        sum(cg) AS cg,
        sum(inn_def) AS inn_def,
        sum(chances) AS chances,
        sum(po) AS po,
        sum(a) AS a,
        sum(e_def) AS e_def,
        sum(dp_def) AS dp_def,
        sum(sb) AS sb,
        sum(cs) AS cs,
        sum(pickoffs) AS pickoffs,
        sum(wp) AS wp
    FROM "public"."season_fielding"
    WHERE public.is_major_league((lg_id)::text)
    GROUP BY player_id
) cf
LEFT JOIN (
    SELECT player_id,
        pos,
        sum(g) AS g,
        sum(gs) AS gs
    FROM "public"."season_fielding"
    WHERE public.is_major_league((lg_id)::text)
    GROUP BY player_id, pos
) pos_agg ON cf.player_id = pos_agg.player_id
GROUP BY cf.player_id, cf.g, cf.gs, cf.cg, cf.inn_def, cf.chances, cf.po, cf.a, cf.e_def, cf.dp_def, cf.sb, cf.cs, cf.pickoffs, cf.wp;--> statement-breakpoint

-- Recreate the career fielding by position view
CREATE VIEW "public"."career_fielding_by_position" AS
SELECT player_id,
    pos,
    sum(g) AS g,
    sum(gs) AS gs,
    sum(cg) AS cg,
    sum(inn_def) AS inn_def,
    sum(chances) AS chances,
    sum(po) AS po,
    sum(a) AS a,
    sum(e_def) AS e_def,
    sum(dp_def) AS dp_def,
    sum(sb) AS sb,
    sum(cs) AS cs,
    sum(pickoffs) AS pickoffs,
    sum(wp) AS wp
FROM "public"."season_fielding"
WHERE public.is_major_league((lg_id)::text)
GROUP BY player_id, pos;--> statement-breakpoint

-- Recreate the career pitching view
CREATE VIEW "public"."career_pitching" AS
SELECT player_id,
    w,
    l,
    g,
    gs,
    gf,
    cg,
    sho,
    sv,
    h,
    r,
    er,
    hr,
    bb,
    ibb,
    so,
    hbp,
    bk,
    wp,
    batters_faced,
    outs_recorded,
    out_rate,
    era
FROM (SELECT season_pitching.player_id,
            sum(season_pitching.w) AS w,
            sum(season_pitching.l) AS l,
            sum(season_pitching.g) AS g,
            sum(season_pitching.gs) AS gs,
            sum(season_pitching.gf) AS gf,
            sum(season_pitching.cg) AS cg,
            sum(season_pitching.sho) AS sho,
            sum(season_pitching.sv) AS sv,
            sum(season_pitching.h) AS h,
            sum(season_pitching.r) AS r,
            sum(season_pitching.er) AS er,
            sum(season_pitching.hr) AS hr,
            sum(season_pitching.bb) AS bb,
            sum(season_pitching.ibb) AS ibb,
            sum(season_pitching.so) AS so,
            sum(season_pitching.hbp) AS hbp,
            sum(season_pitching.bk) AS bk,
            sum(season_pitching.wp) AS wp,
            sum(season_pitching.batters_faced) AS batters_faced,
            sum(season_pitching.outs_recorded) AS outs_recorded,
            CASE sum(season_pitching.outs_recorded)
                WHEN 0 THEN 0.0::numeric
                ELSE round(((((sum(season_pitching.er))::numeric * 27.0) / (sum(season_pitching.outs_recorded))::numeric))::numeric, 2)
            END AS out_rate,
            CASE sum(season_pitching.outs_recorded)
                WHEN 0 THEN 0.0::numeric
                ELSE round(((((sum(season_pitching.er))::numeric * 27.0) / (sum(season_pitching.outs_recorded))::numeric))::numeric, 2)
            END AS era
        FROM "public"."season_pitching"
        WHERE public.is_major_league((season_pitching.lg_id)::text)
        GROUP BY season_pitching.player_id) unnamed_subquery;--> statement-breakpoint

-- Add comments to indicate foreign key relationships for PostGraphile
COMMENT ON VIEW "public"."career_batting" IS '@foreignKey (player_id) references public.players (id)';--> statement-breakpoint
COMMENT ON VIEW "public"."career_fielding" IS '@foreignKey (player_id) references public.players (id)';--> statement-breakpoint
COMMENT ON VIEW "public"."career_fielding_by_position" IS '@foreignKey (player_id) references public.players (id)';--> statement-breakpoint
COMMENT ON VIEW "public"."career_pitching" IS '@foreignKey (player_id) references public.players (id)';--> statement-breakpoint
