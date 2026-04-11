#!/bin/bash
# SessionStart hook: remove orphaned node_modules junctions left by crashed sessions.
#
# The Stop hook (cleanup-worktree-junction.sh) removes the node_modules junction
# when a session ends cleanly. But if a session crashes, the hook never runs and
# the junction persists. A later git worktree remove can then follow the junction
# and corrupt the main repo's node_modules.
#
# This hook runs at SessionStart and scans two worktree locations:
#   1. Sibling ephemeral worktrees under .claude/worktrees/ (Claude Code sessions)
#   2. Sibling agent worktrees under the repo's worktrees parent dir (agents-*)
#      These are created by make wt-setup for GitHub Copilot coding agent tasks and
#      are at risk when VS Code archives an agent session — the extension may delete
#      the worktree directory recursively, following the junction into the main repo.
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

remove_junction() {
  local J="$1"
  local WIN_PATH
  local CMD_OUTPUT
  local CMD_STATUS
  [ -e "$J" ] || [ -L "$J" ] || return 0
  WIN_PATH=$(cygpath -w "$J" 2>/dev/null || echo "$J" | sed 's|/d/|D:\\|; s|/|\\|g')
  CMD_OUTPUT=$(cmd //c "rmdir \"$WIN_PATH\"" 2>&1)
  CMD_STATUS=$?
  # Verify removal succeeded by checking the path no longer exists
  if [ ! -e "$J" ] && [ ! -L "$J" ]; then
    return 0
  fi
  if [ "$CMD_STATUS" -ne 0 ] && [ -n "$CMD_OUTPUT" ]; then
    printf 'Warning: failed to remove junction "%s" (exit %s): %s\n' "$J" "$CMD_STATUS" "$CMD_OUTPUT" >&2
  else
    printf 'Warning: failed to remove junction "%s"; path still exists after rmdir.\n' "$J" >&2
  fi
}

# Remove all junctions in a worktree directory, respecting the session marker.
# Junctions created by make wt-setup: node_modules, .twig, certs, .github/skills
clean_worktree_junctions() {
  local WORKTREE_DIR="$1"
  local NOW="$2"

  # Skip if a live session marker exists and is < 1800 seconds old
  local MARKER="$WORKTREE_DIR/.claude-session"
  if [ -f "$MARKER" ]; then
    # Strip non-numeric chars (BOM, whitespace) in case the marker was written by
    # PowerShell without -Encoding ascii (UTF-16LE produces a BOM that breaks arithmetic)
    local MARKER_TIME
    MARKER_TIME=$(cat "$MARKER" 2>/dev/null | tr -cd '0-9')
    if [ -n "$MARKER_TIME" ] && [ $((NOW - MARKER_TIME)) -lt 1800 ]; then
      return 0
    fi
    # Marker is stale (crashed session) — remove it before cleaning the junctions
    rm -f "$MARKER"
  fi

  for junction_name in node_modules .twig certs .github/skills; do
    remove_junction "$WORKTREE_DIR/$junction_name"
  done
}

NOW=$(date +%s)

# 1. Scan sibling ephemeral worktrees (.claude/worktrees/*)
CLAUDE_WORKTREES_DIR=$(dirname "$WORKTREE")
for SIBLING_DIR in "$CLAUDE_WORKTREES_DIR"/*/; do
  [ -d "$SIBLING_DIR" ] || continue
  clean_worktree_junctions "$SIBLING_DIR" "$NOW"
done

# 2. Scan agents-* worktrees created by make wt-setup for Copilot coding agent tasks.
# These live one level above the main repo, in a sibling directory named
# "<repo-parent>/<repo-name>.worktrees/" (e.g. D:\code\legacy-sports.worktrees\agents-*).
# Resolve from CLAUDE_WORKTREES_DIR: .claude/worktrees -> .claude -> <main-repo> -> parent
MAIN_REPO=$(dirname "$(dirname "$CLAUDE_WORKTREES_DIR")")
MAIN_REPO_NAME=$(basename "$MAIN_REPO")
PARENT_DIR=$(dirname "$MAIN_REPO")
AGENTS_WORKTREES_DIR="$PARENT_DIR/${MAIN_REPO_NAME}.worktrees"

if [ -d "$AGENTS_WORKTREES_DIR" ]; then
  for SIBLING_DIR in "$AGENTS_WORKTREES_DIR"/agents-*/; do
    [ -d "$SIBLING_DIR" ] || continue
    clean_worktree_junctions "$SIBLING_DIR" "$NOW"
  done
fi

exit 0
