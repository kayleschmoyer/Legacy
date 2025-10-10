-- Quick test query to check career fielding data availability
SELECT 
    COUNT(*) as total_players,
    COUNT(cf.player_id) as players_with_fielding,
    COUNT(cf.positions_played) as players_with_positions_data,
    COUNT(cp.player_id) as players_with_pitching
FROM players p
LEFT JOIN career_fielding cf ON p.id = cf.player_id  
LEFT JOIN career_pitching cp ON p.id = cp.player_id
LIMIT 10;
