# pnpm-install-lock.ps1 -- Mutex-wrapped pnpm install
#
# Acquires an exclusive file lock before running pnpm install so that multiple
# agents / worktrees can never mutate the shared node_modules simultaneously.
#
# Usage:
#   .\scripts\pnpm-install-lock.ps1                                      # pnpm install --frozen-lockfile
#   .\scripts\pnpm-install-lock.ps1 -InstallArgs "--frozen-lockfile"     # explicit args
#   .\scripts\pnpm-install-lock.ps1 -InstallArgs "add -w lodash"         # pnpm add
#   .\scripts\pnpm-install-lock.ps1 -ForceClean                           # force-clean then install
#
# The lock file (.pnpm-install.lock) lives in the main repo root and is
# shared by all worktrees. It is gitignored.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$InstallArgs = "--frozen-lockfile",

    [Parameter()]
    [switch]$ForceClean,

    [Parameter()]
    [string]$RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Resolve repo root
# ---------------------------------------------------------------------------

if (-not $RepoRoot) {
    # Try git common dir (works from any worktree)
    $gitCommonDir = $null
    try { $gitCommonDir = (git rev-parse --git-common-dir 2>$null) } catch {}
    if ($gitCommonDir) {
        $resolved = Resolve-Path (Join-Path (Get-Location) $gitCommonDir) -ErrorAction SilentlyContinue
        if ($resolved) {
            $RepoRoot = (Split-Path $resolved.Path -Parent)
        }
    }
    if (-not $RepoRoot) {
        $RepoRoot = Split-Path -Parent $PSScriptRoot
    }
}

# ---------------------------------------------------------------------------
# Lock helpers
# ---------------------------------------------------------------------------

$lockPath   = Join-Path $RepoRoot ".pnpm-install.lock"
$lockStream = $null

function Enter-InstallLock {
    $maxWait = 300  # seconds -- installs can be slow
    $waited  = 0
    while ($true) {
        try {
            $script:lockStream = [System.IO.File]::Open(
                $lockPath,
                [System.IO.FileMode]::OpenOrCreate,
                [System.IO.FileAccess]::ReadWrite,
                [System.IO.FileShare]::None
            )
            $writer = [System.IO.StreamWriter]::new($script:lockStream)
            $writer.Write("PID=$PID cwd=$(Get-Location) at $(Get-Date -Format o)")
            $writer.Flush()
            return
        }
        catch {
            if ($waited -ge $maxWait) {
                Write-Host "  [!!] Timed out waiting for pnpm install lock after ${maxWait}s. Proceeding without lock." -ForegroundColor Yellow
                return
            }
            if ($waited -eq 0) {
                $holder = ""
                try { $holder = " ($(Get-Content $lockPath -Raw -ErrorAction SilentlyContinue))" } catch {}
                Write-Host "  [..] Another pnpm install is running${holder} -- waiting for lock..." -ForegroundColor Yellow
            }
            Start-Sleep -Seconds 2
            $waited += 2
        }
    }
}

function Exit-InstallLock {
    if ($script:lockStream) {
        $script:lockStream.Close()
        $script:lockStream = $null
        Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Junction guard — refuse to run if node_modules is a junction
# ---------------------------------------------------------------------------
# When a worktree's node_modules is junctioned to the main repo, running
# pnpm install here MUTATES the shared directory and breaks every other
# junctioned worktree simultaneously. Detect this and abort with clear
# instructions instead of silently corrupting the shared state.

$nmPath = Join-Path (Get-Location) "node_modules"
if (Test-Path $nmPath) {
    $nmItem = Get-Item $nmPath -Force
    if (($nmItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        $target = $nmItem.Target
        Write-Host ""
        Write-Host "  ============================================================" -ForegroundColor Red
        Write-Host "  BLOCKED: node_modules is a junction -> $target" -ForegroundColor Red
        Write-Host "  ============================================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Running pnpm install here would mutate the SHARED node_modules" -ForegroundColor Yellow
        Write-Host "  and break every other worktree using the same junction." -ForegroundColor Yellow
        Write-Host ""
        $mainRepo = Split-Path $target
        Write-Host "  What to do instead:" -ForegroundColor Cyan
        Write-Host "    - If node_modules is healthy: do nothing, the junction is working." -ForegroundColor White
        Write-Host "    - If node_modules is broken: run 'make install' in the MAIN REPO" -ForegroundColor White
        Write-Host "      ($mainRepo) -- all junctioned worktrees share it." -ForegroundColor White
        Write-Host "    - If this worktree needs different deps (lockfile diverged):" -ForegroundColor White
        Write-Host "      1. Remove junction:  cmd /c `"rmdir node_modules`"" -ForegroundColor White
        Write-Host "      2. Install fresh:    make install" -ForegroundColor White
        Write-Host ""
        exit 1
    }
}

# ---------------------------------------------------------------------------
# Main-repo guard — refuse if worktrees have junctions to this node_modules
# ---------------------------------------------------------------------------
# When running from the main repo (not a worktree), check if any worktrees
# have junctions pointing to THIS node_modules. Installing here would
# silently mutate the shared directory and break those worktrees.

if (Test-Path $nmPath) {
    $wtDirs = @()
    try {
        $wtDirs = @(git worktree list --porcelain 2>$null |
            Select-String '^worktree ' |
            ForEach-Object { ($_ -replace '^worktree ','').Trim() } |
            Where-Object { $_ -ne (Get-Location).Path })
    } catch {}

    $junctions = @()
    $thisNmResolved = (Resolve-Path $nmPath -ErrorAction SilentlyContinue).Path
    foreach ($wt in $wtDirs) {
        $wtNM = Join-Path $wt 'node_modules'
        $wi = Get-Item $wtNM -Force -ErrorAction SilentlyContinue
        if ($wi -and (($wi.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
            $wtTarget = $null
            try { $wtTarget = (Resolve-Path $wi.Target -ErrorAction SilentlyContinue).Path } catch {}
            if ($wtTarget -eq $thisNmResolved) {
                $junctions += $wt
            }
        }
    }

    if ($junctions.Count -gt 0) {
        Write-Host ""
        Write-Host "  ============================================================" -ForegroundColor Red
        Write-Host "  BLOCKED: worktrees have junctions to this node_modules" -ForegroundColor Red
        Write-Host "  ============================================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Running pnpm install here would silently mutate the shared" -ForegroundColor Yellow
        Write-Host "  node_modules and break these junctioned worktrees:" -ForegroundColor Yellow
        foreach ($j in $junctions) {
            Write-Host "    - $j" -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Host "  What to do instead:" -ForegroundColor Cyan
        Write-Host "    - Clean up idle worktrees first:  twig worktree clean" -ForegroundColor White
        Write-Host "    - Or remove their junctions:  cd <worktree> && cmd /c `"rmdir node_modules`"" -ForegroundColor White
        Write-Host ""
        exit 1
    }
}

Enter-InstallLock
try {
    if ($ForceClean) {
        $forceScript = Join-Path $PSScriptRoot "force-clean-node-modules.ps1"
        if (Test-Path $forceScript) {
            & $forceScript
        }
        else {
            Write-Host "  [!!] force-clean-node-modules.ps1 not found, skipping clean" -ForegroundColor Yellow
        }
    }

    Write-Host "> pnpm install $InstallArgs" -ForegroundColor Cyan
    # Split args string and invoke pnpm -- supports multi-word args like "add -w lodash"
    $argList = $InstallArgs -split '\s+'
    & pnpm install @argList
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        exit $exitCode
    }
}
finally {
    Exit-InstallLock
}
