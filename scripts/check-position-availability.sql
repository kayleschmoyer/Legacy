-- Position availability check for draft
-- Get counts of players with stats for each position

SELECT 
  cfp.pos,
  COUNT(DISTINCT cfp.player_id) as total_players,
  COUNT(DISTINCT CASE WHEN p.stats_last_fetched_at IS NOT NULL THEN cfp.player_id END) as players_with_stats
FROM career_fielding_by_position cfp
JOIN players p ON cfp.player_id = p.id
GROUP BY cfp.pos
ORDER BY cfp.pos;
