-- Query to check team assignments for league 5
SELECT 
    t.id as team_id,
    t.name as team_name,
    COUNT(tm.id) as players_assigned,
    STRING_AGG(DISTINCT lp.position_type, ', ' ORDER BY lp.position_type) as positions_filled
FROM teams t
LEFT JOIN team_members tm ON t.id = tm.team_id
LEFT JOIN league_position lp ON tm.position_id = lp.id
WHERE t.league_id = 5
GROUP BY t.id, t.name
ORDER BY t.name;

-- Also get a sample of actual player assignments
SELECT 
    t.name as team_name,
    p.first_name || ' ' || p.last_name as player_name,
    lp.position_type as position
FROM teams t
JOIN team_members tm ON t.id = tm.team_id
JOIN players p ON tm.player_id = p.id
JOIN league_position lp ON tm.position_id = lp.id
WHERE t.league_id = 5
ORDER BY t.name, lp.position_type
LIMIT 50;
