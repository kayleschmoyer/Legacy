#!/bin/bash
# SessionStart hook: remove orphaned node_modules junctions left by crashed sessions.
#
# The Stop hook (cleanup-worktree-junction.sh) removes the node_modules junction
# when a session ends cleanly. But if a session crashes, the hook never runs and
# the junction persists. A later git worktree remove can then follow the junction
# and corrupt the main repo's node_modules.
#
# This hook runs at SessionStart and scans all sibling ephemeral worktrees under
# .claude/worktrees/, calling cmd //c rmdir on each node_modules it finds.
#
# cmd //c rmdir (non-recursive) removes junction links and empty real directories,
# but fails harmlessly on non-empty real directories. So a full independent install
# in a sibling worktree is safe; only junctions and empty dirs are removed.
#
# Trade-off: this hook does not check whether a sibling worktree's session is still
# active. If another session is running concurrently, removing its junction will
# break its node_modules access until it recreates the junction — but the main
# repo's node_modules target is always preserved (rmdir is non-recursive).
# In practice almost all node_modules found here will be orphaned junctions.

WORKTREE=$(pwd)

# Only act inside Claude Code ephemeral worktrees
if [[ "$WORKTREE" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

# Parent directory containing all ephemeral worktrees
WORKTREES_DIR=$(dirname "$WORKTREE")

# Scan all sibling ephemeral worktrees for node_modules to remove.
# cmd rmdir (non-recursive) removes junctions and empty directories;
# it fails harmlessly on non-empty real directories.
for NM in "$WORKTREES_DIR"/*/node_modules; do
  # Skip if glob found no matches (bash literal path with no expansion)
  [ -e "$NM" ] || [ -L "$NM" ] || continue

  WIN_PATH=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  cmd //c "rmdir \"$WIN_PATH\"" >/dev/null 2>&1
done

exit 0
