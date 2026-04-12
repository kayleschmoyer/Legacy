#!/bin/bash
# sessionStart hook: remove orphaned node_modules symlinks left by crashed sessions.
#
# The sessionEnd hook removes the symlink when a session ends cleanly.
# But if a session crashes, the hook never runs and the symlink persists.
# A later `git worktree remove` can then follow the link and corrupt the main
# repo's node_modules.
#
# This hook runs at sessionStart, scans sibling worktrees in the *.worktrees/ dir,
# and removes stale symlinks from worktrees whose session marker is > 30 minutes old
# (indicating a crashed session).
#
# Active-session protection: setup-worktree-symlink.sh writes a .copilot-session
# marker with the current epoch. Sibling worktrees whose marker is < 30 minutes
# old are skipped. Stale markers (crashed sessions) are removed before cleanup.
#
# Claude equivalent: .claude/hooks/cleanup-orphaned-symlinks.sh

set -euo pipefail

INPUT=$(cat 2>/dev/null || true)

# Prefer cwd from hook input JSON; fall back to $PWD
if command -v jq &>/dev/null && [ -n "$INPUT" ]; then
  WORKTREE=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)
fi
WORKTREE="${WORKTREE:-$(pwd)}"

# --- Guard: only act inside *.worktrees/<name> directories -------------------
PARENT_DIR=$(dirname "$WORKTREE")
PARENT_NAME=$(basename "$PARENT_DIR")

if [[ "$PARENT_NAME" != *.worktrees ]]; then
  exit 0
fi

NOW=$(date +%s)

remove_symlink() {
  local LINK="$1"
  [ -e "$LINK" ] || [ -L "$LINK" ] || return 0
  if command -v cygpath &>/dev/null; then
    local WIN_PATH
    WIN_PATH=$(cygpath -w "$LINK" 2>/dev/null || echo "$LINK" | sed 's|/d/|D:\\|; s|/|\\|g')
    cmd //c "rmdir \"$WIN_PATH\"" >/dev/null 2>&1 || true
  else
    rm -rf "$LINK"
  fi
}

clean_worktree_symlinks() {
  local SIBLING_DIR="$1"
  local MARKER="$SIBLING_DIR/.copilot-session"

  # Skip if session marker exists and is < 1800 seconds old (live session)
  if [ -f "$MARKER" ]; then
    local MARKER_TIME
    MARKER_TIME=$(cat "$MARKER" 2>/dev/null | tr -cd '0-9')
    if [ -n "$MARKER_TIME" ] && [ $((NOW - MARKER_TIME)) -lt 1800 ]; then
      return 0
    fi
    # Marker is stale (crashed session) — remove it before cleaning
    rm -f "$MARKER"
  fi

  remove_symlink "$SIBLING_DIR/node_modules"
}

# Scan all sibling worktrees in the same *.worktrees/ dir, skipping the current one
for SIBLING_DIR in "$PARENT_DIR"/*/; do
  [ -d "$SIBLING_DIR" ] || continue
  # Strip trailing slash for exact comparison
  [[ "${SIBLING_DIR%/}" == "$WORKTREE" ]] && continue
  clean_worktree_symlinks "${SIBLING_DIR%/}"
done

exit 0
