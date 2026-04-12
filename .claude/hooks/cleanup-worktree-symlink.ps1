# Stop hook: remove node_modules symlink from ephemeral worktree on session end.
# Uses cmd rmdir (non-recursive) which removes symlinks without touching the target.
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

exit 0
