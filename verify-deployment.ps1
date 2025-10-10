# Final verification that roster management is deployed
$headers = @{
    'Content-Type' = 'application/json'
}

Write-Host "🔍 Verifying latest GraphQL deployment..." -ForegroundColor Yellow

# Test 1: Version query
Write-Host "`n1. Testing version query..." -ForegroundColor Cyan
$versionQuery = '{"query":"{ version { version gitCommit deployedAt environment } }"}'
try {
    $versionResponse = Invoke-WebRequest -Uri "https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/graphql" -Method POST -Headers $headers -Body $versionQuery
    $versionData = ($versionResponse.Content | ConvertFrom-Json).data.version
    Write-Host "   ✅ Version: $($versionData.version)" -ForegroundColor Green  
    Write-Host "   ✅ Git Commit: $($versionData.gitCommit)" -ForegroundColor Green
    Write-Host "   ✅ Deployed At: $($versionData.deployedAt)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Version query failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Schema introspection for roster management
Write-Host "`n2. Testing roster management schema..." -ForegroundColor Cyan
$schemaQuery = '{"query":"{ __type(name: \"Query\") { fields { name } } }"}'
try {
    $schemaResponse = Invoke-WebRequest -Uri "https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/graphql" -Method POST -Headers $headers -Body $schemaQuery
    $fields = (($schemaResponse.Content | ConvertFrom-Json).data.__type.fields | ForEach-Object { $_.name })
    
    $hasTeamMembers = $fields -contains "teamMembers"
    $hasLeaguePositions = $fields -contains "leaguePositions"
    
    if ($hasTeamMembers) {
        Write-Host "   ✅ teamMembers query available" -ForegroundColor Green
    } else {
        Write-Host "   ❌ teamMembers query missing" -ForegroundColor Red
    }
    
    if ($hasLeaguePositions) {
        Write-Host "   ✅ leaguePositions query available" -ForegroundColor Green
    } else {
        Write-Host "   ❌ leaguePositions query missing" -ForegroundColor Red
    }
    
    if ($hasTeamMembers -and $hasLeaguePositions) {
        Write-Host "`n🎉 SUCCESS: Latest GraphQL lambda deployed with roster management!" -ForegroundColor Green
        Write-Host "   • Version tracking: ✅" -ForegroundColor Green
        Write-Host "   • Roster management: ✅" -ForegroundColor Green
        Write-Host "   • teamMembers query: ✅" -ForegroundColor Green
        Write-Host "   • leaguePositions query: ✅" -ForegroundColor Green
        Write-Host "`n🚀 Ready to test at: http://localhost:4200/#/baseball/league/9" -ForegroundColor Cyan
    } else {
        Write-Host "`n⚠️  Deployment incomplete - roster management queries missing" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "   ❌ Schema query failed: $($_.Exception.Message)" -ForegroundColor Red
}
