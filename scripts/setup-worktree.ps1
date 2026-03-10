# setup-worktree.ps1 - Smart worktree dependency setup
#
# Automates the four manual steps every worktree needs:
#   1. node_modules             - junction to main repo when lockfiles match; full pnpm install otherwise
#   2. .env                     - copy from main repo
#   3. terraform/secrets.auto.tfvars - copy from main repo (prevents interactive terraform prompts)
#   4. .twig                    - junction to main repo (shared branch-dependency state)
#
# Usage (from any directory):
#   .\scripts\setup-worktree.ps1 -WorktreePath <path>
#   .\scripts\setup-worktree.ps1 -WorktreePath <path> -Force        # always run pnpm install
#   .\scripts\setup-worktree.ps1 -WorktreePath <path> -SkipInstall  # env + twig only
#
# Called by: make wt-setup WT=<path>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$WorktreePath,

    [Parameter()]
    [string]$MainRepoPath,

    [Parameter()]
    [switch]$Force,

    [Parameter()]
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step  { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Skip  { param([string]$msg) Write-Host "  [--] $msg" -ForegroundColor DarkGray }
function Write-Warn  { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }

function Get-FileHash256 {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    (Get-FileHash -Path $Path -Algorithm SHA256).Hash
}

function Test-IsJunction {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item $Path -Force
    return ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
}

function Remove-JunctionSafe {
    # Remove a junction WITHOUT deleting the target contents.
    # Remove-Item -Recurse on a junction follows it; cmd rmdir does not.
    param([string]$Path)
    if (Test-IsJunction $Path) {
        cmd /c "rmdir `"$Path`"" 2>$null
        Write-Ok "Removed stale junction at $Path"
    }
}

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

$WorktreePath = (Resolve-Path $WorktreePath -ErrorAction Stop).Path

if (-not $MainRepoPath) {
    # Find via git common dir (works from any worktree)
    $gitCommonDir = $null
    try { $gitCommonDir = (git -C $WorktreePath rev-parse --git-common-dir 2>$null) } catch {}
    if ($gitCommonDir) {
        $MainRepoPath = (Resolve-Path (Split-Path $gitCommonDir -Parent) -ErrorAction SilentlyContinue).Path
    }
    if (-not $MainRepoPath) {
        $MainRepoPath = "D:\code\legacy-sports"
    }
}

if (-not (Test-Path (Join-Path $MainRepoPath "pnpm-lock.yaml"))) {
    Write-Error "Main repo not found at $MainRepoPath (no pnpm-lock.yaml). Pass -MainRepoPath explicitly."
    return
}
if (-not (Test-Path (Join-Path $WorktreePath "pnpm-lock.yaml"))) {
    Write-Error "Worktree at $WorktreePath has no pnpm-lock.yaml -- is it a valid checkout?"
    return
}

Write-Host ""
Write-Host "=== Worktree Smart Setup ===" -ForegroundColor Cyan
Write-Host "  Worktree : $WorktreePath"
Write-Host "  Main repo: $MainRepoPath"

# ---------------------------------------------------------------------------
# Serialize concurrent wt-setup calls via file lock
# ---------------------------------------------------------------------------
# Multiple agents may run wt-setup simultaneously. The node_modules junction
# logic reads and mutates the main repo's node_modules directory, so we need
# exclusive access. We acquire a .wt-setup.lock file in the main repo and
# release it when done (or on error).

$lockPath = Join-Path $MainRepoPath ".wt-setup.lock"
$lockStream = $null

function Enter-SetupLock {
    $maxWait = 120  # seconds
    $waited  = 0
    while ($true) {
        try {
            $script:lockStream = [System.IO.File]::Open(
                $lockPath,
                [System.IO.FileMode]::OpenOrCreate,
                [System.IO.FileAccess]::ReadWrite,
                [System.IO.FileShare]::None
            )
            # Write PID so other agents can see who holds the lock
            $writer = [System.IO.StreamWriter]::new($script:lockStream)
            $writer.Write("PID=$PID at $(Get-Date -Format o)")
            $writer.Flush()
            return
        }
        catch {
            if ($waited -ge $maxWait) {
                Write-Warn "Timed out waiting for wt-setup lock after ${maxWait}s. Proceeding without lock."
                return
            }
            if ($waited -eq 0) {
                Write-Host "  [..] Another wt-setup is running -- waiting for lock..." -ForegroundColor Yellow
            }
            Start-Sleep -Seconds 2
            $waited += 2
        }
    }
}

function Exit-SetupLock {
    if ($script:lockStream) {
        $script:lockStream.Close()
        $script:lockStream = $null
        Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
    }
}

Enter-SetupLock

# Ensure lock is released on exit (normal, error, or Ctrl+C)
try {

# ---------------------------------------------------------------------------
# 1. node_modules
# ---------------------------------------------------------------------------

if ($SkipInstall) {
    Write-Step "node_modules -- skipped (-SkipInstall)"
}
else {
    Write-Step "node_modules"

    $wtLockPath   = Join-Path $WorktreePath "pnpm-lock.yaml"
    $mainLockPath = Join-Path $MainRepoPath "pnpm-lock.yaml"
    $wtLock       = Get-FileHash256 $wtLockPath
    $mainLock     = Get-FileHash256 $mainLockPath
    $mainNM       = Join-Path $MainRepoPath "node_modules"
    $wtNM         = Join-Path $WorktreePath "node_modules"

    $currentIsJunction = Test-IsJunction $wtNM
    $lockfilesMatch    = ($wtLock -eq $mainLock)

    if ($Force) {
        # Force mode: always full install
        Write-Warn "Force mode -- running full pnpm install"
        Remove-JunctionSafe $wtNM
        Push-Location $WorktreePath
        try { pnpm install --frozen-lockfile } finally { Pop-Location }
        Write-Ok "pnpm install completed (independent node_modules)"
    }
    elseif ($lockfilesMatch -and (Test-Path $mainNM) -and -not $currentIsJunction) {
        # Lockfiles match + main has node_modules + worktree has no junction yet
        if (Test-Path $wtNM) {
            Write-Warn "Removing existing node_modules to replace with junction (lockfiles match)"
            # cmd rmdir /s /q is 5-10x faster than Remove-Item -Recurse on Windows
            cmd /c "rmdir /s /q `"$wtNM`"" 2>$null
            if (Test-Path $wtNM) {
                # Fallback: if rmdir failed (file locks), try PowerShell
                Remove-Item $wtNM -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        cmd /c "mklink /J `"$wtNM`" `"$mainNM`"" | Out-Null
        Write-Ok "Junctioned node_modules -> main repo (lockfiles match, saved ~1.8 GB)"
    }
    elseif ($lockfilesMatch -and $currentIsJunction) {
        # Already junctioned and still valid
        Write-Ok "node_modules already junctioned to main repo (lockfiles still match)"
    }
    elseif (-not $lockfilesMatch -and $currentIsJunction) {
        # Lockfiles diverged -- need independent install
        Write-Warn "Lockfiles diverged -- removing junction, running pnpm install"
        Remove-JunctionSafe $wtNM
        Push-Location $WorktreePath
        try { pnpm install --frozen-lockfile } finally { Pop-Location }
        Write-Ok "pnpm install completed (independent node_modules)"
    }
    elseif (-not $lockfilesMatch) {
        # Lockfiles differ, no junction -- normal install
        Write-Warn "Lockfiles differ from main -- running pnpm install"
        Push-Location $WorktreePath
        try { pnpm install --frozen-lockfile } finally { Pop-Location }
        Write-Ok "pnpm install completed (independent node_modules)"
    }
    else {
        # Lockfiles match but main has no node_modules
        Write-Warn "Main repo has no node_modules -- running pnpm install in worktree"
        Push-Location $WorktreePath
        try { pnpm install --frozen-lockfile } finally { Pop-Location }
        Write-Ok "pnpm install completed"
    }
}

# ---------------------------------------------------------------------------
# 2. .env
# ---------------------------------------------------------------------------

Write-Step ".env"

$mainEnv = Join-Path $MainRepoPath ".env"
$wtEnv   = Join-Path $WorktreePath ".env"

if (-not (Test-Path $mainEnv)) {
    Write-Warn "No .env in main repo -- skipping (run sync-env.ps1 in main repo first)"
}
elseif (Test-Path $wtEnv) {
    $mainHash = Get-FileHash256 $mainEnv
    $wtHash   = Get-FileHash256 $wtEnv
    if ($mainHash -eq $wtHash) {
        Write-Ok ".env already up to date"
    }
    else {
        Copy-Item $mainEnv $wtEnv -Force
        Write-Ok ".env updated from main repo"
    }
}
else {
    Copy-Item $mainEnv $wtEnv
    Write-Ok ".env copied from main repo"
}

# ---------------------------------------------------------------------------
# 3. terraform/secrets.auto.tfvars
# ---------------------------------------------------------------------------
# Terraform requires secret variables (google_oauth_client_secret, jwt_secret_key,
# oauth_proxy_cookie_secret, jira_credentials, rollbar_access_token) that are
# never committed to git. They live in terraform/secrets.auto.tfvars in the main
# repo. Copy them to the worktree so `terraform plan/apply` doesn't block on
# interactive prompts or fail with "No value for required variable".

Write-Step "terraform/secrets.auto.tfvars"

$mainTfSecrets = Join-Path (Join-Path $MainRepoPath "terraform") "secrets.auto.tfvars"
$wtTfSecrets   = Join-Path (Join-Path $WorktreePath "terraform") "secrets.auto.tfvars"

if (-not (Test-Path $mainTfSecrets)) {
    Write-Warn "No terraform/secrets.auto.tfvars in main repo -- skipping (run terraform setup first)"
}
elseif (Test-Path $wtTfSecrets) {
    $mainHash = Get-FileHash256 $mainTfSecrets
    $wtHash   = Get-FileHash256 $wtTfSecrets
    if ($mainHash -eq $wtHash) {
        Write-Ok "terraform/secrets.auto.tfvars already up to date"
    }
    else {
        Copy-Item $mainTfSecrets $wtTfSecrets -Force
        Write-Ok "terraform/secrets.auto.tfvars updated from main repo"
    }
}
else {
    Copy-Item $mainTfSecrets $wtTfSecrets
    Write-Ok "terraform/secrets.auto.tfvars copied from main repo"
}

# ---------------------------------------------------------------------------
# 4. .twig junction
# ---------------------------------------------------------------------------

Write-Step ".twig"

$mainTwig = Join-Path $MainRepoPath ".twig"
$wtTwig   = Join-Path $WorktreePath ".twig"

if (-not (Test-Path $mainTwig)) {
    Write-Warn "No .twig in main repo -- skipping"
}
elseif (Test-IsJunction $wtTwig) {
    Write-Ok ".twig junction already exists"
}
elseif (Test-Path $wtTwig) {
    Write-Warn ".twig exists but is not a junction -- replacing with junction"
    Remove-Item $wtTwig -Recurse -Force
    cmd /c "mklink /J `"$wtTwig`" `"$mainTwig`"" | Out-Null
    Write-Ok ".twig junctioned -> main repo"
}
else {
    cmd /c "mklink /J `"$wtTwig`" `"$mainTwig`"" | Out-Null
    Write-Ok ".twig junctioned -> main repo"
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=== Setup complete! ===" -ForegroundColor Green
Write-Host "  Next: code $WorktreePath"
Write-Host ""

} # end try (lock scope)
finally {
    Exit-SetupLock
}
