#!/bin/bash
# SessionEnd hook: remove node_modules NTFS junction from ephemeral worktree at session end.
# Targets junctions specifically (created by cmd mklink /J or make_worktree_create).
#
# Runs on SessionEnd (not Stop) for the same reason as cleanup-worktree-symlink.sh:
# Stop fires per-turn, so tearing down node_modules there breaks the next turn's
# build commands. This hook already bails on symlinks (the normal case), but keeping
# both cleanups on the same event avoids splitting teardown across hook lifecycles.
#
# Junctions ARE followed by recursive-delete tools (PowerShell Remove-Item, git worktree
# remove), unlike directory symlinks which are not. This makes them dangerous when Claude
# Code or the OS cleans up the worktree directory — a live junction would cause the main
# repo's node_modules to be deleted.
#
# Uses Node fs.rmdirSync (non-recursive) so only the junction link is removed, never
# the target contents. Real directories are left untouched.

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

# Defensive branch: current Git Bash reports junctions as symlinks (-L), so they are
# normally caught by the fast bail above. On MSYS2 builds where a junction shows up as
# a plain directory instead, probe and remove it via Node — fs.lstatSync reports
# junctions as symbolic links and fs.rmdirSync removes only the link, never the target.
# Real directories fail the isSymbolicLink check and are left untouched. Node spawns no
# console window; the previous powershell LinkType probe + cmd rmdir each flashed a
# focus-stealing terminal on session end (LS-7892).
# Skip on non-Windows hosts where junctions cannot exist.
if command -v cygpath &>/dev/null; then
  WIN_NM=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
  node -e "const fs=require('fs');const p=process.argv[1];try{if(fs.lstatSync(p).isSymbolicLink())fs.rmdirSync(p)}catch{}" "$WIN_NM" >/dev/null 2>&1
fi

exit 0
