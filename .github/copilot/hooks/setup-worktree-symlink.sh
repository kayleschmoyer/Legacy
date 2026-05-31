#!/bin/bash
# sessionStart hook: link node_modules for Copilot sibling worktrees
# (<repo>.worktrees/<name>/) to a content-addressable pool slot.
#
# Delegates to scripts/modules-pool/link.mjs — a dependency-free Node resolver
# that hashes the worktree's pnpm-lock.yaml and links node_modules to the
# matching slot under <main>/.modules-pool/<hash>/node_modules, materialising the
# slot on a pool miss. link.mjs auto-detects the sibling-worktree main repo, so
# no path derivation is needed here. On Windows it calls cmd.exe directly via
# execFileSync — no MSYS2 path mangling (LS-3084).
#
# Why directory symlinks (not junctions):
#   `git worktree remove` follows NTFS junctions and recursively deletes the
#   target; directory symlinks (mklink /D) are not followed. Requires Windows
#   Developer Mode.
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

# --- 2. Delegate to the pool resolver ----------------------------------------
# Non-fatal: a SessionStart hook must never block startup. Failures (e.g. node
# missing, Developer Mode off) are surfaced as a warning; check-mcp-servers.sh
# reports the downstream tsx/node_modules symptom.
if ! (cd "$WORKTREE" && node "scripts/modules-pool/link.mjs"); then
  echo "WARNING: scripts/modules-pool/link.mjs failed — node_modules may be missing in $WORKTREE" >&2
  echo "  Directory symlinks require Windows Developer Mode (Settings > System > For Developers)." >&2
fi

# Write session marker so cleanup-orphaned-symlinks can distinguish live vs crashed sessions
date +%s > "$WORKTREE/.copilot-session"
exit 0
