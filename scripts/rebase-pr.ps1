#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Rebase a feature branch onto its parent (main or stacked branch) with
    post-rebase stabilization, ready for `make pc`.

.DESCRIPTION
    Given a branch name, this script:
      1. Finds (or creates) the branch's worktree via pr-enter-worktree.ps1.
      2. Runs `git fetch origin` and `twig rebase` inside that worktree.
      3. If conflicts are detected, exits non-zero immediately — the agent
         should resolve conflicts manually, then re-run this script or
         manually complete the stabilization and `make pc`.
      4. If the rebase succeeds cleanly, runs post-rebase stabilization:
           - make install  (pick up any new deps from main)
           - pnpm exec nx run db:print-schema
           - pnpm exec nx affected -t codegen --base=origin/main
      5. Does NOT run `make pc` — the agent does that next.

    The GIT_EDITOR and GIT_SEQUENCE_EDITOR env vars are set to "true" to
    suppress editor prompts during automated rebases.

.PARAMETER Branch
    The branch name to rebase (e.g. "LS-1234/my-feature").

.PARAMETER SkipStabilize
    If set, skips the post-rebase stabilization step (install/schema/codegen).
    Useful when you only want to attempt the rebase and handle stabilization
    separately.

.EXAMPLE
    .\scripts\rebase-pr.ps1 -Branch LS-1234/my-feature
    .\scripts\rebase-pr.ps1 LS-1234/my-feature -SkipStabilize
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Branch,

    [switch]$SkipStabilize
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Info { param([string]$msg) Write-Host "  [..] $msg" -ForegroundColor DarkGray }
function Write-Warn { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }

# Locate this script's repo root so we can call sibling scripts
$scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$enterWorktree = Join-Path $scriptsDir "pr-enter-worktree.ps1"

if (-not (Test-Path $enterWorktree)) {
    Write-Error "Cannot find pr-enter-worktree.ps1 at $enterWorktree"
    exit 1
}

# ---------------------------------------------------------------------------
# Step 1: Resolve worktree path
# ---------------------------------------------------------------------------

Write-Step "Resolving worktree for branch '$Branch'..."
$wt = & $enterWorktree -Branch $Branch

if (-not $wt -or -not (Test-Path $wt)) {
    Write-Error "pr-enter-worktree.ps1 returned no valid path: '$wt'"
    exit 1
}
Write-Ok "Worktree: $wt"

# ---------------------------------------------------------------------------
# Step 2: Fetch and rebase
# ---------------------------------------------------------------------------

Write-Step "Fetching from origin..."

Push-Location $wt
try {
    git fetch origin *>&1 | ForEach-Object { Write-Info $_ }
    Write-Ok "Fetch complete."

    # Suppress all interactive editor prompts
    $env:GIT_EDITOR = "true"
    $env:GIT_SEQUENCE_EDITOR = "true"

    Write-Step "Running twig rebase (branch: $Branch)..."
    $rebaseOutput = twig rebase 2>&1
    $rebaseExit = $LASTEXITCODE

    Write-Host $rebaseOutput

    # Detect conflict state from output or git status
    $conflictFiles = @(git diff --name-only --diff-filter=U 2>$null)
    $inRebase = Test-Path (Join-Path (Join-Path $wt ".git") "rebase-merge") -PathType Container
    $inRebase = $inRebase -or (Test-Path (Join-Path (Join-Path $wt ".git") "rebase-apply") -PathType Container)

    if ($conflictFiles.Count -gt 0 -or $inRebase -or $rebaseExit -ne 0) {
        Write-Warn ""
        Write-Warn "CONFLICTS DETECTED - rebase requires manual resolution."
        Write-Warn ""
        if ($conflictFiles.Count -gt 0) {
            Write-Warn "Conflicting files:"
            foreach ($f in $conflictFiles) { Write-Warn "  $f" }
        }
        Write-Warn ""
        Write-Warn "Resolve the conflicts, then run:"
        Write-Warn "  cd $wt"
        Write-Warn ('  git add <resolved-files>')
        Write-Warn "  git rebase --continue"
        Write-Warn "Then re-run this script with -SkipStabilize if rebase was completed."
        exit 1
    }

    Write-Ok "Rebase complete - no conflicts."

    # ---------------------------------------------------------------------------
    # Step 3: Post-rebase stabilization
    # ---------------------------------------------------------------------------

    if ($SkipStabilize) {
        Write-Info "Skipping post-rebase stabilization (-SkipStabilize set)."
        exit 0
    }

    Write-Step "Post-rebase stabilization: make install..."
    # Use cmd /c to respect Makefile cross-platform conventions
    $makeResult = make install 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "make install returned non-zero ($LASTEXITCODE). Check output:"
        Write-Host $makeResult
        # Non-fatal for junctioned worktrees — node_modules may be shared
    } else {
        Write-Ok "make install OK."
    }

    Write-Step "Post-rebase stabilization: db:print-schema..."
    pnpm exec nx run db:print-schema 2>&1 | ForEach-Object { Write-Info $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "db:print-schema failed with exit code $LASTEXITCODE"
        exit 1
    }
    Write-Ok "schema printed."

    Write-Step "Post-rebase stabilization: affected codegen..."
    pnpm exec nx affected -t codegen --base=origin/main 2>&1 | ForEach-Object { Write-Info $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "affected codegen failed with exit code $LASTEXITCODE"
        exit 1
    }
    Write-Ok "codegen done."

    Write-Host ""
    Write-Host "=== Rebase complete for $Branch ===" -ForegroundColor Green
    Write-Host "  Worktree: $wt" -ForegroundColor White
    Write-Host "  Next:     cd $wt ; make pc" -ForegroundColor White

} finally {
    Pop-Location
    Remove-Item Env:GIT_EDITOR -ErrorAction SilentlyContinue
    Remove-Item Env:GIT_SEQUENCE_EDITOR -ErrorAction SilentlyContinue
}
