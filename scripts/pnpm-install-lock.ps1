# pnpm-install-lock.ps1 -- Mutex-wrapped pnpm install
#
# Acquires an exclusive file lock before running pnpm install so that multiple
# agents / worktrees can never mutate the shared node_modules simultaneously.
#
# Usage:
#   .\scripts\pnpm-install-lock.ps1                                      # pnpm install --frozen-lockfile
#   .\scripts\pnpm-install-lock.ps1 -InstallArgs "--frozen-lockfile"     # explicit args
#   .\scripts\pnpm-install-lock.ps1 -InstallArgs "add -w lodash"         # pnpm add
#   .\scripts\pnpm-install-lock.ps1 -ForceClean                          # force-clean then install
#   .\scripts\pnpm-install-lock.ps1 -KeepSymlink                         # opt out of worktree symlink auto-recovery
#
# Worktree symlink behaviour:
#   By default, when run from a worktree whose node_modules is a symlink to
#   the main repo, this script auto-heals: if the shared target looks healthy
#   (.bin/tsx and .bin/nx both present) it no-ops; if broken, it drops the
#   symlink and falls through to a private install. Pass -KeepSymlink (or
#   set KEEP_SYMLINK=1) to restore the old "block and instruct" behaviour.
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
    [switch]$SkipSymlinkCheck,

    [Parameter()]
    [switch]$KeepSymlink,

    [Parameter()]
    [string]$RepoRoot
)

# KEEP_SYMLINK=1 env var mirrors the -KeepSymlink switch (makes it easy to
# opt out from the Makefile without threading a new variable through every target).
if ($env:KEEP_SYMLINK -eq "1") {
    $KeepSymlink = $true
}

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
# Helper — is the symlink target's node_modules actually usable?
# ---------------------------------------------------------------------------
# A healthy shared node_modules should have the canonical bins the MCP servers
# and tooling rely on. If any are missing, the share is broken and reinstalling
# against the shared dir from the main repo is the right fix; running install
# here (against a private node_modules) is the second-best option.

function Test-NodeModulesHealthy {
    param([string]$Path)
    # tsx + nx cover the two things that most frequently matter in practice:
    #   - tsx powers every custom MCP server ('pnpm exec tsx ...')
    #   - nx drives the Nx task graph used by make targets
    # (pnpm itself is managed by corepack and does not live in node_modules/.bin.)
    $requiredBins = @('tsx', 'nx')
    foreach ($bin in $requiredBins) {
        # On Windows, pnpm installs .CMD shims alongside the POSIX symlinks.
        # Check for either so we don't false-negative on a healthy install.
        $binPath = Join-Path $Path ".bin/$bin"
        $binPathCmd = Join-Path $Path ".bin/$bin.CMD"
        if (-not (Test-Path $binPath) -and -not (Test-Path $binPathCmd)) {
            return $false
        }
    }
    return $true
}

# ---------------------------------------------------------------------------
# Symlink recovery — auto-heal when node_modules is a symlink
# ---------------------------------------------------------------------------
# When a worktree's node_modules is symlinked to the main repo:
#   - If the target is healthy, we're done -- the symlink is doing its job.
#   - If the target is broken (e.g. missing .bin/tsx, which breaks all 9 MCP
#     servers), the three-step manual recovery (rmdir + make install) is
#     friction. Auto-drop the symlink and fall through to a private install so
#     the worktree ends up self-contained.
#   - Users who explicitly want the old "block and instruct" behaviour can pass
#     -KeepSymlink (or set KEEP_SYMLINK=1).

$nmPath = Join-Path (Get-Location) "node_modules"
if (Test-Path $nmPath) {
    $nmItem = Get-Item $nmPath -Force
    if (($nmItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        $target = $nmItem.Target
        $mainRepo = Split-Path $target

        if ($KeepSymlink) {
            # Opt-out path: preserve the historical block-and-instruct flow so
            # users can still refuse the auto-recovery when they expect the
            # share to stay intact.
            Write-Host ""
            Write-Host "  ============================================================" -ForegroundColor Red
            Write-Host "  BLOCKED: node_modules is a symlink -> $target" -ForegroundColor Red
            Write-Host "  ============================================================" -ForegroundColor Red
            Write-Host ""
            Write-Host "  Running pnpm install here would mutate the SHARED node_modules" -ForegroundColor Yellow
            Write-Host "  and break every other worktree using the same symlink." -ForegroundColor Yellow
            Write-Host "  (KEEP_SYMLINK=1 / -KeepSymlink was set, so auto-recovery is disabled.)" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  What to do instead:" -ForegroundColor Cyan
            Write-Host "    - If node_modules is healthy: do nothing, the symlink is working." -ForegroundColor White
            Write-Host "    - If node_modules is broken: run 'make install' in the MAIN REPO" -ForegroundColor White
            Write-Host "      ($mainRepo) -- all symlinked worktrees share it." -ForegroundColor White
            Write-Host "    - If this worktree needs different deps (lockfile diverged):" -ForegroundColor White
            Write-Host "      1. Remove symlink:  cmd /c `"rmdir node_modules`"" -ForegroundColor White
            Write-Host "      2. Install fresh:   make install" -ForegroundColor White
            Write-Host ""
            exit 1
        }

        # Fast path: the shared node_modules is healthy, nothing to do.
        if (Test-NodeModulesHealthy -Path $nmPath) {
            Write-Host ""
            Write-Host "  [ok] node_modules is a healthy symlink -> $target" -ForegroundColor Green
            Write-Host "  Shared deps look intact (tsx/nx present); skipping install." -ForegroundColor Green
            Write-Host "  To force a private install anyway, first: cmd /c `"rmdir node_modules`"" -ForegroundColor DarkGray
            Write-Host ""
            exit 0
        }

        # Auto-recovery: the symlink target is broken. Drop the symlink and
        # fall through to a private install so the worktree is self-contained.
        Write-Host ""
        Write-Host "  ============================================================" -ForegroundColor Yellow
        Write-Host "  AUTO-RECOVER: node_modules symlink target is broken" -ForegroundColor Yellow
        Write-Host "  ============================================================" -ForegroundColor Yellow
        Write-Host "    symlink:  $nmPath" -ForegroundColor Yellow
        Write-Host "    target:   $target" -ForegroundColor Yellow
        Write-Host "    reason:   missing .bin/tsx or .bin/nx in the shared target" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Removing the symlink and installing a private node_modules for" -ForegroundColor Cyan
        Write-Host "  this worktree. After this, the worktree is DETACHED from main's" -ForegroundColor Cyan
        Write-Host "  shared deps (re-symlink later: node scripts/setup-worktree-node-modules.mjs)." -ForegroundColor Cyan
        Write-Host "  To opt out of this auto-recovery, pass -KeepSymlink or set KEEP_SYMLINK=1." -ForegroundColor DarkGray
        Write-Host ""

        # cmd /c rmdir drops the reparse point without touching the target's
        # contents. Do NOT use Remove-Item -Recurse here — on some PowerShell
        # versions that follows the link and deletes the shared directory.
        & cmd /c "rmdir `"$nmPath`""
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [!!] Failed to remove symlink (rmdir exit=$LASTEXITCODE). Aborting." -ForegroundColor Red
            exit 1
        }

        # Verify the symlink is gone before continuing. If something still
        # exists and is still a reparse point, we must not proceed — a later
        # pnpm install would corrupt shared state.
        if (Test-Path $nmPath) {
            $after = Get-Item $nmPath -Force
            if (($after.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                Write-Host "  [!!] node_modules is still a symlink after rmdir; refusing to install." -ForegroundColor Red
                exit 1
            }
        }

        Write-Host "  [ok] Symlink removed; proceeding with private install." -ForegroundColor Green
        Write-Host ""
    }
}

# ---------------------------------------------------------------------------
# Main-repo guard — refuse if worktrees have symlinks to this node_modules
# ---------------------------------------------------------------------------
# When running from the main repo (not a worktree), check if any worktrees
# have symlinks pointing to THIS node_modules. Installing here would
# silently mutate the shared directory and break those worktrees.

if (Test-Path $nmPath) {
    $wtDirs = @()
    try {
        $wtDirs = @(git worktree list --porcelain 2>$null |
            Select-String '^worktree ' |
            ForEach-Object { ($_ -replace '^worktree ','').Trim() } |
            Where-Object { $_ -ne (Get-Location).Path })
    } catch {}

    $symlinks = @()
    $thisNmResolved = (Resolve-Path $nmPath -ErrorAction SilentlyContinue).Path
    foreach ($wt in $wtDirs) {
        $wtNM = Join-Path $wt 'node_modules'
        $wi = Get-Item $wtNM -Force -ErrorAction SilentlyContinue
        if ($wi -and (($wi.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
            $wtTarget = $null
            try { $wtTarget = (Resolve-Path $wi.Target -ErrorAction SilentlyContinue).Path } catch {}
            if ($wtTarget -eq $thisNmResolved) {
                $symlinks += $wt
            }
        }
    }

    if ($symlinks.Count -gt 0) {
        if ($SkipSymlinkCheck) {
            Write-Host ""
            Write-Host "  WARNING: $($symlinks.Count) worktrees have symlinks to this node_modules" -ForegroundColor Yellow
            Write-Host "  Proceeding anyway (SKIP_SYMLINK_CHECK=1)" -ForegroundColor Yellow
            Write-Host ""
        } else {
            Write-Host ""
            Write-Host "  ============================================================" -ForegroundColor Red
            Write-Host "  BLOCKED: worktrees have symlinks to this node_modules" -ForegroundColor Red
            Write-Host "  ============================================================" -ForegroundColor Red
            Write-Host ""
            Write-Host "  Running pnpm install here would silently mutate the shared" -ForegroundColor Yellow
            Write-Host "  node_modules and break these symlinked worktrees:" -ForegroundColor Yellow
            foreach ($j in $symlinks) {
                Write-Host "    - $j" -ForegroundColor Yellow
            }
            Write-Host ""
            Write-Host "  What to do instead:" -ForegroundColor Cyan
            Write-Host "    - Clean up idle worktrees first:  twig worktree clean" -ForegroundColor White
            Write-Host "    - Or remove their symlinks:  cd <worktree> && cmd /c `"rmdir node_modules`"" -ForegroundColor White
            Write-Host "    - Or force it:  make install SKIP_SYMLINK_CHECK=1" -ForegroundColor White
            Write-Host ""
            exit 1
        }
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
