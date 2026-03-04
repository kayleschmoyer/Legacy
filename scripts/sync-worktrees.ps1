<#
.SYNOPSIS
  Generates a VS Code multi-root workspace file that includes the main repo
  and selected active git worktrees, with TypeScript-safe settings.

.DESCRIPTION
  AI agents (Copilot, Cursor, etc.) running inside VS Code can only search
  files within the workspace folders. When ticket work happens in a separate
  worktree directory, the agent's search/discovery tools (semantic search,
  file search, grep) cannot reach those files.

  This script creates (or updates) a .code-workspace file that adds selected
  worktrees as additional roots, giving agents full search access while
  preserving TypeScript language features in the main repo.

  TypeScript protection:
  - The main repo gets full language features (IntelliSense, diagnostics, etc.)
  - Worktree folders get SEARCH access but TypeScript project discovery is
    suppressed to prevent duplicate TS projects from consuming memory
  - TS server memory is bumped and watcher exclusions are applied

  The generated file is gitignored -- it is machine-specific.

.PARAMETER Include
  Ticket numbers to include (e.g. 501, 493). Only worktrees matching these
  tickets are added. If omitted and -All is not set, ALL active (non-prunable)
  worktrees are added.

.PARAMETER Add
  Ticket number(s) to add to an EXISTING workspace file. The workspace file
  must already exist (run without -Add first). Merges with existing folders.

.PARAMETER Remove
  Ticket number(s) to remove from an EXISTING workspace file. Removes matching
  folders and rewrites the file.

.PARAMETER All
  Include all active (non-prunable) worktrees. Not recommended with more than
  4-5 worktrees due to memory and performance impact.

.PARAMETER OutputPath
  Path for the generated workspace file. Defaults to legacy-sports.code-workspace
  in the repository root.

.PARAMETER MainRepo
  Path to the main repository. Defaults to the script's parent directory.

.EXAMPLE
  .\scripts\sync-worktrees.ps1 -Include 501,493,498
  # Generates workspace with main + 3 specific worktrees

.EXAMPLE
  .\scripts\sync-worktrees.ps1 -Add 507
  # Adds LS-507 worktree to the existing workspace file

.EXAMPLE
  .\scripts\sync-worktrees.ps1 -Remove 493
  # Removes LS-493 worktree from the existing workspace file

.EXAMPLE
  .\scripts\sync-worktrees.ps1 -All
  # Generates workspace with main + ALL active worktrees (use with caution)

.EXAMPLE
  .\scripts\sync-worktrees.ps1
  # Generates workspace with main + all active worktrees (same as -All)
#>

[CmdletBinding()]
param(
    [string[]]$Include,
    [string[]]$Add,
    [string[]]$Remove,
    [switch]$All,
    [string]$OutputPath,
    [string]$MainRepo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------- Helper: parse ticket strings ----------
# Handles "501,493,498" (single string from Make) or @("501","493") (array)
function Parse-TicketNumbers([string[]]$raw) {
    $numbers = @()
    foreach ($item in $raw) {
        if ($item.ToString() -match ',') {
            $numbers += $item.ToString().Split(',') | ForEach-Object { [int]$_.Trim() }
        }
        else {
            $numbers += [int]$item
        }
    }
    return $numbers
}

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

# ---------- Incremental add/remove mode ----------
# When -Add or -Remove is used, we modify the existing workspace file in place
# rather than rebuilding from scratch.

if ($Add -or $Remove) {
    if (-not (Test-Path $OutputPath)) {
        Write-Host "No workspace file found at: $OutputPath — skipping." -ForegroundColor DarkGray
        Write-Host "  Create one first: .\scripts\sync-worktrees.ps1 -Include <tickets>" -ForegroundColor DarkGray
        exit 0
    }

    $wsRaw = Get-Content $OutputPath -Raw

    # Parse existing folders from the workspace JSON using regex.
    # Each folder line looks like:   { "path": "...", "name": "..." }
    # We avoid ConvertFrom-Json because PS 5.1 mangles glob-pattern keys.
    $folderList = New-Object System.Collections.ArrayList
    $folderMatches = [regex]::Matches($wsRaw, '\{\s*"path"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]+)"\s*\}')
    foreach ($m in $folderMatches) {
        $folderList.Add(@{ path = $m.Groups[1].Value; name = $m.Groups[2].Value }) | Out-Null
    }

    # --- Handle -Remove ---
    if ($Remove) {
        $removeNums = Parse-TicketNumbers $Remove
        foreach ($num in $removeNums) {
            $pattern = "LS-$num"
            $toRemove = @($folderList | Where-Object { $_.name -eq $pattern })
            if ($toRemove.Count -gt 0) {
                foreach ($r in $toRemove) {
                    $folderList.Remove($r) | Out-Null
                }
                Write-Host "  Removed: $pattern" -ForegroundColor Yellow
            }
            else {
                Write-Host "  Not found: $pattern (already absent)" -ForegroundColor DarkGray
            }
        }
    }

    # --- Handle -Add ---
    if ($Add) {
        $addNums = Parse-TicketNumbers $Add

        # We need to resolve worktree paths from git
        Push-Location $MainRepo
        try {
            $porcelain = git worktree list --porcelain 2>&1
        }
        finally {
            Pop-Location
        }

        # Build a lookup of ticket number -> worktree path
        $wtLookup = @{}
        $currentPath = ""
        $currentBranch = ""
        foreach ($line in $porcelain) {
            if ($line -match '^worktree\s+(.+)') {
                $newPath = $Matches[1].Trim()
                # Flush previous entry
                if ($currentPath -and $currentBranch -match '^(LS-(\d+))') {
                    $wtLookup[[int]$Matches[2]] = @{
                        Path  = $currentPath
                        Label = $Matches[1]
                    }
                }
                $currentPath = $newPath
                $currentBranch = ""
            }
            elseif ($line -match '^branch\s+(.+)') {
                $currentBranch = ($Matches[1].Trim()) -replace '^refs/heads/', ''
            }
        }
        # Flush last entry
        if ($currentPath -and $currentBranch -match '^(LS-(\d+))') {
            $wtLookup[[int]$Matches[2]] = @{
                Path  = $currentPath
                Label = $Matches[1]
            }
        }

        foreach ($num in $addNums) {
            $pattern = "LS-$num"
            # Skip if already present
            $existing = @($folderList | Where-Object { $_.name -eq $pattern })
            if ($existing.Count -gt 0) {
                Write-Host "  Already present: $pattern" -ForegroundColor DarkGray
                continue
            }

            if ($wtLookup.ContainsKey($num)) {
                $wt = $wtLookup[$num]
                $folderList.Add(@{
                        path = $wt.Path.Replace('\', '/')
                        name = $wt.Label
                    }) | Out-Null
                Write-Host "  Added: $($wt.Label) -> $($wt.Path)" -ForegroundColor Green
            }
            else {
                Write-Warning "No active worktree found for ticket $num. Create one first: twig worktree create LS-$num/description"
            }
        }
    }

    # Count non-main folders
    $wtCount = ($folderList | Where-Object { $_.name -ne "legacy-sports (main)" }).Count
    if ($wtCount -gt 4) {
        Write-Host ""
        Write-Host "WARNING: $wtCount worktrees included. Consider removing idle ones with -Remove." -ForegroundColor Yellow
    }

    # Rebuild the folders JSON block, preserving the settings section from the existing file
    $foldersJson = @()
    foreach ($f in $folderList) {
        $foldersJson += "    { `"path`": `"$($f.path)`", `"name`": `"$($f.name)`" }"
    }

    # Extract the "settings": { ... } block from the original file.
    # We find the last } in the file (root object close) and take everything
    # from "settings" up to just before it.
    $settingsIdx = $wsRaw.IndexOf('"settings"')
    if ($settingsIdx -ge 0) {
        $lastBrace = $wsRaw.LastIndexOf('}')
        # The last } is the root close. The one before it closes settings.
        $settingsSection = $wsRaw.Substring($settingsIdx, $lastBrace - $settingsIdx).TrimEnd()
        # Ensure it ends with }
        if (-not $settingsSection.EndsWith('}')) {
            $settingsSection = $settingsSection + '}'
        }
    }
    else {
        $settingsSection = '"settings": {}'
    }

    $workspace = @"
{
  "folders": [
$($foldersJson -join ",`n")
  ],
  $settingsSection
}
"@

    $workspace | Set-Content -Path $OutputPath -Encoding UTF8 -NoNewline

    Write-Host ""
    Write-Host "Workspace file updated: $OutputPath" -ForegroundColor Green
    Write-Host "  Worktrees: $wtCount" -ForegroundColor DarkGray
    exit 0
}

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
$skippedCount = 0

# Determine filtering mode
# Handle -Include passed as "501,493,498" string (from Make) or as array
if ($Include -and $Include.Count -gt 0) {
    $ticketNumbers = Parse-TicketNumbers $Include
    $ticketPatterns = @($ticketNumbers | ForEach-Object { "LS-$_" })
    $filterByTicket = $true
    Write-Host "Filtering to tickets: $($ticketPatterns -join ', ')" -ForegroundColor Cyan
} else {
    $filterByTicket = $false
    $ticketPatterns = @()
}

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

    # If filtering by ticket, check if this worktree matches
    if ($filterByTicket) {
        $matched = $false
        foreach ($pattern in $ticketPatterns) {
            if ($label -eq $pattern -or $wt.Branch -like "$pattern*") {
                $matched = $true
                break
            }
        }
        if (-not $matched) {
            $skippedCount++
            continue
        }
    }

    $folders += @{
        path = $wt.Path.Replace('\', '/')
        name = $label
    }
    $activeCount++
    Write-Host "  Adding: $label -> $($wt.Path)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Included worktrees: $activeCount" -ForegroundColor Cyan
if ($skippedCount -gt 0) {
    Write-Host "Filtered out: $skippedCount (use -Include to add specific tickets)" -ForegroundColor DarkGray
}
if ($prunableCount -gt 0) {
    Write-Host "Prunable (skipped): $prunableCount - run 'twig worktree clean' to remove" -ForegroundColor Yellow
}
if ($activeCount -gt 4) {
    Write-Host ""
    Write-Host "WARNING: $activeCount worktrees included. This may cause high memory usage." -ForegroundColor Yellow
    Write-Host "  Consider using -Include to select only the worktrees agents are actively using." -ForegroundColor Yellow
    Write-Host "  Example: .\scripts\sync-worktrees.ps1 -Include 501,493,498" -ForegroundColor Yellow
}

# ---------- Read existing settings ----------

$settingsPath = Join-Path (Join-Path $MainRepo ".vscode") "settings.json"
$settingsRaw = $null
if (Test-Path $settingsPath) {
    $settingsRaw = Get-Content $settingsPath -Raw
    # Strip JSONC line comments only.
    # NOTE: We intentionally do NOT strip block comments (/* ... */) because the
    # regex would also match glob patterns like /**  and **/ inside VS Code settings.
    $settingsRaw = $settingsRaw -replace '(?m)^\s*//.*$', ''
}

# ---------- Build workspace JSON ----------

# We build the JSON manually for full control over structure and readability.
# IMPORTANT: We never round-trip through ConvertFrom-Json/ConvertTo-Json because
# PS 5.1 mangles object keys containing glob patterns (e.g. **/*.log, **/node_modules/**).

# --- Folders section ---
$foldersJson = @()
foreach ($f in $folders) {
    $entry = "    { `"path`": `"$($f.path)`", `"name`": `"$($f.name)`" }"
    $foldersJson += $entry
}

# --- Settings section ---
# Start with base settings from .vscode/settings.json, then overlay TS-protective settings.

# Extract current TS memory setting from raw text (or default)
$tsMemory = 8192
if ($settingsRaw -and $settingsRaw -match '"typescript\.tsserver\.maxTsServerMemory"\s*:\s*(\d+)') {
    $tsMemory = [int]$Matches[1]
}
# Bump TS memory for multi-root (minimum 12GB, or 1.5x existing)
$tsMemoryMultiRoot = [Math]::Max(12288, [int]($tsMemory * 1.5))

# If we have base settings, inject our overrides before the closing brace.
# If not, build a minimal settings object.
if (-not $settingsRaw) {
    $settingsRaw = "{}"
}

$settingsRaw = $settingsRaw.Trim()

# Remove the trailing } so we can append overrides
if ($settingsRaw.EndsWith('}')) {
    $settingsRaw = $settingsRaw.Substring(0, $settingsRaw.Length - 1).TrimEnd()

    # Check if we need a comma after the last property
    $lastChar = $settingsRaw[-1]
    $needsComma = ($lastChar -ne ',' -and $lastChar -ne '{')

    $overrides = @"
$(if ($needsComma) { ',' })
    "// --- Multi-root TS protection (auto-generated by sync-worktrees) ---": null,
    "typescript.tsserver.maxTsServerMemory": $tsMemoryMultiRoot,
    "typescript.tsserver.experimental.enableProjectDiagnostics": false,
    "typescript.preferences.excludeLibrarySymbolsInNavTo": true,
    "typescript.tsserver.watchOptions": {
      "excludeDirectories": ["**/node_modules", "**/dist", "**/.nx", "**/.tamagui"]
    }
  }
"@
    $settingsRaw = $settingsRaw + $overrides
}

$workspace = @"
{
  "folders": [
$($foldersJson -join ",`n")
  ],
  "settings": $settingsRaw
}
"@

# ---------- Write output ----------

$workspace | Set-Content -Path $OutputPath -Encoding UTF8 -NoNewline

Write-Host ""
Write-Host "Workspace file written: $OutputPath" -ForegroundColor Green
Write-Host "  TS server memory: ${tsMemoryMultiRoot}MB (bumped for multi-root)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "To open: code `"$OutputPath`"" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tips:" -ForegroundColor Cyan
Write-Host "  - Only include worktrees agents are actively using" -ForegroundColor DarkGray
Write-Host "  - Re-run when you create or remove worktrees" -ForegroundColor DarkGray
Write-Host "  - Close the workspace when done to reclaim memory" -ForegroundColor DarkGray
