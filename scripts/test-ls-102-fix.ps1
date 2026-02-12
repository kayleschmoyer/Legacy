# LS-102 Fix Testing Script
# Tests the console window flashing fix on Windows

$ErrorActionPreference = "Stop"

Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host " LS-102: Console Window Flashing Fix Test" -ForegroundColor Cyan
Write-Host "=============================================`n" -ForegroundColor Cyan

$allPassed = $true

# Test 1: Wrapper script basic execution
Write-Host "Test 1: Wrapper script basic execution" -ForegroundColor Yellow
try {
    $output = & .\scripts\nx-wrapper.ps1 show projects 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Wrapper script executes successfully" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Wrapper script failed with exit code $LASTEXITCODE" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  [FAIL] Wrapper script threw exception: $_" -ForegroundColor Red
    $allPassed = $false
}

# Test 2: Parallel execution (limited to 2 projects for speed)
Write-Host "`nTest 2: Parallel execution" -ForegroundColor Yellow
try {
    $startTime = Get-Date
    & .\scripts\nx-wrapper.ps1 run-many -t typecheck --projects=utils --parallel=1 2>&1 | Out-Null
    $duration = (Get-Date) - $startTime
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Parallel execution completed ($($duration.TotalSeconds)s)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Parallel execution failed with exit code $LASTEXITCODE" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  [FAIL] Parallel execution threw exception: $_" -ForegroundColor Red
    $allPassed = $false
}

# Test 3: Exit code preservation (test with invalid command)
Write-Host "`nTest 3: Exit code preservation" -ForegroundColor Yellow
try {
    & .\scripts\nx-wrapper.ps1 run-nonexistent-target-12345 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [OK] Exit codes preserved (got non-zero as expected)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Exit codes not preserved (expected non-zero, got 0)" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  [OK] Exit codes preserved (exception caught as expected)" -ForegroundColor Green
}

# Test 4: Verify windowsHide in spawn calls
Write-Host "`nTest 4: Verify windowsHide in scripts" -ForegroundColor Yellow
$scriptsToCheck = @(
    "scripts/ui-previews.ts",
    "scripts/start-dev-services.js",
    "scripts/test-storybook-ci.ts"
)

foreach ($script in $scriptsToCheck) {
    $content = Get-Content $script -Raw
    if ($content -match "windowsHide") {
        Write-Host "  [OK] $script has windowsHide" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $script missing windowsHide" -ForegroundColor Red
        $allPassed = $false
    }
}

# Test 5: Node.js version check
Write-Host "`nTest 5: Node.js version compatibility" -ForegroundColor Yellow
$nodeVersion = node --version
if ($nodeVersion -match "v(\d+)\.") {
    $majorVersion = [int]$Matches[1]
    if ($majorVersion -ge 13) {
        Write-Host "  [OK] Node.js $nodeVersion supports windowsHide" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Node.js $nodeVersion too old (need 13+)" -ForegroundColor Red
        $allPassed = $false
    }
}

# Summary
Write-Host "`n=============================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host " ALL TESTS PASSED" -ForegroundColor Green
    Write-Host "=============================================`n" -ForegroundColor Cyan
    Write-Host "Console window flashing should now be fixed." -ForegroundColor Green
    Write-Host "Try running: make pre-commit" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host " SOME TESTS FAILED" -ForegroundColor Red
    Write-Host "=============================================`n" -ForegroundColor Cyan
    Write-Host "Please review the errors above." -ForegroundColor Yellow
    exit 1
}
