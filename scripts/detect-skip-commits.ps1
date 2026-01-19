#!/usr/bin/env pwsh
<#!
.SYNOPSIS
    Detects rewritten/duplicate commits that should have been dropped during branch-tree rebases.
.DESCRIPTION
    Scans one or more local branches and reports any commits that appear both in the branch history
    and the configured skip-commit list (for example, hashes captured before a squash/rewrite).
.PARAMETER Branches
    Optional explicit list of branches to scan (comma or whitespace separated).
.PARAMETER BranchPattern
    Glob-style pattern for refs/heads to scan when -Branches is not provided. Defaults to "LS-*".
.PARAMETER SkipCommits
    Comma-separated list of commit hashes to include in the scan.
.PARAMETER SkipCommitsFile
    Path to a file containing commit hashes to skip (one per line, # comments supported).
.PARAMETER IgnoreDefaultSkipFile
    Do not automatically load ./skip-commits.txt from the repo root.
.PARAMETER NoFail
    If set, always exit 0 even when duplicates are found (useful for exploratory runs).
.EXAMPLE
    .\scripts\detect-skip-commits.ps1 -Branches "LS-27/add-matchup-analytics-and-statistics-dashboard"
.EXAMPLE
    .\scripts\detect-skip-commits.ps1 -BranchPattern "LS-2*" -SkipCommitsFile "custom-skips.txt"
#>

param(
    [string[]]$Branches,
    [string]$BranchPattern = "LS-*",
    [string]$SkipCommits,
    [string]$SkipCommitsFile,
    [switch]$IgnoreDefaultSkipFile,
    [switch]$NoFail
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path $scriptDir -Parent

function Load-CommitListFromFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return @()
    }

    $commits = Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            if ($line -match '^([0-9a-f]{7,64})') {
                $matches[1].ToLowerInvariant()
            }
        }
    } | Where-Object { $_ }

    return $commits
}

# Resolve skip commits
$skipCommitList = @()
if ($SkipCommits) {
    $inlineCommits = $SkipCommits -split '[,\s]+' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ }
    $skipCommitList += $inlineCommits
}

if ($SkipCommitsFile) {
    if (-not (Test-Path $SkipCommitsFile)) {
        Write-Host "[X] Skip-commits file not found: $SkipCommitsFile" -ForegroundColor Red
        exit 1
    }
    $skipCommitList += Load-CommitListFromFile -Path $SkipCommitsFile
}
elseif (-not $IgnoreDefaultSkipFile) {
    $defaultFile = Join-Path $repoRoot "skip-commits.txt"
    if (Test-Path $defaultFile) {
        $skipCommitList += Load-CommitListFromFile -Path $defaultFile
    }
}

$skipCommitList = $skipCommitList | Select-Object -Unique
if ($skipCommitList.Count -eq 0) {
    Write-Host "[!] No skip commits configured. Provide -SkipCommits, -SkipCommitsFile, or create skip-commits.txt." -ForegroundColor Yellow
    exit 0
}

Write-Host "[INFO] Loaded $($skipCommitList.Count) skip commits for detection." -ForegroundColor Cyan

function Normalize-Branches {
    param([string[]]$InputBranches)

    $output = @()
    foreach ($value in $InputBranches) {
        if (-not $value) { continue }
        $output += ($value -split '[,\s]+' | Where-Object { $_ })
    }
    return $output | Select-Object -Unique
}

function Get-BranchesMatchingPattern {
    param([string]$Pattern)

    $allBranches = git for-each-ref --format='%(refname:short)' refs/heads 2>$null | Where-Object { $_ }
    if (-not $allBranches) {
        return @()
    }

    return $allBranches | Where-Object { $_ -like $Pattern }
}

$Branches = Normalize-Branches -InputBranches $Branches

if (-not $Branches -or $Branches.Count -eq 0) {
    $branchList = Get-BranchesMatchingPattern -Pattern $BranchPattern
    $Branches = Normalize-Branches -InputBranches $branchList
}

if (-not $Branches -or $Branches.Count -eq 0) {
    Write-Host "[!] No branches matched pattern '$BranchPattern'." -ForegroundColor Yellow
    exit 0
}

Write-Host "[INFO] Scanning $($Branches.Count) branch(es):" -ForegroundColor Cyan
$Branches | ForEach-Object { Write-Host "  • $_" -ForegroundColor DarkGray }

$affectedBranches = @()

foreach ($branch in $Branches) {
    $branch = $branch.Trim()
    if (-not $branch) { continue }

    $revList = git rev-list $branch 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Failed to read commits for $branch" -ForegroundColor Red
        continue
    }

    $normalizedCommits = $revList | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ }
    $commitSet = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($hash in $normalizedCommits) {
        $null = $commitSet.Add($hash)
    }

    $hits = @()
    foreach ($skip in $skipCommitList) {
        $prefix = $skip.ToLowerInvariant()

        if ($commitSet.Contains($prefix)) {
            $hits += [PSCustomObject]@{ Skip = $skip; Actual = $prefix }
            continue
        }

        $match = $normalizedCommits | Where-Object { $_.StartsWith($prefix) } | Select-Object -First 1
        if ($match) {
            $hits += [PSCustomObject]@{ Skip = $skip; Actual = $match }
        }
    }

    if ($hits.Count -gt 0) {
        $affectedBranches += [PSCustomObject]@{
            Branch = $branch
            Commits = $hits
        }

        Write-Host "[!!] Branch '$branch' still contains $($hits.Count) rewritten commit(s):" -ForegroundColor Yellow
        foreach ($hit in $hits) {
            Write-Host "     - Target $($hit.Skip) → actual $($hit.Actual)" -ForegroundColor DarkYellow
        }
    }
    else {
        Write-Host "[OK] Branch '$branch' is clean." -ForegroundColor Green
    }
}

if ($affectedBranches.Count -gt 0) {
    Write-Host "`n[X] Found $($affectedBranches.Count) branch(es) containing commits that should have been dropped." -ForegroundColor Red
    Write-Host "    Next steps: add these hashes to skip-commits (if missing), rerun make rebase-tree, and re-check." -ForegroundColor Red
    if (-not $NoFail) {
        exit 1
    }
} else {
    Write-Host "`n[OK] No branches contain the tracked skip commits." -ForegroundColor Green
}
