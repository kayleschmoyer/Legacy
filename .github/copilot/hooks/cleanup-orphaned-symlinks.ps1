# sessionStart hook: remove orphaned node_modules symlinks left by crashed sessions.
#
# The sessionEnd hook removes the symlink when a session ends cleanly.
# But if a session crashes, the hook never runs and the symlink persists.
# A later `git worktree remove` can then follow the link and corrupt the main
# repo's node_modules.
#
# This hook runs at sessionStart, scans sibling worktrees in the *.worktrees\ dir,
# and removes stale symlinks from worktrees whose session marker is > 30 minutes old
# (indicating a crashed session).
#
# Claude equivalent: .claude/hooks/cleanup-orphaned-symlinks.sh

param()

$inputJson = [Console]::In.ReadToEnd()
$worktree = $PWD.Path

try {
    $parsed = $inputJson | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($parsed -and $parsed.cwd) { $worktree = $parsed.cwd }
} catch {}

# --- Guard: only act inside *.worktrees\<name> directories -------------------
$parentDir  = Split-Path $worktree -Parent
$parentName = Split-Path $parentDir -Leaf

if ($parentName -notlike "*.worktrees") {
    exit 0
}

$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

function Remove-SymlinkSafe([string]$path) {
    if (-not (Test-Path $path)) { return }
    cmd /c "rmdir `"$path`"" 2>$null
}

function Clean-WorktreeSymlinks([string]$siblingDir) {
    $marker = Join-Path $siblingDir '.copilot-session'

    if (Test-Path $marker) {
        $raw = (Get-Content $marker -Raw -ErrorAction SilentlyContinue) -replace '\D', ''
        if ($raw -and ($now - [long]$raw) -lt 1800) {
            return  # Live session — skip
        }
        Remove-Item $marker -Force -ErrorAction SilentlyContinue
    }

    Remove-SymlinkSafe (Join-Path $siblingDir 'node_modules')
}

# Scan all sibling worktrees in the same *.worktrees\ dir, skipping the current one
Get-ChildItem $parentDir -Directory | ForEach-Object {
    $siblingPath = $_.FullName
    if ($siblingPath -eq $worktree) { return }
    Clean-WorktreeSymlinks $siblingPath
}

exit 0
