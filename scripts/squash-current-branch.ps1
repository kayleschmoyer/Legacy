#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Squash a single branch and prepare for cascading

.DESCRIPTION
    This script squashes the current branch and provides instructions for cascading

.EXAMPLE
    git checkout LS-34/branch-name
    .\scripts\squash-current-branch.ps1
#>

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }

# Get current branch
$currentBranch = git branch --show-current
if (!$currentBranch) {
    Write-Error "ERROR: Not on a branch"
    exit 1
}

Write-Info "Squashing branch: $currentBranch"
Write-Info ""

# Get parent from twig
$twigOutput = twig tree --no-color 2>&1 | Out-String
$parentBranch = ""
$lines = $twigOutput -split "`n"

for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -match [regex]::Escape($currentBranch)) {
        $lineWithoutBranch = $line -replace "$([regex]::Escape($currentBranch)).*`$", ''
        $currentIndent = $lineWithoutBranch.Length
        
        for ($j = $i - 1; $j -ge 0; $j--) {
            $prevLine = $lines[$j]
            if ($prevLine -match '([\w-]+(?:/[\w-]+)?)') {
                $candidateBranch = $matches[1]
                $prevLineWithoutBranch = $prevLine -replace "$([regex]::Escape($candidateBranch)).*`$", ''
                $prevIndent = $prevLineWithoutBranch.Length
                
                if ($prevIndent -lt $currentIndent) {
                    $parentBranch = $candidateBranch
                    break
                }
            }
        }
        break
    }
}

if (!$parentBranch) {
    $parentBranch = "main"
}

Write-Info "Parent branch: $parentBranch"

# Count commits
$commitCount = git rev-list --count "$parentBranch..HEAD" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Failed to count commits"
    exit 1
}

if ([int]$commitCount -le 1) {
    Write-Warning "Only $commitCount commit(s) on branch, nothing to squash"
    exit 0
}

Write-Info "Found $commitCount commits to squash"
Write-Info ""

# Get old commit hashes before squashing
Write-Info "Recording commits to skip in cascade:"
$oldCommits = git log --format="%H  # %s" "$parentBranch..HEAD"
$oldCommits | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
Write-Info ""

# Save to file
$skipFile = "skip-commits-$currentBranch.txt"
$oldCommits | Out-File $skipFile -Encoding UTF8

# Run the existing squash script
Write-Info "Running squash..."
powershell -ExecutionPolicy Bypass -File ".\scripts\squash-branch.ps1"

if ($LASTEXITCODE -eq 0) {
    Write-Success ""
    Write-Success "Branch squashed successfully!"
    Write-Info ""
    Write-Info "Skip commits file saved to: $skipFile"
    Write-Info ""
    Write-Info "Next steps:"
    Write-Host "  1. Force push: git push origin $currentBranch --force-with-lease" -ForegroundColor Yellow
    Write-Host "  2. Move to child branch and rebase with skip: git checkout CHILD_BRANCH" -ForegroundColor Yellow
    Write-Host "  3. twig rebase --skip-commits $skipFile" -ForegroundColor Yellow
    Write-Host "  4. Repeat for all child branches in the tree" -ForegroundColor Yellow
}
