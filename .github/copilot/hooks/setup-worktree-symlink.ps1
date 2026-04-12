# SessionStart equivalent: validate and recreate the node_modules symlink for
# Copilot worktrees (<repo>.worktrees/<name>/).
#
# Mirrors the logic of .claude/hooks/setup-worktree-symlink.sh for Windows/PowerShell.
#
# Responsibilities:
#   1. Validate the symlink: check that .bin is non-empty.
#   2. If missing, invalid, or a legacy junction, recreate via cmd mklink /D.
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

# Also recreate if the existing link is an NTFS junction (LS-3084).
# `git worktree remove` follows junctions and recursively deletes the target,
# which would destroy the main repo's node_modules. Symlinks are safe.
if (-not $needsRecreate -and (Test-Path $nm)) {
    $linkItem = Get-Item $nm -Force -ErrorAction SilentlyContinue
    if ($linkItem.LinkType -eq 'Junction') {
        $needsRecreate = $true
    }
}

if (-not $needsRecreate) {
    Write-Host "node_modules symlink is healthy at: $nm"
    # Refresh session marker
    [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() | Set-Content (Join-Path $worktree '.copilot-session') -NoNewline -Encoding ascii
    exit 0
}

# --- 4. Delegate to mklink-symlink.ps1 for reliable symlink creation ---------
# Handles: removal of stale links, junction-to-symlink conversion, creation,
# and verification — all in pure PowerShell (no cross-shell quoting issues).
# Must invoke via powershell -File (not &) because mklink-symlink.ps1 uses
# `exit` which would terminate the current script via the call operator.
$mklinkScript = Join-Path $worktree 'scripts' 'mklink-symlink.ps1'
$psExe = Join-Path $PSHOME $(if ($PSVersionTable.PSEdition -eq 'Desktop') { 'powershell.exe' } else { 'pwsh.exe' })
& $psExe -NoProfile -NonInteractive -File $mklinkScript -Link $nm -Target $mainNm -Force
if (-not (Test-Path $nm -PathType Container)) {
    Write-Warning "Failed to create node_modules symlink."
    Write-Warning "  Source : $nm"
    Write-Warning "  Target : $mainNm"
    Write-Warning "Directory symlinks require Windows Developer Mode."
    Write-Warning "Enable it: Settings > System > For Developers > Developer Mode"
    exit 1
}

Write-Host "node_modules symlink created:"
Write-Host "  $nm  -->  $mainNm"

# Write session marker so cleanup-orphaned-symlinks can distinguish live vs crashed sessions
[DateTimeOffset]::UtcNow.ToUnixTimeSeconds() | Set-Content (Join-Path $worktree '.copilot-session') -NoNewline -Encoding ascii
exit 0
