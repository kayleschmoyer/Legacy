#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Squash all branches in the tree that have multiple commits

.DESCRIPTION
    This script walks through the branch tree and squashes each branch
    that has more than 1 commit, working from leaf nodes up to the root.
    After each squash, it cascades the changes down using skip-commits.

.EXAMPLE
    .\scripts\squash-all-branches.ps1
#>

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }

Write-Info "Squashing all branches in the tree..."
Write-Info ""

# Define the branches in order from leaf to root (bottom-up)
$branches = @(
    "LS-34/performance-optimization-for-matchup-queries-and-operations",
    "LS-31/matchup-chat",
    "LS-30/build-matchup-preview-and-predictions-feature",
    "LS-29/add-trade-deadline-and-roster-lock-features-for-matchups",
    "LS-28/implement-playoff-bracket-system-with-automatic-seeding",
    "LS-27/add-matchup-analytics-and-statistics-dashboard",
    "LS-26/build-automated-matchup-progression-system",
    "LS-25/implement-matchup-notification-system-sns-push",
    "LS-24/build-web-matchup-ui-components-next-js",
    "LS-18/extend-matchup-database-schema-to-support-team-pairings-and-scoring",
    "LS-23/build-mobile-matchup-ui-components-react-native",
    "LS-22/create-matchup-history-and-results-tracking-system",
    "LS-21/build-matchup-score-calculation-engine",
    "LS-20/implement-matchup-scheduling-algorithm-for-fantasy-leagues",
    "LS-19/build-graphql-schema-and-resolvers-for-matchup-operations",
    "feature/league-page",
    "LS-36/implement-dual-projection-system-matchup-vs-career",
    "feature/roster-management",
    "LS-47/add-commit-hook-validation-for-legacy-sports-workspace-packages",
    "LS-35/create-comprehensive-documentation-for-matchup-system",
    "LS-49/perf-db-foundation"
)

$squashedBranches = @()
$skippedBranches = @()
$skipCommitsGlobal = @()

foreach ($branch in $branches) {
    Write-Info "========================================="
    Write-Info "Processing branch: $branch"
    Write-Info "========================================="
    
    # Switch to the branch
    try {
        git checkout $branch 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not checkout $branch, skipping..."
            $skippedBranches += $branch
            continue
        }
    } catch {
        Write-Warning "Could not checkout $branch, skipping..."
        $skippedBranches += $branch
        continue
    }
    
    # Get parent branch
    $twigOutput = twig tree --no-color 2>&1 | Out-String
    $parentBranch = ""
    $lines = $twigOutput -split "`n"
    $foundCurrent = $false
    
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        if ($line -match [regex]::Escape($branch)) {
            $foundCurrent = $true
            $lineWithoutBranch = $line -replace "$([regex]::Escape($branch)).*`$", ''
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
        Write-Warning "Could not count commits for $branch, skipping..."
        $skippedBranches += $branch
        continue
    }
    
    if ([int]$commitCount -le 1) {
        Write-Info "Branch has $commitCount commit(s), skipping squash"
        $skippedBranches += $branch
        continue
    }
    
    Write-Info "Found $commitCount commits to squash"
    
    # Get the old commit hashes before squashing
    $oldCommits = git log --format="%H" "$parentBranch..HEAD"
    
    # Show commits
    Write-Info "Commits to squash:"
    git log --oneline "$parentBranch..HEAD" | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    
    # Extract ticket from branch name
    $ticket = if ($branch -match '^([A-Z]+-\d+)') { $matches[1] } else { "" }
    
    # Generate commit message
    $commits = git log --format="%s" "$parentBranch..HEAD"
    $type = "feat"
    if ($commits -match 'fix\(') { $type = "fix" }
    if ($commits -match 'refactor\(') { $type = "refactor" }
    if ($commits -match 'perf\(') { $type = "perf" }
    
    $scope = if ($branch -match 'LS-\d+/(.+)') { 
        $scopeName = $matches[1] -replace '-', ' '
        (Get-Culture).TextInfo.ToTitleCase($scopeName.ToLower()) -replace '\s', '-'
    } else { 
        "branch" 
    }
    
    $descriptions = $commits | ForEach-Object {
        if ($_ -match '(?:feat|fix|refactor|perf|chore)\([^)]+\):\s*(.+)') {
            $matches[1].Trim()
        } elseif ($_ -match '(?:feat|fix|refactor|perf|chore):\s*(.+)') {
            $matches[1].Trim()
        } else {
            $_.Trim()
        }
    } | Where-Object { $_ -and $_ -ne "" } | Select-Object -Unique
    
    $primaryDesc = if ($descriptions.Count -gt 0) { $descriptions[0] } else { "$branch changes" }
    $message = "$type($scope): $primaryDesc"
    if ($ticket) {
        $message = "$message ($ticket)"
    }
    
    Write-Info "Squashing with message: $message"
    
    # Perform squash
    git reset --soft "$parentBranch" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to reset to parent branch"
        $skippedBranches += $branch
        continue
    }
    
    git commit -m $message 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create squashed commit"
        $skippedBranches += $branch
        continue
    }
    
    Write-Success "Successfully squashed $branch!"
    $squashedBranches += $branch
    
    # Add old commits to global skip list
    foreach ($commit in $oldCommits) {
        $skipCommitsGlobal += $commit
    }
    
    Write-Info ""
}

# Save skip commits to file
$skipFile = "skip-commits-squash.txt"
$skipCommitsGlobal | ForEach-Object { "# Squashed commit from tree-wide squash`n$_" } | Out-File $skipFile

Write-Info "========================================="
Write-Success "Tree-wide squash complete!"
Write-Info "========================================="
Write-Info ""
Write-Info "Summary:"
Write-Success "  Squashed: $($squashedBranches.Count) branches"
Write-Warning "  Skipped: $($skippedBranches.Count) branches"
Write-Info ""

if ($squashedBranches.Count -gt 0) {
    Write-Info "Squashed branches:"
    $squashedBranches | ForEach-Object { Write-Host "  * $_" -ForegroundColor Green }
}

if ($skippedBranches.Count -gt 0) {
    Write-Info ""
    Write-Info "Skipped branches:"
    $skippedBranches | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

Write-Info ""
Write-Info "Skip commits file created: $skipFile"
Write-Info ""
Write-Info "Next steps:"
Write-Host "  1. Review the changes on each branch" -ForegroundColor Yellow
Write-Host "  2. Force push branches: git push origin BRANCH_NAME --force-with-lease" -ForegroundColor Yellow
Write-Host "  3. Rebase tree with skip commits: make rebase-tree-skip SKIP_COMMITS_FILE=`"$skipFile`"" -ForegroundColor Yellow
Write-Info ""
