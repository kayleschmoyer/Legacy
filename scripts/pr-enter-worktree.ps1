#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Enter (or create) a git worktree for a branch, then print the worktree path.

.DESCRIPTION
    Given a branch name, this script:
      1. Lists existing worktrees (via twig) and checks if one already exists.
      2. If it exists, prints the path and exits.
      3. If it does not exist, creates it via `twig worktree create <branch>`.
      4. Runs `make wt-setup` to symlink node_modules, copy .env, and set up .twig.
      5. Prints the worktree path to stdout (last non-empty line) so callers can
         capture it with: $wt = .\scripts\pr-enter-worktree.ps1 -Branch <branch>

    The printed path is the absolute Windows path to the worktree directory.
    All diagnostic output is written to the host (not stdout) to avoid polluting
    the captured path.

.PARAMETER Branch
    The branch name to find or create a worktree for.  May use either slash form
    (LS-1234/my-feature) or dash form (LS-1234-my-feature) — twig normalises them.

.EXAMPLE
    # Capture path for use in subsequent commands:
    $wt = .\scripts\pr-enter-worktree.ps1 -Branch LS-1234/my-feature
    Set-Location $wt

    # Or just verify/create without capturing:
    .\scripts\pr-enter-worktree.ps1 -Branch LS-1234/my-feature
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Branch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers — write-host so they don't pollute the captured stdout path
# ---------------------------------------------------------------------------

function Write-Step { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Info { param([string]$msg) Write-Host "  [..] $msg" -ForegroundColor DarkGray }

# Locate main repo root — if running from a worktree, resolve via the .git
# file's gitdir: pointer (git rev-parse --show-toplevel returns the worktree
# root, not the main repo).
$scriptDir = $PSScriptRoot
$gitPath = Join-Path (Join-Path $scriptDir "..") ".git"
$gitPath = (Resolve-Path $gitPath -ErrorAction SilentlyContinue).Path

$mainRepo = $null

if ($gitPath -and (Test-Path $gitPath) -and -not (Test-Path $gitPath -PathType Container)) {
    # .git is a file (worktree) — parse "gitdir: …" to find main repo
    $gitdirLine = Get-Content $gitPath -First 1
    if ($gitdirLine -match '^gitdir:\s*(.+)$') {
        $worktreeGitDir = $Matches[1].Trim()
        # worktreeGitDir is like <main>/.git/worktrees/<name>
        $mainRepo = (Resolve-Path (Join-Path (Join-Path (Join-Path $worktreeGitDir "..") "..") "..")).Path
    }
}

if (-not $mainRepo) {
    $mainRepo = git -C $PSScriptRoot rev-parse --show-toplevel 2>$null
}
if (-not $mainRepo) {
    $mainRepo = git rev-parse --show-toplevel 2>$null
}
$mainRepo = $mainRepo -replace '/', '\'

# ---------------------------------------------------------------------------
# Step 1: Check if worktree already exists
# ---------------------------------------------------------------------------

Write-Step "Looking up worktree for branch '$Branch'..."

# twig worktree list output format:
#   Branch: LS-1234/my-feature
#   Path: D:/code/legacy-sports-worktrees/LS-1234-my-feature
#
# We need to find the Path line that follows the matching Branch line.
$twigOutput = twig worktree list 2>&1
$lines = @($twigOutput -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })

# Normalise branch name for comparison: convert slashes to dashes, lowercase
function Normalise-Branch { param([string]$b) return ($b -replace '/', '-').ToLowerInvariant() }

$normTarget = Normalise-Branch $Branch
$wtPath = $null

for ($i = 0; $i -lt $lines.Count - 1; $i++) {
    if ($lines[$i] -match '^Branch:\s*(.+)$') {
        $branchVal = $Matches[1].Trim()
        if ((Normalise-Branch $branchVal) -eq $normTarget) {
            # Next non-empty line should be the Path
            if ($lines[$i + 1] -match '^Path:\s*(.+)$') {
                $wtPath = ($Matches[1].Trim()) -replace '/', '\'
            }
            break
        }
    }
}

if ($wtPath) {
    Write-Ok "Worktree exists at: $wtPath"

    # Verify the node_modules symlink is intact
    $nmPath = Join-Path $wtPath "node_modules"
    if (-not (Test-Path $nmPath)) {
        Write-Step "node_modules missing - running wt-setup..."
        Push-Location $mainRepo
        make wt-setup WT=$wtPath *>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Error "make wt-setup failed with exit code $LASTEXITCODE"
            Pop-Location
            exit 1
        }
        Pop-Location
    }

    # Emit the path to stdout (captured by caller)
    Write-Output $wtPath
    exit 0
}

# ---------------------------------------------------------------------------
# Step 2: Create worktree
# ---------------------------------------------------------------------------

Write-Step "Worktree not found - creating via twig..."

Push-Location $mainRepo

twig worktree create $Branch *>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
    Write-Error "twig worktree create failed with exit code $LASTEXITCODE"
    Pop-Location
    exit 1
}

# Re-read the list to get the new path
$twigOutput2 = twig worktree list 2>&1
$lines2 = @($twigOutput2 -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })

for ($i = 0; $i -lt $lines2.Count - 1; $i++) {
    if ($lines2[$i] -match '^Branch:\s*(.+)$') {
        $branchVal = $Matches[1].Trim()
        if ((Normalise-Branch $branchVal) -eq $normTarget) {
            if ($lines2[$i + 1] -match '^Path:\s*(.+)$') {
                $wtPath = ($Matches[1].Trim()) -replace '/', '\'
            }
            break
        }
    }
}

if (-not $wtPath) {
    Write-Error "twig created the worktree but could not determine its path. Run 'twig worktree list' manually."
    Pop-Location
    exit 1
}

Write-Ok "Worktree created at: $wtPath"

# ---------------------------------------------------------------------------
# Step 3: Run wt-setup (symlink node_modules, copy .env, .twig)
# ---------------------------------------------------------------------------

Write-Step "Running wt-setup..."
make wt-setup WT=$wtPath *>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
    Write-Error "make wt-setup failed with exit code $LASTEXITCODE"
    Pop-Location
    exit 1
}

Pop-Location

Write-Ok "Worktree ready."

# Emit the path to stdout (captured by caller)
Write-Output $wtPath
