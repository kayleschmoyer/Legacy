#!/bin/bash
# SessionEnd hook: remove node_modules symlink from ephemeral worktree at session end.
# This is a belt-and-suspenders cleanup — the main protection is that directory
# symlinks (mklink /D) are NOT followed by recursive-delete tools, so even if this
# hook doesn't fire (e.g. Claude Code archive), the target is safe.
#
# MUST run on SessionEnd, not Stop: Stop fires after *every* assistant turn, so
# removing node_modules there tears down the symlink mid-session. The next turn's
# build commands (`make pc` → `pnpm exec nx ...`) then fail with "nx not found"
# until a later SessionStart re-links it — an intermittent, hard-to-trace failure.
# SessionEnd fires once, at true session end, so the symlink survives across turns.
#
# Uses `rm -f` for symlinks/junctions and Node fs.rmdirSync as the non-symlink
# fallback — both remove only the link, never the target, and neither spawns a
# console window. Real non-empty directories are left untouched.

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

# Fast path: if node_modules is a symlink (the normal case — the pool resolver
# scripts/modules-pool/link.mjs creates a directory symlink), remove it with plain `rm`. `rm` on a symlink unlinks the link
# itself and never recurses into the target, and — unlike `cmd //c rmdir` — it spawns no
# console window. This is what was flashing a CMD window on every session stop.
if [ -L "$NM" ]; then
  rm -f "$NM" >/dev/null 2>&1
  exit 0
fi

# Fallback for non-symlink links: Node fs.rmdirSync removes a junction (or an empty real
# directory) without following it, and throws harmlessly on non-empty real directories —
# the same semantics as non-recursive `cmd //c rmdir`, but with no console window.
# bash-spawned cmd.exe/powershell.exe each flash a focus-stealing terminal (LS-7892);
# node spawned from a hook does not.
WIN_PATH=$(cygpath -w "$NM" 2>/dev/null || echo "$NM" | sed 's|/d/|D:\\|; s|/|\\|g')
node -e "try{require('fs').rmdirSync(process.argv[1])}catch{}" "$WIN_PATH" >/dev/null 2>&1

exit 0
