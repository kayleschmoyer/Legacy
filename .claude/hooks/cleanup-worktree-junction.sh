#!/bin/bash
# Stop hook: remove node_modules junction from ephemeral worktree before session ends.
# Prevents Claude Code's own worktree cleanup from following the junction into the main
# repo's node_modules when running git worktree remove on .claude/worktrees/<name>/.
#
# Uses `cmd //c rmdir` (non-recursive) only after confirming node_modules is a
# symlink/junction. Real directories are left untouched; the command is used solely to
# remove the link itself and never the target.
#
# Note: on Windows git-bash, `[ -L ]` returns false for NTFS junctions (only true
# symlinks), so we always attempt the non-recursive rmdir whenever node_modules exists.
# cmd rmdir succeeds for junctions/symlinks and fails harmlessly on non-empty real dirs.

WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Only act inside Claude Code ephemeral worktrees
if [[ "$WORKTREE" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

# Remove the session-active marker written by setup-worktree-junction.sh.
# This lets cleanup-orphaned-junctions.sh in future sessions distinguish
# cleanly-stopped sessions (no marker) from crashed ones (stale marker).
MARKER="$WORKTREE/.claude-session"
[ -f "$MARKER" ] && rm -f "$MARKER"

NM="$WORKTREE/node_modules"

if [ ! -e "$NM" ] && [ ! -L "$NM" ]; then
  exit 0
fi

# Attempt non-recursive removal whenever node_modules exists in an ephemeral worktree.
# This safely removes a junction/symlink without touching the target, and will fail
# harmlessly for a real non-empty directory.
WIN_PATH=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
cmd //c "rmdir \"$WIN_PATH\"" >/dev/null 2>&1

exit 0
