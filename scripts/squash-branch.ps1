#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Squash all commits on current branch from its parent in the twig tree

.DESCRIPTION
    This script:
    1. Gets the parent branch from twig tree
    2. Counts commits on current branch
    3. Squashes all commits with a well-formatted commit message
    4. Preserves the branch ticket (e.g., LS-34) in the commit message

.PARAMETER Message
    Optional custom commit message (will be formatted with ticket prefix)

.EXAMPLE
    .\scripts\squash-branch.ps1
    .\scripts\squash-branch.ps1 -Message "Add feature X"
#>

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }

Write-Info "Squashing branch commits..."

# Get current branch
$currentBranch = git branch --show-current
if (!$currentBranch) {
    Write-Error "ERROR: Not on a branch"
    exit 1
}

Write-Info "Current branch: $currentBranch"

# Extract ticket number from branch name (e.g., LS-34 from LS-34/feature-name)
$ticket = if ($currentBranch -match '^([A-Z]+-\d+)') { $matches[1] } else { "" }

# Get parent branch from twig
Write-Info "Getting parent branch from twig..."
$twigOutput = twig tree --no-color 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Failed to get twig tree"
    exit 1
}

# Parse twig tree output to find parent
# The output uses box-drawing characters and indentation to show hierarchy
$parentBranch = ""
$lines = $twigOutput -split "`n"
$foundCurrent = $false

for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -match [regex]::Escape($currentBranch)) {
        $foundCurrent = $true
        # Calculate indent level by removing branch name and everything after it
        # This leaves us with just the tree structure characters
        $lineWithoutBranch = $line -replace "$currentBranch.*`$", ''
        $currentIndent = $lineWithoutBranch.Length
        
        # Look backwards for parent (line with less indentation)
        for ($j = $i - 1; $j -ge 0; $j--) {
            $prevLine = $lines[$j]
            # Extract just the branch name from this line
            # Branch names are word chars, possibly with slashes and hyphens
            if ($prevLine -match '([\w-]+(?:/[\w-]+)?)') {
                $candidateBranch = $matches[1]
                $prevLineWithoutBranch = $prevLine -replace "$candidateBranch.*`$", ''
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
    # Fallback to main if no parent found
    $parentBranch = "main"
    Write-Warning "WARNING: Could not determine parent from twig tree, using 'main'"
} else {
    Write-Success "Parent branch: $parentBranch"
}

# Count commits on current branch from parent
$commitCount = git rev-list --count "$parentBranch..HEAD" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Failed to count commits"
    exit 1
}

if ([int]$commitCount -le 1) {
    Write-Warning "WARNING: Only $commitCount commit(s) on branch, nothing to squash"
    exit 0
}

Write-Info "Found $commitCount commits to squash"

# Get commit messages for context
Write-Info "`nRecent commits:"
git log --oneline "$parentBranch..HEAD" | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

# Generate commit message
if (!$Message) {
    # Try to extract a meaningful description from commit messages
    $commits = git log --format="%s" "$parentBranch..HEAD"
    
    # Look for feature/fix commits and extract descriptions
    $descriptions = $commits | ForEach-Object {
        if ($_ -match '(?:feat|fix|refactor|perf|chore)\([^)]+\):\s*(.+)') {
            $matches[1].Trim()
        } elseif ($_ -match '(?:feat|fix|refactor|perf|chore):\s*(.+)') {
            $matches[1].Trim()
        } else {
            $_.Trim()
        }
    } | Where-Object { $_ -and $_ -ne "" } | Select-Object -Unique

    # Determine the type (feat, fix, etc.) based on commits
    $type = "feat"
    if ($commits -match 'fix\(') { $type = "fix" }
    if ($commits -match 'refactor\(') { $type = "refactor" }
    if ($commits -match 'perf\(') { $type = "perf" }

    # Extract scope from branch name if possible
    $scope = if ($currentBranch -match 'LS-\d+/(.+)') { 
        $scopeName = $matches[1] -replace '-', ' '
        # Convert to title case
        (Get-Culture).TextInfo.ToTitleCase($scopeName.ToLower()) -replace '\s', '-'
    } else { 
        "branch" 
    }

    # Build message
    if ($descriptions.Count -gt 0) {
        $primaryDesc = $descriptions[0]
        $Message = "$type($scope): $primaryDesc"
        
        # Add body with all changes if multiple distinct changes
        if ($descriptions.Count -gt 1) {
            $bodyLines = $descriptions | Select-Object -Skip 1 | ForEach-Object { "- $_" }
            $body = "`n`n" + ($bodyLines -join "`n")
        } else {
            $body = ""
        }
    } else {
        $Message = "$type($scope): $currentBranch changes"
        $body = ""
    }
} else {
    # User provided message - format it if needed
    if ($Message -notmatch '(?:feat|fix|refactor|perf|chore)') {
        $Message = "feat: $Message"
    }
    $body = ""
}

# Add ticket reference if available
if ($ticket) {
    $Message = "$Message ($ticket)"
}

Write-Info "`nSquashing with commit message:"
Write-Host "  $Message" -ForegroundColor Green
if ($body) {
    Write-Host "$body" -ForegroundColor DarkGray
}

# Confirm before squashing
Write-Host ""
$confirm = Read-Host "Continue with squash? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Warning "Squash cancelled"
    exit 0
}

# Perform the squash using reset
Write-Info "`nPerforming squash..."
$commitsToDrop = [int]$commitCount

# Soft reset to parent branch
git reset --soft "$parentBranch" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Failed to reset to parent branch"
    exit 1
}

# Create new commit with formatted message
$fullMessage = $Message + $body
try {
    git commit -m $fullMessage
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ERROR: Failed to create squashed commit"
        exit 1
    }
} catch {
    Write-Error "ERROR: Failed to create squashed commit: $_"
    exit 1
}

Write-Success "`nSuccessfully squashed $commitsToDrop commits into 1!"
Write-Info "`nNew commit:"
git log -1 --oneline

Write-Info "`nNext steps:"
Write-Host "  1. Review the squashed commit: git log -1 --stat" -ForegroundColor Yellow
Write-Host "  2. Force push to remote: git push origin HEAD --force-with-lease" -ForegroundColor Yellow
Write-Host "  3. Rebase child branches: make rebase-tree" -ForegroundColor Yellow
