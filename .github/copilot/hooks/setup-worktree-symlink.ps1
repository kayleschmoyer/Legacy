# SessionStart equivalent: validate and recreate the node_modules symlink for
# Copilot worktrees (<repo>.worktrees/<name>/).
#
# Mirrors the logic of .claude/hooks/setup-worktree-symlink.sh for Windows/PowerShell.
#
# Responsibilities:
#   1. Validate the symlink: check that .bin is non-empty.
#   2. If missing or invalid, recreate via cmd mklink /D (directory symlink,
#      preferred) or PowerShell New-Item -ItemType SymbolicLink as fallback.
#
# Why symlinks (not junctions):
#   Directory symlinks (mklink /D) are NOT followed by recursive-delete tools
#   (PowerShell Remove-Item, Node.js fs.rmSync, git worktree remove). When a
#   worktree directory is deleted, only the link is removed — the target
#   node_modules in the main repo is left intact. Requires Windows Developer
#   Mode (one-time setting: Settings > System > For Developers > Developer Mode).
#
# Worktree path pattern this script guards:
#   <root>\<repo>.worktrees\<name>\   (e.g. D:\code\legacy-sports.worktrees\agents-foo\)
#
# Usage:
#   Run from the worktree root, or pass the worktree path as the first argument:
#     pwsh -File .github/copilot/hooks/setup-worktree-symlink.ps1
#     pwsh -File .github/copilot/hooks/setup-worktree-symlink.ps1 D:\code\legacy-sports.worktrees\my-wt
#
# Claude equivalent: .claude/hooks/setup-worktree-symlink.sh

param(
    [string]$WorktreePath = $PWD.Path
)

$worktree = (Resolve-Path $WorktreePath -ErrorAction SilentlyContinue)?.Path ?? $WorktreePath

# --- 1. Guard: only act inside *.worktrees\<name> directories ------------------
$worktreeParentDir  = Split-Path $worktree -Parent           # e.g. D:\code\legacy-sports.worktrees
$worktreeParentName = Split-Path $worktreeParentDir -Leaf    # e.g. legacy-sports.worktrees

if ($worktreeParentName -notlike "*.worktrees") {
    # Not a sibling worktree — nothing to do.
    exit 0
}

# --- 2. Derive main repo path from the .worktrees parent ----------------------
# Pattern: <root>\<reponame>.worktrees  →  main repo is <root>\<reponame>
$rootDir      = Split-Path $worktreeParentDir -Parent
$mainRepoName = $worktreeParentName -replace '\.worktrees$', ''
$mainRepo     = Join-Path $rootDir $mainRepoName
$mainNm       = Join-Path $mainRepo 'node_modules'

if (-not (Test-Path $mainNm -PathType Container)) {
    Write-Warning "Main repo node_modules not found at: $mainNm"
    Write-Warning "Run 'make install' in the main repo first."
    exit 0
}

# --- 3. Check if symlink already exists and is healthy ------------------------
$nm  = Join-Path $worktree 'node_modules'
$bin = Join-Path $nm '.bin'

$needsRecreate = $false

if (-not (Test-Path $nm)) {
    $needsRecreate = $true
} elseif (-not (Test-Path $bin -PathType Container) -or
          (Get-ChildItem $bin -ErrorAction SilentlyContinue | Select-Object -First 1) -eq $null) {
    # .bin missing or empty — stale/broken link
    $needsRecreate = $true
}

if (-not $needsRecreate) {
    Write-Host "node_modules symlink is healthy at: $nm"
    # Refresh session marker
    [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() | Set-Content (Join-Path $worktree '.copilot-session') -NoNewline -Encoding ascii
    exit 0
}

# --- 4. Remove any existing stale/broken entry (non-recursive, safe) ----------
if (Test-Path $nm) {
    # cmd rmdir is non-recursive: removes symlinks without touching target
    cmd /c "rmdir `"$nm`"" 2>$null
}

# --- 5. Recreate as directory symlink via cmd mklink /D -----------------------
# mklink /D creates a directory symlink; recursive-delete tools remove the
# link without following it into the target — protecting the main node_modules.
cmd /c "mklink /D `"$nm`" `"$mainNm`"" 2>$null | Out-Null

# Verify; fall back to PowerShell New-Item if cmd mklink failed
if (-not (Test-Path $nm -PathType Container)) {
    try {
        New-Item -ItemType SymbolicLink -Path $nm -Target $mainNm -ErrorAction Stop | Out-Null
    } catch {
        Write-Warning "Failed to create node_modules symlink."
        Write-Warning "  Source : $nm"
        Write-Warning "  Target : $mainNm"
        Write-Warning "Directory symlinks require Windows Developer Mode."
        Write-Warning "Enable it: Settings > System > For Developers > Developer Mode"
        exit 1
    }
}

Write-Host "node_modules symlink created:"
Write-Host "  $nm  -->  $mainNm"

# Write session marker so cleanup-orphaned-symlinks can distinguish live vs crashed sessions
[DateTimeOffset]::UtcNow.ToUnixTimeSeconds() | Set-Content (Join-Path $worktree '.copilot-session') -NoNewline -Encoding ascii
exit 0
