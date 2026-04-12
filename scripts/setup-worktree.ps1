# setup-worktree.ps1 - Smart worktree dependency setup
#
# Automates the six manual steps every worktree needs:
#   1. node_modules             - symlink to main repo when lockfiles match; full pnpm install otherwise
#   2. .env                     - copy from main repo
#   3. terraform/main/secrets.auto.tfvars and terraform/runners/secrets.auto.tfvars - copy from main repo (prevents interactive terraform prompts; LS-2425 split)
#   4. .twig                    - symlink to main repo (shared branch-dependency state)
#   5. .github/skills           - symlink to .agents/skills (backward-compat for old skill paths)
#   6. certs/                   - symlink to main repo (RDS SSL certificate for DB connections)
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

function Confirm-IndependentInstall {
    # Prompt the user to confirm a full pnpm install in the worktree when the
    # main repo's node_modules is broken.  In non-interactive sessions (e.g.
    # agents running via make wt-setup) default to 'yes' so work isn't blocked.
    param([string]$Reason)
    Write-Host ""
    Write-Warn "Main repo node_modules is unhealthy: $Reason"
    Write-Warn "Symlinking would propagate the broken state to this worktree."
    Write-Host "  Options:" -ForegroundColor Yellow
    Write-Host "    Y - Run pnpm install in this worktree only (independent node_modules)" -ForegroundColor Yellow
    Write-Host "    N - Abort setup (fix main repo first: cd $MainRepoPath ; make install)" -ForegroundColor Yellow
    $isInteractive = [Environment]::UserInteractive -and (-not [Console]::IsInputRedirected)
    if (-not $isInteractive) {
        Write-Warn "Non-interactive session detected -- defaulting to independent install"
        return $true
    }
    $answer = Read-Host "  Install independently in this worktree? [Y/n]"
    if ($answer -match '^[Nn]') {
        return $false
    }
    return $true
}

function Get-FileHash256 {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    (Get-FileHash -Path $Path -Algorithm SHA256).Hash
}

function Get-LockfileHash {
    # Content-normalised SHA-256 for lockfile comparison.
    # Normalises CRLF -> LF and strips a leading BOM so that minor formatting
    # differences (CRLF checkout on Windows, git config differences, pnpm header
    # whitespace) do not trigger a false-positive "lockfiles differ" and a
    # needless full pnpm install.
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $content = [System.IO.File]::ReadAllText($Path)
    # Strip UTF-8 BOM (U+FEFF) if present
    if ($content.Length -gt 0 -and [int][char]$content[0] -eq 0xFEFF) {
        $content = $content.Substring(1)
    }
    # Normalise line endings: CRLF -> LF
    $content = $content -replace "`r`n", "`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    $sha   = [System.Security.Cryptography.SHA256]::Create()
    $hash  = $sha.ComputeHash($bytes)
    $sha.Dispose()
    return ([System.BitConverter]::ToString($hash) -replace '-', '')
}

function Assert-NodeModulesValid {
    # Validate that a pnpm install produced a usable node_modules.
    # Returns $true when valid, $false when broken.
    param([string]$NMPath)
    $modulesYaml = Join-Path $NMPath ".modules.yaml"
    $binDir      = Join-Path $NMPath ".bin"
    if (-not (Test-Path $modulesYaml)) {
        Write-Warn "$NMPath/.modules.yaml missing -- install may have failed"
        return $false
    }
    $binItems = @(Get-ChildItem $binDir -ErrorAction SilentlyContinue)
    if ($binItems.Count -eq 0) {
        Write-Warn "$NMPath/.bin is empty -- install may have failed"
        return $false
    }
    return $true
}

function Test-IsReparsePoint {
    # Returns $true for directory symlinks (reparse points).
    # Uses Get-Item -LiteralPath to detect the reparse point attribute even when the
    # target is missing (Test-Path returns $false for broken symlinks).
    param([string]$Path)
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        return ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    } catch {
        return $false
    }
}

# Test-IsLink: returns $true for symlinks (any reparse point).
# Callers use this to check "is this a link we created?" before removal or health checks.
function Test-IsLink {
    param([string]$Path)
    return Test-IsReparsePoint $Path
}

function Remove-LinkSafe {
    # Remove a symlink WITHOUT deleting the target contents.
    # cmd rmdir removes the link itself without following it.
    param([string]$Path)
    if (Test-IsReparsePoint $Path) {
        cmd /c "rmdir `"$Path`"" 2>$null
        if (Test-Path $Path) {
            Write-Warn "Failed to remove link at $Path (may be locked by another process)"
        } else {
            Write-Ok "Removed stale link at $Path"
        }
    }
}

function New-Symlink {
    # Create a directory symlink (mklink /D). Requires Windows Developer Mode.
    param(
        [string]$LinkPath,
        [string]$TargetPath,
        [string]$DisplayName
    )
    cmd /c "mklink /D `"$LinkPath`" `"$TargetPath`"" | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-IsReparsePoint $LinkPath)) {
        Write-Error "Failed to create $DisplayName symlink from $LinkPath to $TargetPath"
        Write-Error "Directory symlinks require Windows Developer Mode: Settings > System > For Developers > Developer Mode"
        throw "setup-worktree: $DisplayName symlink creation failed"
    }
    Write-Ok "$DisplayName symlinked"
}

function Invoke-PnpmInstallWithRetry {
    # Run pnpm install in $InstallPath, validate, retry once if incomplete.
    # Throws on failure.
    param([string]$InstallPath)
    Push-Location $InstallPath
    try { pnpm install --frozen-lockfile } finally { Pop-Location }
    $nm = Join-Path $InstallPath "node_modules"
    if (-not (Assert-NodeModulesValid $nm)) {
        Write-Warn "Retrying pnpm install (first attempt left node_modules incomplete)"
        Push-Location $InstallPath
        try { pnpm install --frozen-lockfile } finally { Pop-Location }
        if (-not (Assert-NodeModulesValid $nm)) {
            Write-Error "pnpm install failed to produce a valid node_modules. Run 'make wt-setup WT=`"$InstallPath`"' again."
        }
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
# Multiple agents may run wt-setup simultaneously. The node_modules symlink
# logic reads and mutates the main repo's node_modules directory, so we need
# exclusive access. We share the same lock used by pnpm-install-lock.ps1 so
# that wt-setup and make install never run concurrently.

$lockPath = Join-Path $MainRepoPath ".pnpm-install.lock"
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
    # Use content-normalised hashes to avoid false positives from CRLF/LF or
    # BOM differences that git may introduce on Windows checkout.
    $wtLock       = Get-LockfileHash $wtLockPath
    $mainLock     = Get-LockfileHash $mainLockPath
    $mainNM       = Join-Path $MainRepoPath "node_modules"
    $wtNM         = Join-Path $WorktreePath "node_modules"

    $currentIsLink = Test-IsLink $wtNM
    $lockfilesMatch    = ($wtLock -eq $mainLock)

    if ($Force) {
        # Force mode: always full install
        Write-Warn "Force mode -- running full pnpm install"
        Remove-LinkSafe $wtNM
        Invoke-PnpmInstallWithRetry -InstallPath $WorktreePath
        Write-Ok "pnpm install completed (independent node_modules)"
    }
    elseif ($lockfilesMatch -and (Test-Path $mainNM) -and -not $currentIsLink) {
        # Lockfiles match + main has node_modules + worktree has no symlink yet
        # Validate main node_modules BEFORE symlinking to avoid propagating broken state
        if (-not (Assert-NodeModulesValid $mainNM)) {
            $reason = "main repo node_modules is missing .modules.yaml or .bin"
            if (Confirm-IndependentInstall -Reason $reason) {
                # If worktree already has a valid independent node_modules, skip reinstall
                if ((Test-Path $wtNM) -and -not (Test-IsLink $wtNM) -and (Assert-NodeModulesValid $wtNM)) {
                    Write-Ok "Worktree already has valid independent node_modules -- skipping reinstall"
                }
                else {
                    Write-Warn "Installing independently in worktree (not symlinking)"
                    if (Test-Path $wtNM) {
                        cmd /c "rmdir /s /q `"$wtNM`"" 2>$null
                        if (Test-Path $wtNM) { Remove-Item $wtNM -Recurse -Force -ErrorAction SilentlyContinue }
                    }
                    Invoke-PnpmInstallWithRetry -InstallPath $WorktreePath
                    Write-Ok "pnpm install completed (independent node_modules, main repo still needs repair)"
                }
            }
            else {
                Write-Error "Aborting: fix main repo node_modules first (cd $MainRepoPath ; make install), then re-run wt-setup."
            }
        }
        else {
            if (Test-Path $wtNM) {
                Write-Warn "Removing existing node_modules to replace with symlink (lockfiles match)"
                # cmd rmdir /s /q is 5-10x faster than Remove-Item -Recurse on Windows
                cmd /c "rmdir /s /q `"$wtNM`"" 2>$null
                if (Test-Path $wtNM) {
                    # Fallback: if rmdir failed (file locks), try PowerShell
                    Remove-Item $wtNM -Recurse -Force -ErrorAction SilentlyContinue
                }
            }
            # mklink /D creates a directory symlink. Recursive-delete
            # tools remove symlinks without following them, preventing Claude Code's
            # archive or Copilot CLI cleanup from destroying main repo's node_modules.
            # Requires Windows Developer Mode (one-time system setting).
            cmd /c "mklink /D `"$wtNM`" `"$mainNM`"" | Out-Null
            if ($LASTEXITCODE -ne 0 -or -not (Test-IsReparsePoint $wtNM)) {
                Write-Warn "mklink /D failed — Developer Mode may not be enabled."
                Write-Warn "  Enable it: Settings > System > For Developers > Developer Mode"
                Write-Warn "  Falling back to independent pnpm install."
                Invoke-PnpmInstallWithRetry -InstallPath $WorktreePath
                Write-Ok "pnpm install completed (independent node_modules, enable Developer Mode for symlink)"
            } else {
                Write-Ok "Symlinked node_modules -> main repo (lockfiles match, saved ~1.8 GB)"
            }
        }
    }
    elseif ($lockfilesMatch -and $currentIsLink) {
        # Already linked — verify the target is still healthy
        if (-not (Assert-NodeModulesValid $wtNM)) {
            $reason = "linked node_modules is missing .modules.yaml or .bin"
            if (Confirm-IndependentInstall -Reason $reason) {
                Write-Warn "Replacing broken link with independent install"
                Remove-LinkSafe $wtNM
                Invoke-PnpmInstallWithRetry -InstallPath $WorktreePath
                Write-Ok "pnpm install completed (independent node_modules, main repo still needs repair)"
            }
            else {
                Write-Error "Aborting: fix main repo node_modules first (cd $MainRepoPath ; make install), then re-run wt-setup."
            }
        }
        else {
            Write-Ok "node_modules already symlinked to main repo (lockfiles still match)"
        }
    }
    elseif (-not $lockfilesMatch -and $currentIsLink) {
        # Lockfiles diverged -- need independent install
        Write-Warn "Lockfiles diverged -- removing symlink, running pnpm install"
        Remove-LinkSafe $wtNM
        Invoke-PnpmInstallWithRetry -InstallPath $WorktreePath
        Write-Ok "pnpm install completed (independent node_modules)"
    }
    elseif (-not $lockfilesMatch) {
        # Lockfiles differ, no symlink -- normal install
        Write-Warn "Lockfiles differ from main -- running pnpm install"
        Invoke-PnpmInstallWithRetry -InstallPath $WorktreePath
        Write-Ok "pnpm install completed (independent node_modules)"
    }
    else {
        # Lockfiles match but main has no node_modules
        Write-Warn "Main repo has no node_modules -- running pnpm install in worktree"
        Invoke-PnpmInstallWithRetry -InstallPath $WorktreePath
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
# 3. terraform/main/secrets.auto.tfvars and terraform/runners/secrets.auto.tfvars
# ---------------------------------------------------------------------------
# Terraform requires secret variables that are never committed to git. As of
# LS-2425, the terraform configuration is split into two states (main/ for
# Lambda app infra, runners/ for self-hosted runners) and each has its own
# gitignored secrets.auto.tfvars. Copy both to the worktree so terraform
# plan/apply doesn't block on interactive prompts or fail with
# "No value for required variable".

function Sync-SecretsFile {
    param(
        [Parameter(Mandatory=$true)][string]$SrcPath,
        [Parameter(Mandatory=$true)][string]$DestPath,
        [Parameter(Mandatory=$true)][string]$DisplayName
    )

    if (-not (Test-Path $SrcPath)) {
        Write-Warn "No $DisplayName in main repo -- skipping (run terraform setup first)"
        return
    }

    # Ensure parent directory exists
    $parent = Split-Path -Parent $DestPath
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    if (Test-Path $DestPath) {
        $srcHash = Get-FileHash256 $SrcPath
        $destHash = Get-FileHash256 $DestPath
        if ($srcHash -eq $destHash) {
            Write-Ok "$DisplayName already up to date"
        }
        else {
            Copy-Item $SrcPath $DestPath -Force
            Write-Ok "$DisplayName updated from main repo"
        }
    }
    else {
        Copy-Item $SrcPath $DestPath
        Write-Ok "$DisplayName copied from main repo"
    }
}

# LS-2425 backwards-compat: if the main repo still has the pre-LS-2425 single
# secrets.auto.tfvars at terraform/secrets.auto.tfvars, one-time-migrate it to
# terraform/main/secrets.auto.tfvars (since all the variables it carries are
# main/-side). This makes the first `make wt-setup` after the LS-2425 merge
# work cleanly even on stale main repos that haven't pulled yet.
$mainRepoLegacySecrets = Join-Path (Join-Path $MainRepoPath "terraform") "secrets.auto.tfvars"
$mainRepoNewMainSecrets = Join-Path (Join-Path $MainRepoPath "terraform/main") "secrets.auto.tfvars"
if ((Test-Path $mainRepoLegacySecrets) -and -not (Test-Path $mainRepoNewMainSecrets)) {
    Write-Step "Migrating pre-LS-2425 terraform/secrets.auto.tfvars in main repo"
    $mainRepoNewMainDir = Join-Path $MainRepoPath "terraform/main"
    if (-not (Test-Path $mainRepoNewMainDir)) {
        New-Item -ItemType Directory -Path $mainRepoNewMainDir -Force | Out-Null
    }
    Copy-Item $mainRepoLegacySecrets $mainRepoNewMainSecrets
    Write-Ok "Copied legacy secrets to terraform/main/secrets.auto.tfvars in main repo"
    Write-Warn "The legacy file at terraform/secrets.auto.tfvars is preserved. Delete it manually after verifying everything works."
}

Write-Step "terraform/main/secrets.auto.tfvars"
Sync-SecretsFile `
    -SrcPath  (Join-Path (Join-Path $MainRepoPath "terraform/main") "secrets.auto.tfvars") `
    -DestPath (Join-Path (Join-Path $WorktreePath "terraform/main") "secrets.auto.tfvars") `
    -DisplayName "terraform/main/secrets.auto.tfvars"

Write-Step "terraform/runners/secrets.auto.tfvars"
Sync-SecretsFile `
    -SrcPath  (Join-Path (Join-Path $MainRepoPath "terraform/runners") "secrets.auto.tfvars") `
    -DestPath (Join-Path (Join-Path $WorktreePath "terraform/runners") "secrets.auto.tfvars") `
    -DisplayName "terraform/runners/secrets.auto.tfvars"

# ---------------------------------------------------------------------------
# 4. .twig symlink
# ---------------------------------------------------------------------------

Write-Step ".twig"

$mainTwig = Join-Path $MainRepoPath ".twig"
$wtTwig   = Join-Path $WorktreePath ".twig"

if (-not (Test-Path $mainTwig)) {
    Write-Warn "No .twig in main repo -- skipping"
}
elseif (Test-IsReparsePoint $wtTwig) {
    Write-Ok ".twig symlink already exists"
}
elseif (Test-Path $wtTwig) {
    Write-Warn ".twig exists but is not a symlink -- replacing with symlink"
    Remove-Item $wtTwig -Recurse -Force
    New-Symlink -LinkPath $wtTwig -TargetPath $mainTwig -DisplayName ".twig"
}
else {
    New-Symlink -LinkPath $wtTwig -TargetPath $mainTwig -DisplayName ".twig"
}

# ---------------------------------------------------------------------------
# 5. .github/skills -> .agents/skills symlink (backward-compat)
# ---------------------------------------------------------------------------

Write-Step ".github/skills"

$wtAgentsSkills = Join-Path (Join-Path $WorktreePath ".agents") "skills"
$wtGithubSkills = Join-Path (Join-Path $WorktreePath ".github") "skills"

if (-not (Test-Path $wtAgentsSkills)) {
    Write-Warn "No .agents/skills in worktree -- skipping"
}
elseif (Test-IsReparsePoint $wtGithubSkills) {
    Write-Ok ".github/skills symlink already exists"
}
elseif (Test-Path $wtGithubSkills) {
    Write-Warn ".github/skills exists but is not a symlink -- replacing"
    cmd /c "rmdir `"$wtGithubSkills`"" 2>$null
    Remove-Item $wtGithubSkills -Recurse -Force -ErrorAction SilentlyContinue
    New-Symlink -LinkPath $wtGithubSkills -TargetPath $wtAgentsSkills -DisplayName ".github/skills"
}
else {
    New-Symlink -LinkPath $wtGithubSkills -TargetPath $wtAgentsSkills -DisplayName ".github/skills"
}

# ---------------------------------------------------------------------------
# 6. certs/ symlink (RDS SSL certificate)
# ---------------------------------------------------------------------------
# certs/us-east-1-bundle.pem is referenced by DB_CERT_PATH in .env.
# Without it, lib/db-client falls back to built-in CAs with rejectUnauthorized:true,
# causing SSL failures against the VPC-internal RDS. A symlink is preferred over
# a copy so cert updates in the main repo propagate automatically.

Write-Step "certs/"

$mainCerts = Join-Path $MainRepoPath "certs"
$wtCerts   = Join-Path $WorktreePath "certs"

if (-not (Test-Path $mainCerts)) {
    Write-Warn "No certs/ in main repo -- skipping. To create it: mkdir certs in the main repo and save the AWS RDS us-east-1 certificate bundle as certs/us-east-1-bundle.pem, then re-run wt-setup."
}
elseif (Test-IsReparsePoint $wtCerts) {
    Write-Ok "certs/ symlink already exists"
}
elseif (Test-Path $wtCerts) {
    Write-Warn "certs/ exists but is not a symlink -- replacing with symlink"
    cmd /c "rmdir `"$wtCerts`"" 2>$null
    Remove-Item $wtCerts -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $wtCerts) {
        Write-Error "Failed to remove existing certs/ at $wtCerts before creating symlink"
        throw "setup-worktree: unable to replace existing certs/ with symlink"
    }
    New-Symlink -LinkPath $wtCerts -TargetPath $mainCerts -DisplayName "certs/"
}
else {
    New-Symlink -LinkPath $wtCerts -TargetPath $mainCerts -DisplayName "certs/"
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
