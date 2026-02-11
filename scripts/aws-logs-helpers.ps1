#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick helpers for common log-from-database scenarios

.DESCRIPTION
    Pre-configured shortcuts for common debugging scenarios where you need
    to correlate database timestamps with CloudWatch logs.

.EXAMPLE
    # Find logs for game stats update
    .\scripts\aws-logs-helpers.ps1 -Scenario GameStats -GameId 123

.EXAMPLE
    # Find logs for league draft
    .\scripts\aws-logs-helpers.ps1 -Scenario LeagueDraft -LeagueId 16

.EXAMPLE
    # Find logs for player update
    .\scripts\aws-logs-helpers.ps1 -Scenario PlayerUpdate -PlayerId 456
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('GameStats', 'LeagueDraft', 'PlayerUpdate', 'MatchupUpdate', 'Custom')]
    [string]$Scenario,
    
    [int]$GameId,
    [int]$LeagueId,
    [int]$PlayerId,
    [int]$MatchupId,
    
    [string]$CustomQuery,
    [string]$CustomFunction,
    
    [ValidateSet('dev', 'prod')]
    [string]$Environment = 'dev'
)

switch ($Scenario) {
    'GameStats' {
        if (-not $GameId) {
            Write-Host "Error: -GameId required for GameStats scenario" -ForegroundColor Red
            exit 1
        }
        
        $query = "SELECT game_id, last_updated FROM game_stats WHERE game_id = $GameId ORDER BY last_updated DESC LIMIT 1"
        $function = 'stats'
        
        Write-Host "Searching for game stats logs (game_id = $GameId)..." -ForegroundColor Cyan
        & .\scripts\aws-logs-from-db.ps1 -Function $function -DbQuery $query -Environment $Environment -ShowQuery
    }
    
    'LeagueDraft' {
        if (-not $LeagueId) {
            Write-Host "Error: -LeagueId required for LeagueDraft scenario" -ForegroundColor Red
            exit 1
        }
        
        $query = "SELECT id, name, draft_started_at, draft_status FROM leagues WHERE id = $LeagueId"
        $function = 'draft-processor'
        
        Write-Host "Searching for league draft logs (league_id = $LeagueId)..." -ForegroundColor Cyan
        & .\scripts\aws-logs-from-db.ps1 -Function $function -DbQuery $query -TimestampColumn 'draft_started_at' -WindowBefore 2m -WindowAfter 15m -Environment $Environment -ShowQuery
    }
    
    'PlayerUpdate' {
        if (-not $PlayerId) {
            Write-Host "Error: -PlayerId required for PlayerUpdate scenario" -ForegroundColor Red
            exit 1
        }
        
        $query = "SELECT id, name, updated_at FROM players WHERE id = $PlayerId"
        $function = 'graphql'
        
        Write-Host "Searching for player update logs (player_id = $PlayerId)..." -ForegroundColor Cyan
        & .\scripts\aws-logs-from-db.ps1 -Function $function -DbQuery $query -Environment $Environment -ShowQuery
    }
    
    'MatchupUpdate' {
        if (-not $MatchupId) {
            Write-Host "Error: -MatchupId required for MatchupUpdate scenario" -ForegroundColor Red
            exit 1
        }
        
        $query = "SELECT id, updated_at FROM matchups WHERE id = $MatchupId"
        $function = 'graphql'
        
        Write-Host "Searching for matchup update logs (matchup_id = $MatchupId)..." -ForegroundColor Cyan
        & .\scripts\aws-logs-from-db.ps1 -Function $function -DbQuery $query -Environment $Environment -ShowQuery
    }
    
    'Custom' {
        if (-not $CustomQuery -or -not $CustomFunction) {
            Write-Host "Error: -CustomQuery and -CustomFunction required for Custom scenario" -ForegroundColor Red
            exit 1
        }
        
        Write-Host "Running custom log search..." -ForegroundColor Cyan
        & .\scripts\aws-logs-from-db.ps1 -Function $CustomFunction -DbQuery $CustomQuery -Environment $Environment -ShowQuery
    }
}
