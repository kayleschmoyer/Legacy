-- Migration to create all views from Drizzle models
-- This file contains the SQL definitions for views that are defined in the models

-- Users view (from app_internal.users)
CREATE OR REPLACE VIEW users AS 
SELECT id,
       email,
       username,
       access_level::character varying::access_level AS access_level
FROM app_internal.users;

-- Career batting view (aggregated from season_batting)
CREATE OR REPLACE VIEW career_batting AS
SELECT 
    player_id,
    SUM(g) as g,
    SUM(ab) as ab,
    SUM(r) as r,
    SUM(h) as h,
    SUM(doubles) as doubles,
    SUM(triples) as triples,
    SUM(hr) as hr,
    SUM(rbi) as rbi,
    SUM(sb) as sb,
    SUM(cs) as cs,
    SUM(bb) as bb,
    SUM(so) as so,
    SUM(ibb) as ibb,
    SUM(hbp) as hbp,
    SUM(sh) as sh,
    SUM(sf) as sf,
    SUM(gidp) as gidp,
    -- Calculated fields
    CASE WHEN SUM(ab) > 0 THEN ROUND(SUM(h)::numeric / SUM(ab)::numeric, 3) ELSE 0 END as batting_avg,
    CASE WHEN SUM(ab + bb + hbp + sf) > 0 THEN ROUND((SUM(h) + SUM(bb) + SUM(hbp))::numeric / (SUM(ab) + SUM(bb) + SUM(hbp) + SUM(sf))::numeric, 3) ELSE 0 END as onbase_perc,
    CASE WHEN SUM(ab) > 0 THEN ROUND((SUM(h) + SUM(doubles) + 2*SUM(triples) + 3*SUM(hr))::numeric / SUM(ab)::numeric, 3) ELSE 0 END as slugging_perc,
    CASE WHEN SUM(ab + bb + hbp + sf) > 0 THEN 
        ROUND((SUM(h) + SUM(bb) + SUM(hbp))::numeric / (SUM(ab) + SUM(bb) + SUM(hbp) + SUM(sf))::numeric, 3) + 
        CASE WHEN SUM(ab) > 0 THEN ROUND((SUM(h) + SUM(doubles) + 2*SUM(triples) + 3*SUM(hr))::numeric / SUM(ab)::numeric, 3) ELSE 0 END
    ELSE 0 END as onbase_plus_slugging,
    SUM(pa) as pa
FROM season_batting 
GROUP BY player_id;

-- Career pitching view (aggregated from season_pitching)
CREATE OR REPLACE VIEW career_pitching AS
SELECT 
    player_id,
    SUM(w) as w,
    SUM(l) as l,
    SUM(g) as g,
    SUM(gs) as gs,
    SUM(cg) as cg,
    SUM(sho) as sho,
    SUM(sv) as sv,
    SUM(ip_outs) as ip_outs,
    SUM(h) as h,
    SUM(er) as er,
    SUM(hr) as hr,
    SUM(bb) as bb,
    SUM(so) as so,
    -- Calculated fields
    CASE WHEN SUM(ip_outs) > 0 THEN ROUND(9.0 * SUM(er)::numeric / (SUM(ip_outs)::numeric / 3.0), 2) ELSE 0 END as era,
    CASE WHEN SUM(ip_outs) > 0 THEN ROUND(9.0 * SUM(h)::numeric / (SUM(ip_outs)::numeric / 3.0), 2) ELSE 0 END as hits_per_nine,
    CASE WHEN SUM(ip_outs) > 0 THEN ROUND(9.0 * SUM(hr)::numeric / (SUM(ip_outs)::numeric / 3.0), 2) ELSE 0 END as home_runs_per_nine,
    CASE WHEN SUM(bb) > 0 THEN ROUND(SUM(so)::numeric / SUM(bb)::numeric, 2) ELSE NULL END as strikeouts_per_base_on_balls,
    CASE WHEN SUM(ip_outs) > 0 THEN ROUND((SUM(h) + SUM(bb))::numeric / (SUM(ip_outs)::numeric / 3.0), 2) ELSE 0 END as whip,
    CASE WHEN SUM(ip_outs) > 0 THEN ROUND(9.0 * SUM(bb)::numeric / (SUM(ip_outs)::numeric / 3.0), 2) ELSE 0 END as walks_per_nine,
    CASE WHEN SUM(ip_outs) > 0 THEN ROUND(9.0 * SUM(so)::numeric / (SUM(ip_outs)::numeric / 3.0), 2) ELSE 0 END as strikeouts_per_nine,
    SUM(gf) as gf,
    SUM(r) as r,
    SUM(ibb) as ibb,
    SUM(wp) as wp,
    SUM(hbp) as hbp,
    SUM(bk) as bk,
    SUM(bfp) as bfp
FROM season_pitching 
GROUP BY player_id;

-- Career fielding by position view (aggregated from season_fielding)
CREATE OR REPLACE VIEW career_fielding_by_position AS
SELECT 
    player_id,
    pos,
    SUM(g) as g,
    SUM(gs) as gs,
    SUM(inn_def) as inn_def,
    SUM(po) as po,
    SUM(a) as a,
    SUM(e_def) as e_def,
    SUM(dp_def) as dp_def,
    -- Calculated fields
    CASE WHEN (SUM(po) + SUM(a) + SUM(e_def)) > 0 THEN 
        ROUND((SUM(po) + SUM(a))::numeric / (SUM(po) + SUM(a) + SUM(e_def))::numeric, 3) 
    ELSE 0 END as fielding_perc,
    CASE WHEN SUM(g) > 0 THEN ROUND((SUM(po) + SUM(a))::numeric / SUM(g)::numeric, 2) ELSE 0 END as range_factor_per_game,
    CASE WHEN SUM(inn_def) > 0 THEN ROUND(9.0 * (SUM(po) + SUM(a))::numeric / (SUM(inn_def)::numeric), 2) ELSE 0 END as range_factor_per_nine,
    SUM(sb) as sb,
    SUM(cs) as cs,
    SUM(pickoffs) as pickoffs
FROM season_fielding 
GROUP BY player_id, pos;

-- Career fielding view (aggregated across all positions)
CREATE OR REPLACE VIEW career_fielding AS
SELECT 
    player_id,
    SUM(g) as g,
    SUM(gs) as gs,
    SUM(inn_def) as inn_def,
    SUM(po) as po,
    SUM(a) as a,
    SUM(e_def) as e_def,
    SUM(dp_def) as dp_def,
    -- Calculated fields
    CASE WHEN (SUM(po) + SUM(a) + SUM(e_def)) > 0 THEN 
        ROUND((SUM(po) + SUM(a))::numeric / (SUM(po) + SUM(a) + SUM(e_def))::numeric, 3) 
    ELSE 0 END as fielding_perc,
    CASE WHEN SUM(g) > 0 THEN ROUND((SUM(po) + SUM(a))::numeric / SUM(g)::numeric, 2) ELSE 0 END as range_factor_per_game,
    CASE WHEN SUM(inn_def) > 0 THEN ROUND(9.0 * (SUM(po) + SUM(a))::numeric / (SUM(inn_def)::numeric), 2) ELSE 0 END as range_factor_per_nine,
    SUM(sb) as sb,
    SUM(cs) as cs,
    SUM(pickoffs) as pickoffs
FROM season_fielding 
GROUP BY player_id;

-- Player eligible positions view
CREATE OR REPLACE VIEW player_eligible_positions AS
SELECT player_id,
       pos AS position
FROM career_fielding_by_position
WHERE g > 50
  AND pos != 'P'
UNION
SELECT player_id,
       'SP' AS position
FROM career_pitching
WHERE gs > 50
UNION
SELECT player_id,
       'RP' AS position
FROM career_pitching
WHERE g - gs > 50;

-- Aggregate season views (for matchup calculations)
CREATE OR REPLACE VIEW aggregate_season_batting AS
SELECT 
    player_id,
    season,
    SUM(g) as g,
    SUM(ab) as ab,
    SUM(r) as r,
    SUM(h) as h,
    SUM(doubles) as doubles,
    SUM(triples) as triples,
    SUM(hr) as hr,
    SUM(rbi) as rbi,
    SUM(sb) as sb,
    SUM(cs) as cs,
    SUM(bb) as bb,
    SUM(so) as so,
    SUM(ibb) as ibb,
    SUM(hbp) as hbp,
    SUM(sh) as sh,
    SUM(sf) as sf,
    SUM(gidp) as gidp,
    SUM(pa) as pa
FROM season_batting 
GROUP BY player_id, season;

CREATE OR REPLACE VIEW aggregate_season_pitching AS
SELECT 
    player_id,
    season,
    SUM(w) as w,
    SUM(l) as l,
    SUM(g) as g,
    SUM(gs) as gs,
    SUM(cg) as cg,
    SUM(sho) as sho,
    SUM(sv) as sv,
    SUM(ip_outs) as ip_outs,
    SUM(h) as h,
    SUM(er) as er,
    SUM(hr) as hr,
    SUM(bb) as bb,
    SUM(so) as so,
    SUM(gf) as gf,
    SUM(r) as r,
    SUM(ibb) as ibb,
    SUM(wp) as wp,
    SUM(hbp) as hbp,
    SUM(bk) as bk,
    SUM(bfp) as bfp
FROM season_pitching 
GROUP BY player_id, season;

CREATE OR REPLACE VIEW aggregate_season_fielding AS
SELECT 
    player_id,
    season,
    SUM(g) as g,
    SUM(gs) as gs,
    SUM(inn_def) as inn_def,
    SUM(po) as po,
    SUM(a) as a,
    SUM(e_def) as e_def,
    SUM(dp_def) as dp_def,
    SUM(sb) as sb,
    SUM(cs) as cs,
    SUM(pickoffs) as pickoffs
FROM season_fielding 
GROUP BY player_id, season;

CREATE OR REPLACE VIEW aggregate_season_fielding_by_pos AS
SELECT 
    player_id,
    season,
    pos,
    SUM(g) as g,
    SUM(gs) as gs,
    SUM(inn_def) as inn_def,
    SUM(po) as po,
    SUM(a) as a,
    SUM(e_def) as e_def,
    SUM(dp_def) as dp_def,
    SUM(sb) as sb,
    SUM(cs) as cs,
    SUM(pickoffs) as pickoffs
FROM season_fielding 
GROUP BY player_id, season, pos;
