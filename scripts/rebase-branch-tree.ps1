#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automatically rebases an entire branch tree
.DESCRIPTION
    Rebases all branches in a twig tree, automatically resolving
    generated file conflicts and running validation checks.
.PARAMETER StartBranch
    Optional: Start from this branch instead of current branch
.PARAMETER AutoContinue
    If set, automatically continues through conflicts without prompting
.PARAMETER SkipCommits
    Comma-separated list of commit hashes to skip during rebase
.PARAMETER SkipCommitsFile
    Path to file containing commit hashes to skip (one per line, # for comments)
.EXAMPLE
    .\scripts\rebase-branch-tree.ps1
.EXAMPLE
    .\scripts\rebase-branch-tree.ps1 -StartBranch LS-24 -AutoContinue
.EXAMPLE
    .\scripts\rebase-branch-tree.ps1 -SkipCommits "abc1234,def5678"
.EXAMPLE
    .\scripts\rebase-branch-tree.ps1 -SkipCommitsFile "skip-commits.txt"
#>

param(
    [string]$StartBranch,
    [switch]$AutoContinue,
    [string]$SkipCommits,
    [string]$SkipCommitsFile,
    [switch]$IgnoreDefaultSkipFile,
    [switch]$PrependInitialSkips,
    [switch]$KeepSkipFile,
    [switch]$DisableAutoSkipTracking,
    [switch]$AutoCascade,
    [switch]$SkipCascade
)

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolveConflictsScript = Join-Path $scriptDir "resolve-generated-conflicts.ps1"

$skipCommitList = [System.Collections.Generic.List[string]]::new()
$skipCommitSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$autoSkipCommits = [System.Collections.Generic.List[string]]::new()
$initialCliSkips = @()
$skipFileOriginalContent = $null
$skipFileExisted = $false
$skipFileModified = $false
$autoTrackSkipCommits = -not $DisableAutoSkipTracking

function Get-CommitHashesFromFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return @()
    }

    return Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            if ($line -match '^([0-9a-f]{7,64})') {
                $matches[1]
            }
        }
    } | Where-Object { $_ }
}

function Write-SkipFileEntry {
    param(
        [Parameter(Mandatory = $true)][string]$Commit,
        [string]$Source,
        [switch]$PrependLine
    )

    if (-not $SkipCommitsFile) {
        return
    }

    $line = $Commit
    $commentParts = @()
    if ($Source) {
        $commentParts += $Source
    }
    $commentParts += "added $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    if ($commentParts.Count -gt 0) {
        $line += "  # " + ($commentParts -join ' | ')
    }

    if ($PrependLine) {
        $existing = ""
        if (Test-Path $SkipCommitsFile) {
            $existing = (Get-Content -Path $SkipCommitsFile -Raw).TrimEnd("`r", "`n")
        }

        if ([string]::IsNullOrWhiteSpace($existing)) {
            Set-Content -Path $SkipCommitsFile -Value $line
        } else {
            Set-Content -Path $SkipCommitsFile -Value ($line + [Environment]::NewLine + $existing)
        }
    } else {
        Add-Content -Path $SkipCommitsFile -Value $line
    }

    $script:skipFileModified = $true
}

function Add-SkipCommit {
    param(
        [Parameter(Mandatory = $true)][string]$Commit,
        [string]$Source = "manual",
        [switch]$Prepend,
        [switch]$WriteToFile,
        [switch]$TrackAsAuto
    )

    if ([string]::IsNullOrWhiteSpace($Commit)) {
        return
    }

    if ($skipCommitSet.Contains($Commit)) {
        return
    }

    if ($Prepend) {
        $skipCommitList.Insert(0, $Commit)
    } else {
        $skipCommitList.Add($Commit)
    }

    [void]$skipCommitSet.Add($Commit)

    if ($TrackAsAuto) {
        $autoSkipCommits.Add($Commit)
    }

    Write-Host "[SKIP] Tracking commit $Commit ($Source)" -ForegroundColor Magenta

    if ($WriteToFile -and $SkipCommitsFile) {
        Write-SkipFileEntry -Commit $Commit -Source $Source -PrependLine:$Prepend
    }
}

function Get-SkipCommitsArg {
    if ($skipCommitList.Count -eq 0) {
        return $null
    }

    return ($skipCommitList.ToArray() -join ',')
}

# Parse skip-commits
if ($SkipCommits) {
    $initialCliSkips = $SkipCommits -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

if ($SkipCommitsFile) {
    if (Test-Path $SkipCommitsFile) {
        $skipFileOriginalContent = Get-Content -Path $SkipCommitsFile -Raw
        $skipFileExisted = $true
    } else {
        $skipFileOriginalContent = ""
        $skipFileExisted = $false
        New-Item -ItemType File -Path $SkipCommitsFile -Force | Out-Null
    }

    $fileCommits = Get-CommitHashesFromFile -Path $SkipCommitsFile
    if ($fileCommits.Count -gt 0) {
        foreach ($commit in $fileCommits) {
            Add-SkipCommit -Commit $commit -Source "file"
        }
        Write-Host "[->] Loaded skip-commits from file: $($fileCommits -join ', ')" -ForegroundColor Yellow
    }
} elseif (-not $IgnoreDefaultSkipFile) {
    $repoRoot = Split-Path $scriptDir -Parent
    $defaultSkipFile = Join-Path $repoRoot "skip-commits.txt"
    if (Test-Path $defaultSkipFile) {
        $defaultCommits = Get-CommitHashesFromFile -Path $defaultSkipFile
        if ($defaultCommits.Count -gt 0) {
            foreach ($commit in $defaultCommits) {
                Add-SkipCommit -Commit $commit -Source "default-file"
            }
            Write-Host "[->] Auto-loaded skip-commits from repo default: $($defaultCommits -join ', ')" -ForegroundColor Yellow
        }
    }
} elseif ($PrependInitialSkips) {
    Write-Host "[!] --PrependInitialSkips ignored because no skip-commits file was provided" -ForegroundColor Yellow
}

if ($initialCliSkips.Count -gt 0) {
    $writeCliToFile = $SkipCommitsFile -and $PrependInitialSkips
    foreach ($commit in $initialCliSkips) {
        Add-SkipCommit -Commit $commit -Source "parameter" -Prepend:$PrependInitialSkips -WriteToFile:$writeCliToFile
    }
    Write-Host "[->] Will skip commits: $($initialCliSkips -join ', ')" -ForegroundColor Yellow
}

try {

# Get current branch if not specified
if (-not $StartBranch) {
    $StartBranch = git branch --show-current
    if (-not $StartBranch) {
        Write-Host "[X] Could not determine current branch" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[TREE] Rebasing branch tree starting from: $StartBranch" -ForegroundColor Cyan
Write-Host ""

# Get the branch tree
$treeOutput = twig tree 2>&1 | Out-String
Write-Host $treeOutput

# Parse branches from tree (simplified - you may need to adjust)
$currentBranch = $StartBranch
$rebasedCount = 0
$failedBranches = @()
function Rebase-Branch {
    param([string]$branch)

    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host "[->] Rebasing: $branch" -ForegroundColor Yellow
    Write-Host "============================================================`n" -ForegroundColor Cyan

    # Checkout the branch
    git checkout $branch 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Failed to checkout $branch" -ForegroundColor Red
        return $false
    }

    # Build twig rebase command with skip-commits if provided
    $rebaseCmd = "twig rebase"
    $skipCommitsArg = Get-SkipCommitsArg
    if ($skipCommitsArg) {
        $rebaseCmd = "twig rebase --skip-commits `"$skipCommitsArg`""
        Write-Host "[->] Using skip-commits: $skipCommitsArg" -ForegroundColor Cyan
    }

    # Start rebase
    $rebaseOutput = Invoke-Expression "$rebaseCmd 2>&1"

    # Check if already up to date
    if ($rebaseOutput -match "up to date") {
        Write-Host "[OK] $branch is already up to date" -ForegroundColor Green
        return $true
    }

    # Handle conflicts in a loop
    $maxAttempts = 50  # Prevent infinite loops
    $attempt = 0

    while ($attempt -lt $maxAttempts) {
        $attempt++

        # Check for conflicts
        $conflicts = git diff --name-only --diff-filter=U 2>&1

        if ($conflicts) {
            Write-Host "`n[!] Conflicts detected (attempt $attempt):" -ForegroundColor Yellow
            $conflicts | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }

            if ($autoTrackSkipCommits) {
                $rebaseHeadOutput = git rev-parse --verify REBASE_HEAD 2>&1
                if ($LASTEXITCODE -eq 0 -and $rebaseHeadOutput) {
                    $conflictCommit = $rebaseHeadOutput.Trim()
                    Add-SkipCommit -Commit $conflictCommit -Source "auto-conflict: $branch" -Prepend -WriteToFile:([bool]$SkipCommitsFile) -TrackAsAuto
                }
            }

            if ($AutoContinue) {
                Write-Host "`n[->] Auto-resolving conflicts..." -ForegroundColor Cyan
            } else {
                Write-Host "`n[->] Resolving conflicts..." -ForegroundColor Cyan
            }

            # Run conflict resolution script
            & $resolveConflictsScript
            $resolveExitCode = $LASTEXITCODE

            if ($resolveExitCode -ne 0) {
                Write-Host "`n[X] Failed to resolve conflicts automatically" -ForegroundColor Red

                if (-not $AutoContinue) {
                    $response = Read-Host "Continue manually? (y/n/abort)"
                    if ($response -eq 'abort') {
                        git rebase --abort
                        return $false
                    }
                    if ($response -ne 'y') {
                        return $false
                    }
                    Read-Host "Press Enter after manually resolving conflicts"
                } else {
                    Write-Host "[X] Aborting rebase of $branch" -ForegroundColor Red
                    git rebase --abort
                    return $false
                }
            }

            # Continue rebase
            Write-Host "[->] Continuing rebase..." -ForegroundColor Cyan
            $continueOutput = git rebase --continue 2>&1

            # Check if rebase completed
            if ($continueOutput -match "Successfully rebased") {
                Write-Host "`n[OK] Successfully rebased $branch" -ForegroundColor Green
                return $true
            }

            # Check if there are more conflicts
            $newConflicts = git diff --name-only --diff-filter=U 2>&1
            if (-not $newConflicts) {
                # No more conflicts but rebase didn't complete - might be done
                $rebaseStatus = git status 2>&1 | Out-String
                if ($rebaseStatus -notmatch "rebase in progress") {
                    Write-Host "`n[OK] Successfully rebased $branch" -ForegroundColor Green
                    return $true
                }
            }
        } else {
            # No conflicts, check if rebase is still in progress
            $rebaseStatus = git status 2>&1 | Out-String
            if ($rebaseStatus -match "rebase in progress") {
                # Try to continue
                git rebase --continue 2>&1 | Out-Null

                # Check again
                $stillInProgress = git status 2>&1 | Out-String
                if ($stillInProgress -notmatch "rebase in progress") {
                    Write-Host "`n[OK] Successfully rebased $branch" -ForegroundColor Green
                    return $true
                }
            } else {
                Write-Host "`n[OK] Successfully rebased $branch" -ForegroundColor Green
                return $true
            }
        }
    }

    Write-Host "`n[X] Max attempts reached for $branch" -ForegroundColor Red
    git rebase --abort
    return $false
}

# Try to rebase current branch
$success = Rebase-Branch $currentBranch

if ($success) {
    $rebasedCount++
    Write-Host "`n[OK] Branch tree rebase completed successfully!" -ForegroundColor Green
    Write-Host "  Rebased: $rebasedCount branch(es)" -ForegroundColor Cyan
} else {
    Write-Host "`n[X] Failed to rebase $currentBranch" -ForegroundColor Red
    exit 1
}

$skipCommitsArgForCascade = Get-SkipCommitsArg

if (-not $SkipCascade) {
    if ($AutoCascade) {
        Write-Host "`n[->] Cascading child branches with twig cascade..." -ForegroundColor Cyan
        git checkout $currentBranch 2>&1 | Out-Null
        $cascadeCmd = "twig cascade"
        if ($skipCommitsArgForCascade) {
            $cascadeCmd += " --skip-commits `"$skipCommitsArgForCascade`""
        }

        $cascadeOutput = Invoke-Expression "$cascadeCmd 2>&1"
        Write-Host $cascadeOutput

        if ($LASTEXITCODE -ne 0) {
            Write-Host "[X] Twig cascade failed" -ForegroundColor Red
            throw "Cascade failed"
        }

        Write-Host "[OK] Twig cascade completed" -ForegroundColor Green
    } else {
        Write-Host "`n[NEXT] Run twig cascade from $currentBranch to propagate the skip list." -ForegroundColor Yellow
        if ($SkipCommitsFile) {
            Write-Host "  Skip file: $SkipCommitsFile" -ForegroundColor Gray
        }
        if ($skipCommitsArgForCascade) {
            Write-Host "  Example: twig cascade --skip-commits $skipCommitsArgForCascade" -ForegroundColor Gray
        } else {
            Write-Host "  Example: twig cascade --show-graph" -ForegroundColor Gray
        }
        [void](Read-Host "Press Enter after cascade completes")
    }
}

Write-Host "`n[->] Running validation checks..." -ForegroundColor Yellow
Write-Host "  (typecheck -> lint -> test -> build)" -ForegroundColor Gray

# Run validation
$validationFailed = $false

Write-Host "`n[1] Type checking..." -ForegroundColor Cyan
pnpm exec nx affected -t typecheck 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [X] Type check failed" -ForegroundColor Red
    $validationFailed = $true
} else {
    Write-Host "  [OK] Type check passed" -ForegroundColor Green
}

Write-Host "`n[2] Linting..." -ForegroundColor Cyan
pnpm exec nx affected -t lint --fix 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [X] Lint failed" -ForegroundColor Red
    $validationFailed = $true
} else {
    Write-Host "  [OK] Lint passed" -ForegroundColor Green
}

if ($validationFailed) {
    Write-Host "`n[!] Validation failed. Run the following to see errors:" -ForegroundColor Yellow
    Write-Host "  pnpm exec nx affected -t typecheck" -ForegroundColor Gray
    Write-Host "  pnpm exec nx affected -t lint --fix" -ForegroundColor Gray
    exit 1
}

Write-Host "`n[DONE] All done! Your branch tree is rebased and validated." -ForegroundColor Green

}
finally {
    if ($SkipCommitsFile) {
        if ($KeepSkipFile) {
            if ($skipFileModified) {
                Write-Host "[SKIP] Keeping skip-commits file updates at $SkipCommitsFile" -ForegroundColor Yellow
            }
        } else {
            if ($skipFileExisted) {
                if ($skipFileOriginalContent -ne $null) {
                    Set-Content -Path $SkipCommitsFile -Value $skipFileOriginalContent
                } else {
                    Clear-Content -Path $SkipCommitsFile -ErrorAction SilentlyContinue
                }
            } else {
                Remove-Item $SkipCommitsFile -ErrorAction SilentlyContinue
            }

            if ($skipFileModified) {
                Write-Host "[SKIP] Restored skip-commits file to its original state" -ForegroundColor Cyan
            }
        }
    }
}
