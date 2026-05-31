# SessionStart equivalent: link node_modules for Copilot sibling worktrees
# (<repo>.worktrees/<name>/) to a content-addressable pool slot.
#
# Mirrors .github/copilot/hooks/setup-worktree-symlink.sh for Windows/PowerShell.
#
# Delegates to scripts/modules-pool/link.mjs — a dependency-free Node resolver
# that hashes the worktree's pnpm-lock.yaml and links node_modules to the
# matching slot under <main>\.modules-pool\<hash>\node_modules, materialising the
# slot on a pool miss. link.mjs auto-detects the sibling-worktree main repo and
# creates a directory symlink via `cmd /c mklink /D` (no cross-shell quoting
# issues). Requires Windows Developer Mode.
#
# Why directory symlinks (not junctions):
#   `git worktree remove` and recursive-delete tools follow NTFS junctions and
#   destroy the target; directory symlinks are not followed. (LS-3084)
#
# Worktree path pattern this script guards:
#   <root>\<repo>.worktrees\<name>\   (e.g. D:\code\legacy-sports.worktrees\agents-foo\)
#
# Usage:
#   pwsh -File .github/copilot/hooks/setup-worktree-symlink.ps1
#   pwsh -File .github/copilot/hooks/setup-worktree-symlink.ps1 D:\code\legacy-sports.worktrees\my-wt
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

# --- 2. Delegate to the pool resolver ------------------------------------------
# Non-fatal: a SessionStart hook must never block startup. link.mjs prints a
# clear Developer-Mode message if the directory symlink cannot be created.
& node "$worktree\scripts\modules-pool\link.mjs" "--worktree=$worktree"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "scripts/modules-pool/link.mjs failed — node_modules may be missing in $worktree"
    Write-Warning "Directory symlinks require Windows Developer Mode (Settings > System > For Developers)."
}

# Write session marker so cleanup-orphaned-symlinks can distinguish live vs crashed sessions
[DateTimeOffset]::UtcNow.ToUnixTimeSeconds() | Set-Content (Join-Path $worktree '.copilot-session') -NoNewline -Encoding ascii
exit 0
