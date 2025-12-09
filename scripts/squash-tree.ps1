#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Squash all branches in tree systematically from leaves to root

.DESCRIPTION
    This script processes the branch tree in order, squashing branches
    with multiple commits and cascading changes to children.

.PARAMETER DryRun
    Show what would be done without making changes

.EXAMPLE
    .\scripts\squash-tree.ps1
    .\scripts\squash-tree.ps1 -DryRun
#>

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }

Write-Info "==================================================="
Write-Info "Tree-Wide Branch Squash System"
Write-Info "==================================================="
Write-Info ""

if ($DryRun) {
    Write-Warning "DRY RUN MODE - No changes will be made"
    Write-Info ""
}

# Get current branch to return to later
$originalBranch = git branch --show-current

# Define branches with their parents (leaves first)
# Based on the tree structure
$branchParentMap = @{
    "LS-34/performance-optimization-for-matchup-queries-and-operations" = "LS-31/matchup-chat"
    "LS-18/extend-matchup-database-schema-to-support-team-pairings-and-scoring" = "LS-23/build-mobile-matchup-ui-components-react-native"
    "LS-31/matchup-chat" = "LS-30/build-matchup-preview-and-predictions-feature"
    "LS-30/build-matchup-preview-and-predictions-feature" = "LS-29/add-trade-deadline-and-roster-lock-features-for-matchups"
    "LS-29/add-trade-deadline-and-roster-lock-features-for-matchups" = "LS-28/implement-playoff-bracket-system-with-automatic-seeding"
    "LS-28/implement-playoff-bracket-system-with-automatic-seeding" = "LS-27/add-matchup-analytics-and-statistics-dashboard"
    "LS-27/add-matchup-analytics-and-statistics-dashboard" = "LS-26/build-automated-matchup-progression-system"
    "LS-26/build-automated-matchup-progression-system" = "LS-25/implement-matchup-notification-system-sns-push"
    "LS-25/implement-matchup-notification-system-sns-push" = "LS-24/build-web-matchup-ui-components-next-js"
    "LS-24/build-web-matchup-ui-components-next-js" = "LS-23/build-mobile-matchup-ui-components-react-native"
    "LS-23/build-mobile-matchup-ui-components-react-native" = "LS-22/create-matchup-history-and-results-tracking-system"
    "LS-22/create-matchup-history-and-results-tracking-system" = "LS-21/build-matchup-score-calculation-engine"
    "LS-21/build-matchup-score-calculation-engine" = "LS-20/implement-matchup-scheduling-algorithm-for-fantasy-leagues"
    "LS-20/implement-matchup-scheduling-algorithm-for-fantasy-leagues" = "LS-19/build-graphql-schema-and-resolvers-for-matchup-operations"
    "LS-19/build-graphql-schema-and-resolvers-for-matchup-operations" = "LS-17/set-up-matchup-system-for-fantasy-leagues"
    "feature/league-page" = "LS-17/set-up-matchup-system-for-fantasy-leagues"
    "LS-36/implement-dual-projection-system-matchup-vs-career" = "LS-17/set-up-matchup-system-for-fantasy-leagues"
    "LS-17/set-up-matchup-system-for-fantasy-leagues" = "feature/roster-management"
    "feature/roster-management" = "main"
    "LS-47/add-commit-hook-validation-for-legacy-sports-workspace-packages" = "main"
    "LS-35/create-comprehensive-documentation-for-matchup-system" = "main"
    "LS-49/perf-db-foundation" = "main"
    "dependabot/npm_and_yarn/nx/web-22.0.1" = "main"
}

# Define processing order (leaves to root)
$processingOrder = @(
    "LS-34/performance-optimization-for-matchup-queries-and-operations",
    "LS-18/extend-matchup-database-schema-to-support-team-pairings-and-scoring",
    "LS-31/matchup-chat",
    "LS-30/build-matchup-preview-and-predictions-feature",
    "LS-29/add-trade-deadline-and-roster-lock-features-for-matchups",
    "LS-28/implement-playoff-bracket-system-with-automatic-seeding",
    "LS-27/add-matchup-analytics-and-statistics-dashboard",
    "LS-26/build-automated-matchup-progression-system",
    "LS-25/implement-matchup-notification-system-sns-push",
    "LS-24/build-web-matchup-ui-components-next-js",
    "LS-23/build-mobile-matchup-ui-components-react-native",
    "LS-22/create-matchup-history-and-results-tracking-system",
    "LS-21/build-matchup-score-calculation-engine",
    "LS-20/implement-matchup-scheduling-algorithm-for-fantasy-leagues",
    "LS-19/build-graphql-schema-and-resolvers-for-matchup-operations",
    "feature/league-page",
    "LS-36/implement-dual-projection-system-matchup-vs-career",
    "LS-17/set-up-matchup-system-for-fantasy-leagues",
    "feature/roster-management",
    "LS-47/add-commit-hook-validation-for-legacy-sports-workspace-packages",
    "LS-35/create-comprehensive-documentation-for-matchup-system",
    "LS-49/perf-db-foundation",
    "dependabot/npm_and_yarn/nx/web-22.0.1"
)

$squashedCount = 0
$skippedCount = 0
$allSkipCommits = @{}

foreach ($branch in $processingOrder) {
    Write-Info "---------------------------------------------------"
    Write-Info "Checking: $branch"
    Write-Info "---------------------------------------------------"
    
    # Check if branch exists
    $branchExists = git rev-parse --verify $branch 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "  Branch does not exist locally, skipping"
        $skippedCount++
        Write-Info ""
        continue
    }
    
    # Checkout branch
    if (!$DryRun) {
        $ErrorActionPreference = "SilentlyContinue"
        git checkout $branch 2>&1 | Out-Null
        $ErrorActionPreference = "Stop"
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "  Could not checkout branch, skipping"
            $skippedCount++
            Write-Info ""
            continue
        }
    }
    
    # Get parent from map
    $parentBranch = $branchParentMap[$branch]
    if (!$parentBranch) {
        $parentBranch = "main"
    }
    
    Write-Info "  Parent: $parentBranch"
    
    # Count commits
    $commitCount = [int](git rev-list --count "$parentBranch..HEAD" 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "  Could not count commits, skipping"
        $skippedCount++
        Write-Info ""
        continue
    }
    
    Write-Info "  Commits: $commitCount"
    
    if ($commitCount -le 1) {
        Write-Info "  Skipping (nothing to squash)"
        $skippedCount++
        Write-Info ""
        continue
    }
    
    # Get old commits before squashing
    $oldCommits = @(git log --format="%H" "$parentBranch..HEAD")
    
    if ($DryRun) {
        Write-Success "  [DRY RUN] Would squash $commitCount commits"
        $squashedCount++
    } else {
        # Perform squash
        Write-Info "  Squashing $commitCount commits..."
        
        # Generate commit message
        $ticket = if ($branch -match '^([A-Z]+-\d+)') { $matches[1] } else { "" }
        $commits = git log --format="%s" "$parentBranch..HEAD"
        
        $type = "feat"
        if ($commits -match 'fix\(') { $type = "fix" }
        if ($commits -match 'refactor\(') { $type = "refactor" }
        if ($commits -match 'perf\(') { $type = "perf" }
        
        $scope = if ($branch -match 'LS-\d+/(.+)') { 
            $scopeName = $matches[1] -replace '-', ' '
            (Get-Culture).TextInfo.ToTitleCase($scopeName.ToLower()) -replace '\s', '-'
        } else { 
            $branch -replace '/', '-'
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
        
        $primaryDesc = if ($descriptions.Count -gt 0) { $descriptions[0] } else { "changes" }
        $message = "$type($scope): $primaryDesc"
        if ($ticket) {
            $message = "$message ($ticket)"
        }
        
        # Do the squash
        $ErrorActionPreference = "SilentlyContinue"
        git reset --soft "$parentBranch" 2>&1 | Out-Null
        $ErrorActionPreference = "Stop"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "  Failed to reset, skipping"
            $skippedCount++
            Write-Info ""
            continue
        }
        
        $ErrorActionPreference = "SilentlyContinue"
        git commit -m $message 2>&1 | Out-Null
        $ErrorActionPreference = "Stop"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "  Failed to commit, skipping"
            $skippedCount++
            Write-Info ""
            continue
        }
        
        Write-Success "  Squashed successfully!"
        $squashedCount++
        
        # Store skip commits
        $allSkipCommits[$branch] = $oldCommits
    }
    
    Write-Info ""
}

# Return to original branch
if (!$DryRun -and $originalBranch) {
    git checkout $originalBranch 2>&1 | Out-Null
}

# Write skip commits file
if (!$DryRun -and $allSkipCommits.Count -gt 0) {
    $skipFile = "skip-commits-tree-squash.txt"
    $content = @"
# Skip commits from tree-wide squash
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
#
# These commits were squashed and should be skipped during cascade
#

"@
    
    foreach ($branchName in $allSkipCommits.Keys) {
        $content += "# Branch: $branchName`n"
        foreach ($commit in $allSkipCommits[$branchName]) {
            $content += "$commit`n"
        }
        $content += "`n"
    }
    
    $content | Out-File $skipFile -Encoding UTF8
    Write-Info "Skip commits saved to: $skipFile"
    Write-Info ""
}

Write-Info "==================================================="
Write-Success "Tree-Wide Squash Complete!"
Write-Info "==================================================="
Write-Info ""
Write-Info "Summary:"
Write-Success "  Squashed: $squashedCount branches"
Write-Warning "  Skipped: $skippedCount branches"
Write-Info ""

if (!$DryRun -and $squashedCount -gt 0) {
    Write-Info "Next steps:"
    Write-Host "  1. Review changes: git log -1 on each branch" -ForegroundColor Yellow
    Write-Host "  2. Force push all branches: (see list below)" -ForegroundColor Yellow
    Write-Host "  3. Cascade using skip file: make rebase-tree-skip SKIP_COMMITS_FILE=`"skip-commits-tree-squash.txt`"" -ForegroundColor Yellow
    Write-Info ""
    Write-Info "Force push commands:"
    
    foreach ($branch in $processingOrder) {
        if ($allSkipCommits.ContainsKey($branch)) {
            Write-Host "  git push origin $branch --force-with-lease" -ForegroundColor DarkGray
        }
    }
}

Write-Info ""
