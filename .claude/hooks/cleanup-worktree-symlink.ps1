# SessionEnd hook: remove node_modules symlink from ephemeral worktree at session end.
# Uses cmd rmdir (non-recursive) which removes symlinks without touching the target.
#
# Wire on SessionEnd, not Stop — Stop fires per-turn and tearing down node_modules
# there breaks the next turn's build commands (nx not found) until SessionStart re-links.
#
# Claude Code equivalent: .claude/hooks/cleanup-worktree-symlink.sh

$worktree = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { $PWD.Path }

$parentDir  = Split-Path $worktree -Parent
$parentName = Split-Path $parentDir -Leaf

# Only act in known worktree patterns
$inWorktree = ($parentName -like '*.worktrees') -or
              ($worktree -match [regex]::Escape('\.claude\worktrees\') + '[^\\]+$')

if (-not $inWorktree) { exit 0 }

$nm = Join-Path $worktree 'node_modules'
if (-not (Test-Path $nm)) { exit 0 }

# Non-recursive removal — removes symlinks, fails harmlessly on non-empty real dirs
cmd /c "rmdir `"$nm`"" 2>$null

# Remove the Copilot session marker so Copilot's cleanup-orphaned-symlinks hook
# sees this session as ended. Without this, Copilot skips cleanup of the worktree
# because the marker appears live — even though the Claude Code session has ended.
if ($parentName -like '*.worktrees') {
    $marker = Join-Path $worktree '.copilot-session'
    Remove-Item $marker -Force -ErrorAction SilentlyContinue
}

exit 0
