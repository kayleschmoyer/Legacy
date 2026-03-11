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
