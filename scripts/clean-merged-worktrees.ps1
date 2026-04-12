#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Detect worktrees whose PRs have been merged and clean them up via twig.
.DESCRIPTION
    Lists all git worktrees, checks if their branch has a merged PR on GitHub,
    and cleans up merged worktrees using `twig worktree clean`.
    NEVER uses `git worktree remove` directly — always goes through twig to
    preserve symlinks.
.PARAMETER DryRun
    Show what would be cleaned without actually cleaning.
.EXAMPLE
    .\scripts\clean-merged-worktrees.ps1
    Cleans all worktrees whose PRs have been merged.
.EXAMPLE
    .\scripts\clean-merged-worktrees.ps1 -DryRun
    Shows which worktrees would be cleaned (no changes made).
#>

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Ensure twig is available
if (-not (Get-Command twig -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: twig is not installed. Install it with: cargo install twig-cli" -ForegroundColor Red
    exit 1
}

# Ensure gh CLI is available
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: gh CLI is not installed. Install it from https://cli.github.com/" -ForegroundColor Red
    exit 1
}

# Ensure gh CLI is authenticated and can access the current repository
$ghAuthCheck = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: gh CLI is not authenticated or cannot access the current repository. Run 'gh auth login' and try again." -ForegroundColor Red
    exit 1
}

# Get the main repo root
$commonDir = git rev-parse --git-common-dir
if ($commonDir -eq ".git") {
    $mainRepo = (Get-Location).Path
} else {
    $mainRepo = (Resolve-Path (Split-Path $commonDir -Parent)).Path
}

$cleaned = 0
$skipped = 0

# Remove all known symlinks from a worktree directory before cleanup.
# Returns $true if all symlinks were removed (or didn't exist), $false if any
# symlink could not be removed (twig cleanup should be skipped to avoid data loss).
function Remove-WorktreeLinks {
    param([string]$WorktreePath)
    $allRemoved = $true
    foreach ($linkName in @('node_modules', '.twig', 'certs', '.github\skills')) {
        $jPath = Join-Path $WorktreePath $linkName
        $jItem = Get-Item $jPath -Force -ErrorAction SilentlyContinue
        if ($jItem -and ($jItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            cmd /c "rmdir `"$jPath`"" 2>$null | Out-Null
            $stillExists = Get-Item $jPath -Force -ErrorAction SilentlyContinue
            if ($stillExists -and ($stillExists.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                Write-Host "          WARNING: Failed to remove symlink '$linkName' — skipping twig cleanup to avoid data loss." -ForegroundColor Red
                $allRemoved = $false
                break
            }
            Write-Host "          Removed symlink: $linkName" -ForegroundColor Gray
        }
    }
    return $allRemoved
}

Write-Host ""
Write-Host "=== Merged Worktree Cleanup ===" -ForegroundColor Cyan
Write-Host "Scanning worktrees for merged PRs..."
Write-Host ""

# Parse worktree list in porcelain format
$porcelainOutput = git worktree list --porcelain
$currentPath = ""
$currentBranch = ""

foreach ($line in $porcelainOutput) {
    if ($line -match "^worktree (.+)$") {
        $currentPath = $Matches[1]
        $currentBranch = ""
    }
    elseif ($line -match "^branch refs/heads/(.+)$") {
        $currentBranch = $Matches[1]
    }
    elseif ($line -eq "" -or $line -eq $null) {
        # End of a worktree entry — process it
        if (-not $currentBranch -or -not $currentPath) {
            $currentPath = ""
            $currentBranch = ""
            continue
        }

        # Skip the main repo worktree
        try {
            $normalizedPath = (Resolve-Path $currentPath -ErrorAction Stop).Path
            $normalizedMain = (Resolve-Path $mainRepo -ErrorAction Stop).Path
            if ($normalizedPath -eq $normalizedMain) {
                $currentPath = ""
                $currentBranch = ""
                continue
            }
        } catch {
            # Path doesn't exist — skip
            $currentPath = ""
            $currentBranch = ""
            continue
        }

        # Skip non-ticket branches
        if ($currentBranch -notmatch "^LS-\d+") {
            $currentPath = ""
            $currentBranch = ""
            continue
        }

        # Check if there is a merged PR for this branch
        $mergedPr = $null
        try {
            $prJson = gh pr list --head $currentBranch --state merged --json number --jq '.[0].number // empty' 2>$null
            if ($prJson -and $prJson -match "^\d+$") {
                $mergedPr = $prJson.Trim()
            }
        } catch {
            Write-Host "  WARNING: Failed to check PR status for $currentBranch — skipping." -ForegroundColor DarkYellow
        }

        if ($mergedPr) {
            Write-Host "  MERGED: $currentBranch (PR #$mergedPr)" -ForegroundColor Yellow
            Write-Host "          Worktree: $currentPath" -ForegroundColor Gray

            if ($DryRun) {
                Write-Host "          [dry-run] Would clean via twig" -ForegroundColor DarkYellow
                $cleaned++
            } else {
                # Remove symlinks BEFORE twig runs. On Windows, git (which twig calls
                # internally) follows NTFS links during recursive directory deletion,
                # wiping the symlink target (e.g. the main repo's node_modules).
                # cmd /c rmdir (non-recursive) removes the symlink without touching
                # the target. It fails harmlessly on non-empty real directories.
                $linkRemovalFailed = -not (Remove-WorktreeLinks $currentPath)

                if ($linkRemovalFailed) {
                    $skipped++
                    Write-Host ""
                    continue
                }

                Write-Host "          Cleaning via twig..." -ForegroundColor Gray
                try {
                    Push-Location $mainRepo
                    twig worktree clean --path $currentPath 2>&1 | ForEach-Object { Write-Host "          $_" -ForegroundColor Gray }
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "          Cleaned successfully." -ForegroundColor Green
                        $cleaned++
                    } else {
                        Write-Host "          WARNING: twig worktree clean failed. Skipping." -ForegroundColor Red
                        $skipped++
                    }
                } catch {
                    Write-Host "          WARNING: twig worktree clean failed: $_" -ForegroundColor Red
                    $skipped++
                } finally {
                    Pop-Location
                }
            }
            Write-Host ""
        }

        $currentPath = ""
        $currentBranch = ""
    }
}

# Process last entry (porcelain output may not end with blank line)
if ($currentBranch -and $currentPath) {
    # Skip main repo
    $skip = $false
    try {
        $normalizedPath = (Resolve-Path $currentPath -ErrorAction Stop).Path
        $normalizedMain = (Resolve-Path $mainRepo -ErrorAction Stop).Path
        if ($normalizedPath -eq $normalizedMain) { $skip = $true }
    } catch { $skip = $true }

    if (-not $skip -and $currentBranch -match "^LS-\d+") {
        $mergedPr = $null
        try {
            $prJson = gh pr list --head $currentBranch --state merged --json number --jq '.[0].number // empty' 2>$null
            if ($prJson -and $prJson -match "^\d+$") { $mergedPr = $prJson.Trim() }
        } catch {
            Write-Host "  WARNING: Failed to check PR status for $currentBranch — skipping." -ForegroundColor DarkYellow
        }

        if ($mergedPr) {
            Write-Host "  MERGED: $currentBranch (PR #$mergedPr)" -ForegroundColor Yellow
            Write-Host "          Worktree: $currentPath" -ForegroundColor Gray
            if ($DryRun) {
                Write-Host "          [dry-run] Would clean via twig" -ForegroundColor DarkYellow
                $cleaned++
            } else {
                # Remove symlinks BEFORE twig runs (see main loop for rationale).
                $linkRemovalFailed = -not (Remove-WorktreeLinks $currentPath)

                if (-not $linkRemovalFailed) {
                    Write-Host "          Cleaning via twig..." -ForegroundColor Gray
                    try {
                        Push-Location $mainRepo
                        twig worktree clean --path $currentPath 2>&1 | ForEach-Object { Write-Host "          $_" -ForegroundColor Gray }
                        if ($LASTEXITCODE -eq 0) {
                            Write-Host "          Cleaned successfully." -ForegroundColor Green
                            $cleaned++
                        } else {
                            Write-Host "          WARNING: twig worktree clean failed. Skipping." -ForegroundColor Red
                            $skipped++
                        }
                    } catch {
                        Write-Host "          WARNING: twig worktree clean failed: $_" -ForegroundColor Red
                        $skipped++
                    } finally {
                        Pop-Location
                    }
                } else {
                    $skipped++
                }
            }
            Write-Host ""
        }
    }
}

Write-Host "=== Summary ===" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "  Would clean: $cleaned worktree(s)" -ForegroundColor Yellow
    Write-Host "  Run without -DryRun to actually clean them."
} else {
    Write-Host "  Cleaned: $cleaned worktree(s)" -ForegroundColor Green
    if ($skipped -gt 0) {
        Write-Host "  Skipped (errors): $skipped worktree(s)" -ForegroundColor Red
    }
}
Write-Host ""
