# Simple CI Test Script for PowerShell
# Tests the key components of our improved CI system locally

Write-Host "=== Legacy Sports CI Test ===" -ForegroundColor Blue
Write-Host ""

# Setup environment variables to match CI
$env:NX_DAEMON = "false"
$env:NX_PARALLEL = "4"
$env:NODE_OPTIONS = "--max_old_space_size=4096"

Write-Host "1. Checking dependencies..." -ForegroundColor Cyan
$nodeVersion = node --version
Write-Host "Node.js version: $nodeVersion"

Write-Host ""
Write-Host "2. Testing code formatting..." -ForegroundColor Cyan
try {
    npx nx format:check --base=origin/main --head=HEAD
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Code formatting OK" -ForegroundColor Green
    } else {
        Write-Host "❌ Format check failed - run 'npx nx format:write' to fix" -ForegroundColor Red
    }
} catch {
    Write-Host "⚠️ Format check skipped (error: $($_.Exception.Message))" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "3. Testing affected project detection..." -ForegroundColor Cyan
try {
    $affectedProjects = npx nx show projects --affected --base=origin/main --head=HEAD
    Write-Host "Affected projects: $affectedProjects"
} catch {
    Write-Host "⚠️ Could not detect affected projects: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "4. Testing lint (affected projects only)..." -ForegroundColor Cyan
try {
    npx nx affected -t lint --base=origin/main --head=HEAD --parallel=2
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ ESLint validation passed" -ForegroundColor Green
    } else {
        Write-Host "❌ ESLint validation failed" -ForegroundColor Red
    }
} catch {
    Write-Host "⚠️ ESLint check error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "5. Testing TypeScript compilation..." -ForegroundColor Cyan
try {
    npx nx affected -t typecheck --base=origin/main --head=HEAD --parallel=2
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ TypeScript compilation passed" -ForegroundColor Green
    } else {
        Write-Host "❌ TypeScript compilation failed" -ForegroundColor Red
    }
} catch {
    Write-Host "⚠️ TypeScript check error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "6. Testing builds (affected projects)..." -ForegroundColor Cyan
try {
    npx nx affected -t build --base=origin/main --head=HEAD --parallel=2
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Builds completed successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Build validation failed" -ForegroundColor Red
    }
} catch {
    Write-Host "⚠️ Build check error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== CI Test Summary ===" -ForegroundColor Blue
Write-Host "Local CI simulation completed."
Write-Host "This simulates what the improved CI pipeline will do."
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "• Fix any issues shown above"
Write-Host "• Commit your changes"
Write-Host "• Push and create PR with 'ci-new' label to test the new CI"
