#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Create a worktree with correct twig parent dependency in one command.
.DESCRIPTION
    Wraps `twig worktree create` + `twig branch depend` to ensure every worktree
    has its parent relationship registered -- preventing orphaned branches in
    `twig tree`.

    For independent tickets the parent defaults to "main".
    For dependent tickets pass -Parent with the parent branch name or Jira key.
.PARAMETER TicketKey
    Jira ticket key, e.g. LS-507
.PARAMETER Desc
    Short kebab-case description for the branch suffix, e.g. "fix-scoring".
    Defaults to "work" when omitted.
.PARAMETER Parent
    Parent branch or Jira key.  Defaults to "main".
    Examples: main, LS-473/draft-queue-autopick, LS-473
.PARAMETER NoWorkspace
    Skip auto-adding the worktree to the VS Code multi-root workspace.
.EXAMPLE
    # Independent ticket (parent = main)
    .\scripts\worktree-create.ps1 -TicketKey LS-507 -Desc fix-scoring

    # Dependent ticket (parent = another branch)
    .\scripts\worktree-create.ps1 -TicketKey LS-508 -Desc matchup-refresh -Parent LS-507/fix-scoring
.EXAMPLE
    # Via Makefile (recommended)
    make worktree TICKET=507 DESC=fix-scoring
    make worktree TICKET=508 DESC=matchup-refresh PARENT=LS-507/fix-scoring
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^LS-\d+$')]
    [string]$TicketKey,

    [string]$Desc = "work",

    [string]$Parent = "main",

    [switch]$NoWorkspace
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Resolve parent: if a bare Jira key is given (e.g. LS-473), find the
# matching branch so twig branch depend gets an actual branch name.
# ---------------------------------------------------------------------------
function Resolve-ParentBranch([string]$raw) {
    if ($raw -eq "main" -or $raw -eq "none") { return $raw }

    # Already a full branch name (contains slash or dash after LS-###)
    if ($raw -match '^LS-\d+[/-].') { return $raw }

    # Bare Jira key -- look for a branch starting with that key
    if ($raw -match '^LS-\d+$') {
        $match = git branch --list "$raw/*" --format "%(refname:short)" 2>$null |
            Select-Object -First 1
        if (-not $match) {
            $match = git branch --list "$raw-*" --format "%(refname:short)" 2>$null |
                Select-Object -First 1
        }
        if ($match) {
            Write-Host "[INFO] Resolved parent Jira key $raw -> branch $match" -ForegroundColor Yellow
            return $match
        }
        Write-Host "[ERROR] Could not find a local branch for parent '$raw'." -ForegroundColor Red
        Write-Host "        List branches: git branch --list '$raw*'"
        exit 1
    }

    # Assume it's a literal branch name
    return $raw
}

$branchName = "$TicketKey/$Desc"
$resolvedParent = Resolve-ParentBranch $Parent
$ticketNumber = if ($TicketKey -match '\d+') { $Matches[0] } else { "" }

# ---------------------------------------------------------------------------
# Safety check: main repo must be on the 'main' branch.
# If the user-testing skill (or a crash) left it on a feature branch,
# worktree creation would use the wrong base.
# ---------------------------------------------------------------------------
$currentBranch = git branch --show-current 2>$null
if ($currentBranch -and $currentBranch -ne 'main') {
    Write-Host "" -ForegroundColor Red
    Write-Host "[ERROR] Main repo is on '$currentBranch', not 'main'." -ForegroundColor Red
    Write-Host "        Worktrees must be created from the main branch." -ForegroundColor Red
    Write-Host "        Run:  git checkout main" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ---------------------------------------------------------------------------
# Fetch latest refs so the worktree is cut from the current remote state.
# Without this, origin/main (or the parent branch) may be stale and the
# worktree starts from an outdated base -- requiring a post-create rebase.
# ---------------------------------------------------------------------------
Write-Host "[PRE] Fetching origin..." -ForegroundColor DarkGray
git fetch origin 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] git fetch origin failed -- continuing with local refs" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Worktree Create" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Branch : $branchName" -ForegroundColor White
Write-Host "  Parent : $resolvedParent" -ForegroundColor White
Write-Host ""

# ---------------------------------------------------------------------------
# Step 1 -- Create worktree (also creates the branch if needed)
# ---------------------------------------------------------------------------
Write-Host "[1/4] Creating worktree..." -ForegroundColor Cyan
twig worktree create $branchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] twig worktree create failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Step 2 -- Register parent dependency
# ---------------------------------------------------------------------------
if ($resolvedParent -ne "none") {
    Write-Host "[2/4] Registering parent dependency ($branchName -> $resolvedParent)..." -ForegroundColor Cyan
    twig branch depend $branchName $resolvedParent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[WARN] twig branch depend failed - you may need to run manually:" -ForegroundColor Yellow
        Write-Host "       twig branch depend $branchName $resolvedParent"
    }
} else {
    Write-Host '[2/4] Skipping parent dependency (-Parent none)' -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# Step 3 -- Verify with twig tree (compact)
# ---------------------------------------------------------------------------
Write-Host "[3/4] Verifying branch tree..." -ForegroundColor Cyan
twig tree 2>$null | Select-String $TicketKey | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }

# ---------------------------------------------------------------------------
# Step 4 -- Auto-add to VS Code workspace
# ---------------------------------------------------------------------------
if (-not $NoWorkspace -and $ticketNumber -and (Test-Path "legacy-sports.code-workspace")) {
    Write-Host "[4/4] Adding to VS Code workspace..." -ForegroundColor Cyan
    & "$PSScriptRoot\sync-worktrees.ps1" -Add $ticketNumber
} else {
    Write-Host "[4/4] Skipping workspace sync" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
$wtPath = twig worktree list --porcelain 2>$null |
    Select-String "path:" |
    Where-Object { $_ -match [regex]::Escape($TicketKey) } |
    ForEach-Object { ($_ -split "path:\s*")[1].Trim() } |
    Select-Object -First 1

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Worktree ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
if ($wtPath) {
    Write-Host "  Path   : $wtPath" -ForegroundColor White
}
Write-Host "  Branch : $branchName" -ForegroundColor White
Write-Host "  Parent : $resolvedParent" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
if ($wtPath) {
    Write-Host "  cd $wtPath"
} else {
    Write-Host "  cd (path from twig worktree list)"
}
Write-Host "  make install"
Write-Host "  Copy-Item D:\code\legacy-sports\.env .env"
Write-Host "  cmd /c mklink /J .twig D:\code\legacy-sports\.twig"
Write-Host "  code ."
Write-Host ""
