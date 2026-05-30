#!/bin/bash
# Stop hook: remove node_modules symlink from ephemeral worktree before session ends.
# This is a belt-and-suspenders cleanup — the main protection is that directory
# symlinks (mklink /D) are NOT followed by recursive-delete tools, so even if this
# hook doesn't fire (e.g. Claude Code archive), the target is safe.
#
# Uses `cmd //c rmdir` (non-recursive) which safely removes symlinks without
# touching the target. Real directories are left untouched.
# cmd rmdir succeeds for symlinks and fails harmlessly on non-empty real dirs.

WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Only act inside known ephemeral worktrees (Claude Code or Copilot/twig)
PARENT_DIR=$(dirname "$WORKTREE")
PARENT_NAME=$(basename "$PARENT_DIR")

if [[ "$WORKTREE" != *"/.claude/worktrees/"* ]] && [[ "$PARENT_NAME" != *.worktrees ]]; then
  exit 0
fi

NM="$WORKTREE/node_modules"

if [ ! -e "$NM" ] && [ ! -L "$NM" ]; then
  exit 0
fi

# Fast path: if node_modules is a symlink (the normal case — setup-worktree-node-modules.mjs
# creates a directory symlink), remove it with plain `rm`. `rm` on a symlink unlinks the link
# itself and never recurses into the target, and — unlike `cmd //c rmdir` — it spawns no
# console window. This is what was flashing a CMD window on every session stop.
if [ -L "$NM" ]; then
  rm -f "$NM" >/dev/null 2>&1
  exit 0
fi

# Fallback for non-symlink links (e.g. NTFS junctions): non-recursive cmd rmdir removes the
# link without touching the target. This branch still spawns a brief console window, but it is
# only reached for junctions, which the setup script no longer creates.
WIN_PATH=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
cmd //c "rmdir \"$WIN_PATH\"" >/dev/null 2>&1

exit 0
