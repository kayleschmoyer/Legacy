# setup-worktree.ps1 - Smart worktree dependency setup
#
# Automates the manual steps every worktree needs:
#   1. node_modules             - link to a content-addressable pool slot via scripts/modules-pool/link.mjs
#   2. .env                     - copy from main repo
#   3. terraform/main/secrets.auto.tfvars and terraform/runners/secrets.auto.tfvars - copy from main repo (prevents interactive terraform prompts; LS-2425 split)
#   4. .twig                    - symlink to main repo (shared branch-dependency state)
#   5. .github/skills           - symlink to .agents/skills (backward-compat for old skill paths)
#   6. certs/                   - symlink to main repo (RDS SSL certificate for DB connections)
#
# Usage (from any directory):
#   .\scripts\setup-worktree.ps1 -WorktreePath <path>
#   .\scripts\setup-worktree.ps1 -WorktreePath <path> -SkipInstall  # env + twig only
#
# -Force is accepted for backward compatibility but is a no-op for node_modules:
# the pool resolver always rebuilds the slot on a lockfile miss and relinks on a
# hit, so there is nothing to force.
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

function Test-IsReparsePoint {
    # Returns $true for directory symlinks AND junctions (both are reparse points).
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
# 1. node_modules -- content-addressable pool slot
# ---------------------------------------------------------------------------
# Delegate to the dependency-free pool resolver (scripts/modules-pool/link.mjs):
# it hashes the worktree's pnpm-lock.yaml and links node_modules to the matching
# slot under <main>\.modules-pool\<hash>, building the slot on a miss
# (pnpm install --frozen-lockfile + atomic publish) and relinking on a hit. The
# pool makes every consumer independent by construction, so there is no shared
# node_modules to lock and no EPERM / version-skew failure mode to coordinate.

if ($SkipInstall) {
    Write-Step "node_modules -- skipped (-SkipInstall)"
}
else {
    Write-Step "node_modules"
    if ($Force) {
        Write-Skip "-Force is a no-op for the pool resolver (slots rebuild on lockfile miss)"
    }
    $linkScript = Join-Path $PSScriptRoot 'modules-pool\link.mjs'
    & node $linkScript "--worktree=$WorktreePath" "--main-repo=$MainRepoPath"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "scripts/modules-pool/link.mjs failed (exit $LASTEXITCODE)."
        Write-Error "Directory symlinks require Windows Developer Mode: Settings > System > For Developers > Developer Mode"
        throw "setup-worktree: node_modules pool link failed"
    }
    Write-Ok "node_modules linked to content-addressable pool slot"
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
