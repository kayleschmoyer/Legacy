-- Create career statistics views
-- These aggregate season-level data for lifetime totals (AL/NL only)

-- Career Batting Statistics View
CREATE OR REPLACE VIEW career_batting AS
SELECT 
    player_id,
    
    -- Aggregate counting stats
    SUM(g) AS g,
    SUM(pa) AS pa, 
    SUM(ab) AS ab,
    SUM(r) AS r,
    SUM(h) AS h,
    SUM(doubles) AS doubles,
    SUM(triples) AS triples,
    SUM(hr) AS hr,
    SUM(rbi) AS rbi,
    SUM(sb) AS sb,
    SUM(cs) AS cs,
    SUM(bb) AS bb,
    SUM(so) AS so,
    SUM(tb) AS tb,
    SUM(gidp) AS gidp,
    SUM(hbp) AS hbp,
    SUM(sh) AS sh,
    SUM(ibb) AS ibb
    
FROM season_batting
WHERE lg_id IN ('AL', 'NL')  -- Major league filtering
GROUP BY player_id;

-- Career Pitching Statistics View  
CREATE OR REPLACE VIEW career_pitching AS
SELECT 
    player_id,
    
    -- Aggregate counting stats
    SUM(w) AS w,
    SUM(l) AS l,
    SUM(g) AS g,
    SUM(gs) AS gs,
    SUM(gf) AS gf,
    SUM(cg) AS cg,
    SUM(sho) AS sho,
    SUM(sv) AS sv,
    SUM(ip) AS ip,
    SUM(h) AS h,
    SUM(r) AS r,
    SUM(er) AS er,
    SUM(hr) AS hr,
    SUM(bb) AS bb,
    SUM(ibb) AS ibb,
    SUM(so) AS so,
    SUM(hbp) AS hbp,
    SUM(bk) AS bk,
    SUM(wp) AS wp,
    SUM(batters_faced) AS batters_faced,
    SUM(outs_recorded) AS outs_recorded,
    
    -- Computed career ERA (total earned runs / total outs * 27)
    CASE 
        WHEN SUM(outs_recorded) > 0 THEN 
            ROUND((SUM(er)::NUMERIC * 27.0) / SUM(outs_recorded), 2)
        ELSE NULL
    END AS era,
    
    -- Computed career out rate (efficiency metric)  
    CASE
        WHEN SUM(batters_faced) > 0 THEN
            ROUND(SUM(outs_recorded)::NUMERIC / SUM(batters_faced), 3)
        ELSE NULL
    END AS out_rate
    
FROM season_pitching
WHERE lg_id IN ('AL', 'NL')  -- Major league filtering
GROUP BY player_id;

-- Career Fielding Statistics View (aggregated across all positions)
CREATE OR REPLACE VIEW career_fielding AS
SELECT 
    player_id,
    
    -- Aggregate fielding stats across all positions
    SUM(g) AS g,
    SUM(gs) AS gs,
    SUM(cg) AS cg,
    SUM(inn_def) AS inn_def,
    SUM(chances) AS chances,
    SUM(po) AS po,
    SUM(a) AS a,
    SUM(e_def) AS e_def,
    SUM(dp_def) AS dp_def,
    
    -- Aggregate catcher-specific stats
    SUM(sb) AS sb,
    SUM(cs) AS cs,
    SUM(pickoffs) AS pickoffs,
    SUM(wp) AS wp
    
FROM season_fielding
WHERE lg_id IN ('AL', 'NL')  -- Major league filtering
GROUP BY player_id;

-- Career Fielding by Position View (position-specific totals)
CREATE OR REPLACE VIEW career_fielding_by_position AS  
SELECT 
    player_id,
    pos,
    
    -- Position-specific career totals
    SUM(g) AS g,
    SUM(gs) AS gs,
    SUM(cg) AS cg,
    SUM(inn_def) AS inn_def,
    SUM(chances) AS chances,
    SUM(po) AS po,
    SUM(a) AS a,
    SUM(e_def) AS e_def,
    SUM(dp_def) AS dp_def,
    
    -- Catcher-specific stats (relevant for pos = 'C')
    SUM(sb) AS sb,
    SUM(cs) AS cs,
    SUM(pickoffs) AS pickoffs,
    SUM(wp) AS wp
    
FROM season_fielding  
WHERE lg_id IN ('AL', 'NL')  -- Major league filtering
GROUP BY player_id, pos;
