-- Career Statistics Views Migration
-- This migration creates the career statistics aggregation views and the required function

-- Create the is_major_league function
CREATE OR REPLACE FUNCTION public.is_major_league(lg_id text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
        BEGIN
                RETURN cardinality(ARRAY(
               SELECT UNNEST(string_to_array(lg_id, ','))
                   INTERSECT
               SELECT UNNEST(Array['AL', 'NL', 'NN2', 'NAL','NNL', 'ECL','FL', 'EWL', 'NSL', 'PL', 'UA'])
       )) > 0 ;
        END;
$$;

-- Create the career_batting view
CREATE VIEW public.career_batting AS
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
FROM public.season_batting
WHERE public.is_major_league((lg_id)::text)
GROUP BY player_id;

-- Create the career_fielding view
CREATE VIEW public.career_fielding AS
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
    sum(wp) AS wp,
    (SELECT string_agg(unnamed_subquery.val, ','::text) AS string_agg
        FROM (SELECT DISTINCT regexp_split_to_table(string_agg((season_fielding.pos)::text, ','::text), ','::text) AS val) unnamed_subquery) AS pos
FROM public.season_fielding
WHERE public.is_major_league((lg_id)::text)
GROUP BY player_id;

-- Create the career_fielding_by_position view
CREATE VIEW public.career_fielding_by_position AS
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
FROM public.season_fielding
WHERE public.is_major_league((lg_id)::text)
GROUP BY player_id, pos;

-- Create the career_pitching view
CREATE VIEW public.career_pitching AS
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
            (sum(season_pitching.outs_recorded) /
                CASE sum(season_pitching.batters_faced)
                    WHEN 0 THEN (1)::bigint
                    ELSE sum(season_pitching.batters_faced)
                END) AS out_rate,
            ((sum(season_pitching.er))::numeric /
                CASE sum(season_pitching.outs_recorded)
                    WHEN 0 THEN ((1)::bigint)::numeric
                    ELSE ((sum(season_pitching.outs_recorded))::numeric / 27.0)
                END) AS era
        FROM public.season_pitching
        WHERE public.is_major_league((season_pitching.lg_id)::text)
        GROUP BY season_pitching.player_id) unnamed_subquery;

-- Add comments to indicate foreign key relationships for PostGraphile
COMMENT ON VIEW public.career_batting IS '@foreignKey (player_id) references public.players (id)';
COMMENT ON VIEW public.career_fielding IS '@foreignKey (player_id) references public.players (id)';
COMMENT ON VIEW public.career_fielding_by_position IS '@foreignKey (player_id) references public.players (id)';
COMMENT ON VIEW public.career_pitching IS '@foreignKey (player_id) references public.players (id)';
