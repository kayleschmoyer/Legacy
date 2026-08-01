#!/bin/bash
# SessionStart hook: remove orphaned node_modules symlinks left by crashed sessions.
#
# The Stop hook (cleanup-worktree-symlink.sh) removes the node_modules symlink
# when a session ends cleanly. But if a session crashes, the hook never runs and
# the symlink persists. A later git worktree remove can then follow the link
# and corrupt the main repo's node_modules.
#
# This hook runs at SessionStart and scans two worktree locations:
#   1. Sibling ephemeral worktrees under .claude/worktrees/ (Claude Code sessions)
#   2. Sibling agent worktrees under the repo's worktrees parent dir (agents-*)
#      These are created by make wt-setup for GitHub Copilot coding agent tasks and
#      are at risk when VS Code archives an agent session — the extension may delete
#      the worktree directory recursively, following the link into the main repo.
#
# rm -f (symlinks/junctions) and Node fs.rmdirSync (empty real directories) remove
# only the link or empty dir and fail harmlessly on non-empty real directories. So a
# full independent install in a sibling worktree is safe; only symlinks and empty
# dirs are removed. Neither spawns a console window (LS-7892).
#
# Active-session protection: setup-worktree-symlink.sh (also a SessionStart hook,
# runs first) writes a .claude-session marker with the current epoch. Sibling
# worktrees whose marker is < 30 minutes old are skipped. Stale markers (crashed
# sessions older than 30 minutes) are removed before the symlink is cleaned up.
# For Copilot agents-* worktrees, .github/copilot/hooks/setup-worktree-symlink.sh
# writes a .copilot-session marker instead; the agents-* scan passes that name.

WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Only act inside Claude Code ephemeral worktrees
if [[ "$WORKTREE" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

remove_symlink() {
  local J="$1"
  local WIN_PATH
  [ -e "$J" ] || [ -L "$J" ] || return 0
  if [ -L "$J" ]; then
    # Git Bash reports both symlinks and junctions as -L; rm unlinks the link itself
    # without following it and spawns no console window — `cmd //c rmdir` flashed a
    # focus-stealing terminal per orphan (LS-7892).
    rm -f "$J" 2>/dev/null
  else
    # Empty real directories (the other case cmd rmdir used to handle): Node
    # fs.rmdirSync removes empty dirs and links only, throws harmlessly on
    # non-empty real directories, and spawns no console window.
    WIN_PATH=$(cygpath -w "$J" 2>/dev/null || echo "$J" | sed 's|/d/|D:\\|; s|/|\\|g')
    node -e "try{require('fs').rmdirSync(process.argv[1])}catch{}" "$WIN_PATH" >/dev/null 2>&1
  fi
  # Verify removal succeeded by checking the path no longer exists
  if [ ! -e "$J" ] && [ ! -L "$J" ]; then
    return 0
  fi
  printf 'Warning: failed to remove symlink "%s"; path still exists after removal attempt.\n' "$J" >&2
}

# Remove all symlinks in a worktree directory, respecting the session marker.
# Symlinks created by make wt-setup: node_modules, .twig, certs, .github/skills
# Optional third arg: marker file name to check for live sessions (default: .claude-session).
# Copilot agents-* worktrees use .copilot-session; Claude Code worktrees use .claude-session.
clean_worktree_symlinks() {
  local WORKTREE_DIR="$1"
  local NOW="$2"
  local MARKER_NAME="${3:-.claude-session}"

  # Skip if a live session marker exists and is < 1800 seconds old
  local MARKER="$WORKTREE_DIR/$MARKER_NAME"
  if [ -f "$MARKER" ]; then
    # Strip non-numeric chars (BOM, whitespace) in case the marker was written by
    # PowerShell without -Encoding ascii (UTF-16LE produces a BOM that breaks arithmetic)
    local MARKER_TIME
    MARKER_TIME=$(cat "$MARKER" 2>/dev/null | tr -cd '0-9')
    if [ -n "$MARKER_TIME" ] && [ $((NOW - MARKER_TIME)) -lt 1800 ]; then
      return 0
    fi
    # Marker is stale (crashed session) — remove it before cleaning the symlinks
    rm -f "$MARKER"
  fi

  for link_name in node_modules .twig certs .github/skills; do
    remove_symlink "$WORKTREE_DIR/$link_name"
  done
}

NOW=$(date +%s)

# 1. Scan sibling ephemeral worktrees (.claude/worktrees/*)
# Skip the current session's own directory — it is always active so its
# symlinks should never be removed by this script.
CLAUDE_WORKTREES_DIR=$(dirname "$WORKTREE")
for SIBLING_DIR in "$CLAUDE_WORKTREES_DIR"/*/; do
  [ -d "$SIBLING_DIR" ] || continue
  # Strip trailing slash for exact comparison
  [[ "${SIBLING_DIR%/}" == "$WORKTREE" ]] && continue
  clean_worktree_symlinks "$SIBLING_DIR" "$NOW"
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
    # Copilot agents-* worktrees use .copilot-session (written by setup-worktree-symlink.sh
    # in .github/copilot/hooks/), not .claude-session.
    clean_worktree_symlinks "${SIBLING_DIR%/}" "$NOW" ".copilot-session"
  done
fi

exit 0
