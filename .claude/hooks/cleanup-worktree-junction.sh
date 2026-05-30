#!/bin/bash
# Stop hook: remove node_modules NTFS junction from ephemeral worktree before session ends.
# Targets junctions specifically (created by cmd mklink /J or make_worktree_create).
#
# Junctions ARE followed by recursive-delete tools (PowerShell Remove-Item, git worktree
# remove), unlike directory symlinks which are not. This makes them dangerous when Claude
# Code or the OS cleans up the worktree directory — a live junction would cause the main
# repo's node_modules to be deleted.
#
# Uses `cmd //c rmdir` (non-recursive) so only the junction link is removed, never the
# target contents. Real directories are left untouched (rmdir fails on non-empty dirs).

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

# Fast bail: if node_modules is a symlink (Git Bash reports junctions as plain dirs, only
# real symlinks as links), this hook has nothing to do — cleanup-worktree-symlink.sh handles
# it. Return before the LinkType probe below so we never spawn a powershell/cmd process (each
# flashes a console window) in the common symlink case.
if [ -L "$NM" ]; then
  exit 0
fi

# Only act if the link is an NTFS junction (not a symlink — those are handled by
# cleanup-worktree-symlink.sh). Junctions report LinkType "Junction" via PowerShell.
# Skip the check on non-Windows hosts where junctions cannot exist.
if command -v cygpath &>/dev/null; then
  WIN_NM=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  LINK_TYPE=$(powershell -NoProfile -NonInteractive -Command \
    "(Get-Item -LiteralPath '$WIN_NM' -Force -ErrorAction SilentlyContinue).LinkType" 2>/dev/null || true)
  if [ "$LINK_TYPE" != "Junction" ]; then
    exit 0
  fi
  cmd //c "rmdir \"$WIN_NM\"" >/dev/null 2>&1
fi

exit 0
