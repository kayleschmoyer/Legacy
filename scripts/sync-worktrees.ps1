<#
.SYNOPSIS
  Generates a VS Code multi-root workspace file that includes the main repo
  and all active git worktrees.

.DESCRIPTION
  AI agents (Copilot, Cursor, etc.) running inside VS Code can only search
  files within the workspace folders. When ticket work happens in a separate
  worktree directory, the agent's search/discovery tools (semantic search,
  file search, grep) cannot reach those files.

  This script creates (or updates) a .code-workspace file that adds every
  active worktree as an additional root, giving agents full search access
  across all worktrees in one VS Code window.

  The generated file is gitignored — it is machine-specific.

.PARAMETER OutputPath
  Path for the generated workspace file. Defaults to legacy-sports.code-workspace
  in the repository root.

.PARAMETER MainRepo
  Path to the main repository. Defaults to the script's grandparent directory.

.EXAMPLE
  .\scripts\sync-worktrees.ps1
  # Generates legacy-sports.code-workspace in repo root

.EXAMPLE
  .\scripts\sync-worktrees.ps1 -OutputPath "my.code-workspace"
#>

[CmdletBinding()]
param(
    [string]$OutputPath,
    [string]$MainRepo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------- Resolve paths ----------

if (-not $MainRepo) {
    # Script lives at <repo>/scripts/sync-worktrees.ps1 — repo root is one level up
    $MainRepo = Split-Path -Parent $PSScriptRoot
    # If running from a worktree, .git is a file (not a directory) pointing to the main repo.
    $gitPath = Join-Path $MainRepo ".git"
    if (Test-Path $gitPath -PathType Leaf) {
        # We're inside a worktree — read the .git file to find the main repo
        $gitFileContent = Get-Content $gitPath -Raw
        if ($gitFileContent -match 'gitdir:\s*(.+)') {
            $gitDir = $Matches[1].Trim()
            # gitdir points to e.g. D:/code/legacy-sports/.git/worktrees/LS-501-...
            # Walk up to the .git directory, then up one more to the repo root
            $mainGitDir = Split-Path (Split-Path $gitDir)
            $MainRepo = Split-Path $mainGitDir
        }
    }
}

if (-not $OutputPath) {
    $OutputPath = Join-Path $MainRepo "legacy-sports.code-workspace"
}

Write-Host "Main repo  : $MainRepo" -ForegroundColor Cyan
Write-Host "Output file: $OutputPath" -ForegroundColor Cyan

# ---------- Parse active worktrees ----------

Push-Location $MainRepo
try {
    $porcelain = git worktree list --porcelain 2>&1
} finally {
    Pop-Location
}

$worktrees = @()
$current = @{}

foreach ($line in $porcelain) {
    if ($line -match '^worktree\s+(.+)') {
        if ($current.Count -gt 0) {
            $worktrees += [PSCustomObject]$current
        }
        $current = @{
            Path     = $Matches[1].Trim()
            Branch   = ""
            Prunable = $false
            IsMain   = $false
        }
    }
    elseif ($line -match '^branch\s+(.+)') {
        $branchRef = $Matches[1].Trim()
        $current.Branch = $branchRef -replace '^refs/heads/', ''
    }
    elseif ($line -match '^prunable') {
        $current.Prunable = $true
    }
}
# Flush last entry
if ($current.Count -gt 0) {
    $worktrees += [PSCustomObject]$current
}

# Normalize paths for comparison
$mainNorm = $MainRepo.Replace('\', '/').TrimEnd('/')

# Mark the main worktree and filter
$folders = @()

# Main repo always first
$folders += @{
    path = "."
    name = "legacy-sports (main)"
}

$activeCount = 0
$prunableCount = 0

foreach ($wt in $worktrees) {
    $wtNorm = $wt.Path.Replace('\', '/').TrimEnd('/')

    # Skip the main repo itself
    if ($wtNorm -eq $mainNorm) { continue }

    # Skip prunable (stale) worktrees
    if ($wt.Prunable) {
        $prunableCount++
        Write-Host "  Skipping prunable: $($wt.Branch) ($($wt.Path))" -ForegroundColor DarkYellow
        continue
    }

    # Extract a short label from the branch name (e.g. "LS-501" from "LS-501/agent-worktree-access")
    $label = $wt.Branch
    if ($label -match '^(LS-\d+)') {
        $label = $Matches[1]
    }

    $folders += @{
        path = $wt.Path.Replace('\', '/')
        name = $label
    }
    $activeCount++
    Write-Host "  Adding: $label -> $($wt.Path)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Active worktrees: $activeCount" -ForegroundColor Cyan
if ($prunableCount -gt 0) {
    Write-Host "Prunable (skipped): $prunableCount - run 'twig worktree clean' to remove" -ForegroundColor Yellow
}

# ---------- Read existing settings ----------

$settingsPath = Join-Path (Join-Path $MainRepo ".vscode") "settings.json"
$settingsRaw = "{}"
if (Test-Path $settingsPath) {
    # Strip JSONC comments, then validate it parses
    $raw = Get-Content $settingsPath -Raw
    # Remove single-line // comments and block /* */ comments
    $stripped = $raw -replace '(?m)^\s*//.*$', '' -replace '/\*[\s\S]*?\*/', ''
    try {
        # Validate JSON by parsing (discard result - we use the stripped text directly)
        $null = $stripped | ConvertFrom-Json
        # Re-indent: the stripped JSON becomes our settings block
        $settingsRaw = $stripped.Trim()
    }
    catch {
        Write-Warning "Could not parse .vscode/settings.json - workspace file will have empty settings."
    }
}

# ---------- Build workspace file ----------

# ConvertTo-Json doesn't guarantee key order, so build the structure manually
# for a clean, readable output.

$foldersJson = @()
foreach ($f in $folders) {
    $entry = "    { `"path`": `"$($f.path)`", `"name`": `"$($f.name)`" }"
    $foldersJson += $entry
}

$settingsJson = $settingsRaw

$workspace = @"
{
  "folders": [
$($foldersJson -join ",`n")
  ],
  "settings": $settingsJson
}
"@

# ---------- Write output ----------

$workspace | Set-Content -Path $OutputPath -Encoding UTF8 -NoNewline

Write-Host ""
Write-Host "Workspace file written: $OutputPath" -ForegroundColor Green
Write-Host ""
Write-Host "To open: code `"$OutputPath`"" -ForegroundColor Cyan
