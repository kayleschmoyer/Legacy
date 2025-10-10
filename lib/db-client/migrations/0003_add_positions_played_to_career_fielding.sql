-- Migration to add positions_played field to career_fielding view
-- Generated manually for positions feature

-- Drop and recreate the career fielding view with positions data
DROP VIEW IF EXISTS "public"."career_fielding";

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
GROUP BY cf.player_id, cf.g, cf.gs, cf.cg, cf.inn_def, cf.chances, cf.po, cf.a, cf.e_def, cf.dp_def, cf.sb, cf.cs, cf.pickoffs, cf.wp;

-- Re-add foreign key comment for PostGraphile
COMMENT ON VIEW "public"."career_fielding" IS '@foreignKey (player_id) references public.players (id)';
