#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Runs every scripts/__tests__/*.test.ps1 suite and aggregates the results.
.DESCRIPTION
    `pnpm run test:scripts:ps` previously pointed at a single hardcoded test
    file, so a newly added .ps1 suite was silently never executed. This runner
    discovers them by glob instead (LS-9791).

    Each suite is a standalone script that exits non-zero on failure (the
    Pester-free convention described in jira-rollup.test.ps1). Every suite is
    run even after one fails, so a single CI run reports all breakage rather
    than just the first; the runner exits non-zero if any suite failed.

    Run: pnpm run test:scripts:ps
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$suites = @(Get-ChildItem -Path $PSScriptRoot -Filter '*.test.ps1' -File | Sort-Object Name)

if ($suites.Count -eq 0) {
    Write-Host "No PowerShell test suites found in $PSScriptRoot" -ForegroundColor Red
    exit 1
}

$failed = @()

# Re-invoke the *same* PowerShell host that is running this file, so the suites
# run under the interpreter CI chose. Falls back to whatever 'pwsh' resolves to
# on PATH if the process path is unavailable.
$psHost = (Get-Process -Id $PID -ErrorAction SilentlyContinue).Path
if ([string]::IsNullOrWhiteSpace($psHost)) { $psHost = 'pwsh' }

foreach ($suite in $suites) {
    Write-Host ""
    Write-Host "=== $($suite.Name) ===" -ForegroundColor Cyan

    # Run each suite in its own process: the suites dot-source helper libraries
    # and set their own preferences, so sharing a process would let one suite's
    # state leak into the next.
    & $psHost -NoProfile -File $suite.FullName
    if ($LASTEXITCODE -ne 0) {
        $failed += $suite.Name
    }
}

Write-Host ""
if ($failed.Count -gt 0) {
    Write-Host "FAILED suites ($($failed.Count)/$($suites.Count)): $($failed -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "All $($suites.Count) PowerShell test suite(s) passed" -ForegroundColor Green
exit 0
