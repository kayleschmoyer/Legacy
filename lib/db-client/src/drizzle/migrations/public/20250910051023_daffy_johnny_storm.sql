-- Career batting statistics view
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
    SUM(gidp) as gidp,
    -- Calculated fields
    CASE WHEN SUM(ab) > 0 THEN ROUND(SUM(h)::decimal / SUM(ab), 3) ELSE 0 END as avg,
    CASE WHEN SUM(ab + bb + hbp) > 0 THEN ROUND(SUM(h + bb + hbp)::decimal / SUM(ab + bb + hbp), 3) ELSE 0 END as obp,
    CASE WHEN SUM(ab) > 0 THEN ROUND((SUM(h) + SUM(doubles) + 2*SUM(triples) + 3*SUM(hr))::decimal / SUM(ab), 3) ELSE 0 END as slg
FROM season_batting
GROUP BY player_id;

-- Career pitching statistics view  
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
    SUM(outs_recorded) as outs_recorded,
    SUM(h) as h,
    SUM(er) as er,
    SUM(hr) as hr,
    SUM(bb) as bb,
    SUM(so) as so,
    -- Calculated ERA (Earned Run Average)
    CASE WHEN SUM(outs_recorded) > 0 THEN ROUND((SUM(er) * 27.0) / SUM(outs_recorded), 2) ELSE 0 END as era,
    -- Calculated WHIP (Walks + Hits per Inning Pitched)
    CASE WHEN SUM(outs_recorded) > 0 THEN ROUND((SUM(bb) + SUM(h)) * 3.0 / SUM(outs_recorded), 2) ELSE 0 END as whip
FROM season_pitching  
GROUP BY player_id;

-- Career fielding statistics by position
CREATE OR REPLACE VIEW career_fielding_by_position AS
SELECT 
    player_id,
    pos,
    SUM(g) as g,
    SUM(gs) as gs,
    SUM(po) as po,
    SUM(a) as a,
    SUM(e_def) as e,
    SUM(dp_def) as dp,
    -- Calculated fielding percentage
    CASE WHEN SUM(po + a + e_def) > 0 THEN ROUND(SUM(po + a)::decimal / SUM(po + a + e_def), 3) ELSE 0 END as fld_pct
FROM season_fielding
GROUP BY player_id, pos;

-- Player eligible positions (positions where they have played games)
CREATE OR REPLACE VIEW player_eligible_positions AS
SELECT 
    player_id,
    pos,
    SUM(g) as total_games,
    MAX(season) as last_season_played
FROM season_fielding
WHERE g > 0
GROUP BY player_id, pos;