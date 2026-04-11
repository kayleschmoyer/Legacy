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
# Active-session protection: setup-worktree-junction.sh (also a SessionStart hook,
# runs first) writes a .claude-session marker with the current epoch. Sibling
# worktrees whose marker is < 30 minutes old are skipped. Stale markers (crashed
# sessions older than 30 minutes) are removed before the junction is cleaned up.
# For Copilot agents-* worktrees, setup-worktree.ps1 writes the same marker.

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
#
# Skip siblings whose .claude-session marker is < 30 minutes old: those
# belong to sessions that are still running. setup-worktree-junction.sh
# writes this marker at SessionStart (before this hook runs), so the
# current session's own worktree is always skipped automatically.
NOW=$(date +%s)
for NM in "$WORKTREES_DIR"/*/node_modules; do
  # Skip if glob found no matches (bash literal path with no expansion)
  [ -e "$NM" ] || [ -L "$NM" ] || continue

  SIBLING_DIR=$(dirname "$NM")

  # Skip if a live session marker exists and is < 1800 seconds old
  MARKER="$SIBLING_DIR/.claude-session"
  if [ -f "$MARKER" ]; then
    # Strip non-numeric chars (BOM, whitespace) in case the marker was written by
    # PowerShell without -Encoding ascii (UTF-16LE produces a BOM that breaks arithmetic)
    MARKER_TIME=$(cat "$MARKER" 2>/dev/null | tr -cd '0-9')
    if [ -n "$MARKER_TIME" ] && [ $((NOW - MARKER_TIME)) -lt 1800 ]; then
      continue
    fi
    # Marker is stale (crashed session) — remove it before cleaning the junction
    rm -f "$MARKER"
  fi

  WIN_PATH=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  cmd //c "rmdir \"$WIN_PATH\"" >/dev/null 2>&1
done

exit 0
