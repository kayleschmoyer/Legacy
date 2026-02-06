# Fix incomplete game selection for matchup 120
# This script will trigger game selection for games 3, 4, and 5
# The game selection lambda will skip players who already have these games

param(
    [int]$MatchupId = 120
)

Write-Host "Fixing incomplete game selection for matchup $MatchupId..." -ForegroundColor Yellow

# Check current state
Write-Host "`nCurrent state:" -ForegroundColor Cyan
$query = @"
SELECT 
    m.id,
    m.games_per_matchup,
    (SELECT COUNT(DISTINCT mpg.game_num) 
     FROM matchup_player_games mpg 
     JOIN matchup_players mp ON mp.id = mpg.matchup_player_id 
     WHERE mp.matchup_id = m.id) as unique_games_selected,
    (SELECT COUNT(DISTINCT mp.id) FROM matchup_players mp WHERE mp.matchup_id = m.id) as total_players
FROM matchups m 
WHERE m.id = $MatchupId
"@

.\scripts\db-query.ps1 -query $query

# Show game-by-game breakdown
Write-Host "`nGame-by-game player counts:" -ForegroundColor Cyan
$query = @"
SELECT 
    mpg.game_num,
    COUNT(DISTINCT mp.id) as players_with_game
FROM matchup_player_games mpg
JOIN matchup_players mp ON mp.id = mpg.matchup_player_id
WHERE mp.matchup_id = $MatchupId
GROUP BY mpg.game_num
ORDER BY mpg.game_num
"@

.\scripts\db-query.ps1 -query $query

Write-Host "`nTo complete game selection, you need to trigger the game-selection lambda." -ForegroundColor Yellow
Write-Host "You can do this from the web UI Commissioner page by clicking 'Select Next Game' button." -ForegroundColor Green
Write-Host "`nOr manually invoke the lambda with AWS CLI:" -ForegroundColor Yellow
Write-Host "aws lambda invoke --function-name legacy-sports-dev-game-selection --payload '{`"matchupId`":$MatchupId,`"gameNumber`":3}' response.json" -ForegroundColor Gray
Write-Host "aws lambda invoke --function-name legacy-sports-dev-game-selection --payload '{`"matchupId`":$MatchupId,`"gameNumber`":4}' response.json" -ForegroundColor Gray
Write-Host "aws lambda invoke --function-name legacy-sports-dev-game-selection --payload '{`"matchupId`":$MatchupId,`"gameNumber`":5}' response.json" -ForegroundColor Gray
