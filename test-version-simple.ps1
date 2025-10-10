# Test version query with simple approach
try {
    $headers = @{
        'Content-Type' = 'application/json'
    }
    
    $requestBody = '{"query":"{ version { version gitCommit deployedAt environment } }"}'
    
    Write-Host "Testing version query..." -ForegroundColor Yellow
    
    $response = Invoke-WebRequest -Uri "https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/graphql" -Method POST -Headers $headers -Body $requestBody
    
    $responseData = $response.Content | ConvertFrom-Json
    
    if ($responseData.data -and $responseData.data.version) {
        $version = $responseData.data.version
        Write-Host "`n🎉 GraphQL Version Information:" -ForegroundColor Green
        Write-Host "  Version: $($version.version)" -ForegroundColor Cyan
        Write-Host "  Git Commit: $($version.gitCommit)" -ForegroundColor Cyan
        Write-Host "  Deployed At: $($version.deployedAt)" -ForegroundColor Cyan
        Write-Host "  Environment: $($version.environment)" -ForegroundColor Cyan
    } else {
        Write-Host "`n❌ Version query failed" -ForegroundColor Red
        Write-Host "Response: $($response.Content)" -ForegroundColor Gray
    }
}
catch {
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
}
