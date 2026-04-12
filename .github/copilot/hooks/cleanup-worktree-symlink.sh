#!/bin/bash
# sessionEnd hook: remove node_modules symlink from Copilot worktree when session ends.
# Belt-and-suspenders cleanup — the main protection is that directory symlinks
# (mklink /D) are NOT followed by recursive-delete tools, so even if this hook
# doesn't fire the target is safe.
#
# Claude equivalent: .claude/hooks/cleanup-worktree-symlink.sh

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

NM="$WORKTREE/node_modules"

if [ ! -e "$NM" ] && [ ! -L "$NM" ]; then
  # Remove session marker even if symlink is already gone
  rm -f "$WORKTREE/.copilot-session"
  exit 0
fi

# Non-recursive removal — removes symlinks, fails harmlessly on real dirs
if command -v cygpath &>/dev/null; then
  WIN_PATH=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  cmd //c "rmdir \"$WIN_PATH\"" >/dev/null 2>&1 || true
else
  rm -rf "$NM"
fi

rm -f "$WORKTREE/.copilot-session"

exit 0
