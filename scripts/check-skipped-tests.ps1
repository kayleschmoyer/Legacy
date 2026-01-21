#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Detects and reports skipped tests in the test suite

.DESCRIPTION
    This script analyzes test files for test.skip() calls and reports them.
    It can be integrated into CI to warn when tests are skipped.

.PARAMETER Path
    Base path to search for test files (default: current directory)

.PARAMETER FailOnSkipped
    Exit with error code if skipped tests are found

.PARAMETER ShowDetails
    Show detailed information about each skipped test

.EXAMPLE
    .\check-skipped-tests.ps1

.EXAMPLE
    .\check-skipped-tests.ps1 -Path "tests/e2e" -FailOnSkipped -ShowDetails
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$Path = ".",
    
    [Parameter(Mandatory=$false)]
    [switch]$FailOnSkipped = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$ShowDetails = $false
)

$ErrorActionPreference = "Stop"

Write-Host "Scanning for skipped tests..." -ForegroundColor Cyan
Write-Host ""

# Find all test files
$testFiles = Get-ChildItem -Path $Path -Recurse -Include "*.spec.ts","*.test.ts" -File

$totalSkips = 0
$filesWithSkips = @()

foreach ($file in $testFiles) {
    $content = Get-Content -Path $file.FullName -Raw
    $lines = Get-Content -Path $file.FullName
    
    # Count test.skip() occurrences
    $skipMatches = [regex]::Matches($content, "test\.skip\(")
    
    if ($skipMatches.Count -gt 0) {
        $totalSkips += $skipMatches.Count
        
        $relativePath = $file.FullName.Replace((Get-Location).Path, "").TrimStart('\', '/')
        $filesWithSkips += @{
            File = $relativePath
            Count = $skipMatches.Count
            Lines = @()
        }
        
        Write-Host "File: $relativePath" -ForegroundColor Yellow
        Write-Host "   Found $($skipMatches.Count) skipped test(s)" -ForegroundColor Yellow
        
        if ($ShowDetails) {
            # Find skip reasons
            $lineNumber = 0
            $skipReasons = @()
            
            foreach ($line in $lines) {
                $lineNumber++
                
                if ($line -match "test\.skip\(") {
                    # Look for SKIP-REASON in previous lines (up to 5 lines back)
                    $skipReason = $null
                    $todoNote = $null
                    
                    for ($i = [Math]::Max(0, $lineNumber - 6); $i -lt $lineNumber; $i++) {
                        if ($lines[$i] -match "SKIP-REASON:\s*(.+)") {
                            $skipReason = $matches[1].Trim()
                        }
                        if ($lines[$i] -match "TODO:\s*(.+)") {
                            $todoNote = $matches[1].Trim()
                        }
                    }
                    
                    Write-Host "   Line $lineNumber" -ForegroundColor Gray
                    
                    if ($skipReason) {
                        Write-Host "     [OK] Reason: $skipReason" -ForegroundColor Green
                    } else {
                        Write-Host "     [MISSING] SKIP-REASON comment" -ForegroundColor Red
                    }
                    
                    if ($todoNote) {
                        Write-Host "     TODO: $todoNote" -ForegroundColor Cyan
                    } else {
                        Write-Host "     [WARNING] Missing TODO comment" -ForegroundColor Yellow
                    }
                    
                    Write-Host ""
                }
            }
        }
        
        Write-Host ""
    }
}

# Summary
Write-Host "============================================" -ForegroundColor Gray
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "   Total skipped tests: $totalSkips" -ForegroundColor $(if ($totalSkips -eq 0) { "Green" } else { "Yellow" })
Write-Host "   Files with skips: $($filesWithSkips.Count)" -ForegroundColor $(if ($filesWithSkips.Count -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

if ($totalSkips -gt 0) {
    Write-Host "[WARNING] $totalSkips test(s) are currently skipped" -ForegroundColor Yellow
    Write-Host "   Review skip reasons and re-enable when possible" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Run with -ShowDetails to see detailed skip information" -ForegroundColor Gray
    Write-Host "   See docs/build-and-tooling/e2e-test-maintenance.md for guidelines" -ForegroundColor Gray
    Write-Host ""
    
    if ($FailOnSkipped) {
        Write-Host "[ERROR] Failing build due to skipped tests (use -FailOnSkipped:$false to allow)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[SUCCESS] No skipped tests found!" -ForegroundColor Green
    Write-Host ""
}

exit 0
