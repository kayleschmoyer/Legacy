#!/bin/bash
# sessionStart hook: validate and recreate the node_modules symlink for
# Copilot worktrees (<repo>.worktrees/<name>/).
#
# Mirrors the logic of .claude/hooks/setup-worktree-symlink.sh but guards on
# the *.worktrees/<name> sibling directory pattern instead of .claude/worktrees/.
#
# Why symlinks (not junctions):
#   Directory symlinks (mklink /D on Windows) are NOT followed by recursive-delete
#   tools. When a worktree directory is deleted, only the link is removed — the
#   target node_modules in the main repo is left intact.
#
# Worktree path pattern this script guards:
#   <root>/<repo>.worktrees/<name>/   (e.g. /d/code/legacy-sports.worktrees/agents-foo/)
#
# Claude equivalent: .claude/hooks/setup-worktree-symlink.sh

set -euo pipefail

WORKTREE="${COPILOT_PROJECT_DIR:-$(pwd)}"

# --- 1. Guard: only act inside *.worktrees/<name> directories ----------------
PARENT_DIR=$(dirname "$WORKTREE")
PARENT_NAME=$(basename "$PARENT_DIR")

if [[ "$PARENT_NAME" != *.worktrees ]]; then
  # Not a sibling worktree — nothing to do.
  exit 0
fi

# --- 2. Derive main repo path from the .worktrees parent --------------------
ROOT_DIR=$(dirname "$PARENT_DIR")
MAIN_REPO_NAME="${PARENT_NAME%.worktrees}"
MAIN_REPO="$ROOT_DIR/$MAIN_REPO_NAME"
MAIN_NM="$MAIN_REPO/node_modules"

if [ ! -d "$MAIN_NM" ]; then
  echo "WARNING: Main repo node_modules not found at: $MAIN_NM" >&2
  echo "  Run 'make install' in the main repo first." >&2
  exit 0
fi

# --- 3. Check if symlink already exists and is healthy ----------------------
NM="$WORKTREE/node_modules"
BIN="$NM/.bin"

needs_recreate=false

if [ ! -e "$NM" ] && [ ! -L "$NM" ]; then
  needs_recreate=true
elif [ ! -d "$BIN" ] || [ -z "$(ls -A "$BIN" 2>/dev/null | head -c1)" ]; then
  # .bin missing or empty — stale/broken link
  needs_recreate=true
fi

if [ "$needs_recreate" = "false" ]; then
  echo "node_modules symlink is healthy at: $NM"
  # Refresh session marker
  date +%s > "$WORKTREE/.copilot-session"
  exit 0
fi

# --- 4. Remove any existing stale/broken entry (non-recursive, safe) --------
if [ -e "$NM" ] || [ -L "$NM" ]; then
  if command -v cygpath &>/dev/null; then
    # Git-bash / MSYS2 on Windows — use cmd rmdir (non-recursive, safe for symlinks)
    WIN_NM=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
    cmd //c "rmdir \"$WIN_NM\"" >/dev/null 2>&1 || true
  else
    rm -rf "$NM"
  fi
fi

# --- 5. Recreate as directory symlink ----------------------------------------
if command -v cygpath &>/dev/null; then
  # Windows (git-bash): use mklink /D for a true directory symlink
  WIN_NM=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  WIN_MAIN_NM=$(cygpath -w "$MAIN_NM" 2>/dev/null || echo "$MAIN_NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  cmd //c "mklink /D \"$WIN_NM\" \"$WIN_MAIN_NM\"" >/dev/null 2>&1 || true

  # Verify; fall back to PowerShell if cmd mklink failed
  if [ ! -d "$NM" ]; then
    powershell -NoProfile -NonInteractive -Command \
      "New-Item -ItemType SymbolicLink -Path '$WIN_NM' -Target '$WIN_MAIN_NM'" \
      >/dev/null 2>&1 || true
  fi

  if [ ! -d "$NM" ]; then
    echo "WARNING: Failed to create node_modules symlink in worktree." >&2
    echo "  Directory symlinks require Windows Developer Mode to be enabled." >&2
    echo "  Enable it: Settings > System > For Developers > Developer Mode" >&2
    exit 1
  fi
else
  # Linux / macOS: standard ln -s
  ln -s "$MAIN_NM" "$NM"
fi

echo "node_modules symlink created: $NM  -->  $MAIN_NM"
# Write session marker so cleanup-orphaned-symlinks can distinguish live vs crashed sessions
date +%s > "$WORKTREE/.copilot-session"
exit 0
