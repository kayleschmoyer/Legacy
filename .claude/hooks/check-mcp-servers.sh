#!/bin/bash
# SessionStart hook: verify MCP server preconditions and emit visible warnings
# when the session is likely to have one or more servers missing (LS-3022).
#
# 7 of the 10 legacy-sports MCP servers use stdio (mcp-bootstrap.mjs → pnpm exec tsx).
# The remaining 3 (jira, github, ci) connect via Streamable HTTP through the local
# signing proxy (localhost:4195-4197); those do not need tsx.
# If node_modules/.bin/tsx is absent, the 7 stdio servers silently time out — the
# agent receives an empty deferred tools list and may fall back to gh/git/make
# without knowing why.  This hook surfaces the failure proactively so the agent
# can report and request a repair rather than proceeding with degraded tooling.
#
# Non-blocking — prints warnings but never fails the session (exits 0).

WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Determine whether this is a native-worktree session and find the main repo.
MAIN_REPO=""
if [[ "$WORKTREE" == *"/.claude/worktrees/"* ]]; then
  MAIN_REPO=$(echo "$WORKTREE" | sed 's|/.claude/worktrees/[^/]*$||')
elif [[ "$(basename "$(dirname "$WORKTREE")")" == *.worktrees ]]; then
  PARENT_DIR=$(dirname "$WORKTREE")
  ROOT_DIR=$(dirname "$PARENT_DIR")
  MAIN_REPO_NAME=$(basename "$PARENT_DIR" | sed 's|\.worktrees$||')
  MAIN_REPO="$ROOT_DIR/$MAIN_REPO_NAME"
fi

IS_WORKTREE=false
if [ -n "$MAIN_REPO" ]; then
  IS_WORKTREE=true
fi

WARNINGS=()

# --- 1. node_modules/.bin/tsx -----------------------------------------------
TSX="$WORKTREE/node_modules/.bin/tsx"
if [ ! -f "$TSX" ] && [ ! -L "$TSX" ]; then
  WARNINGS+=("[MCP WARNING] node_modules/.bin/tsx is missing — all 7 stdio MCP servers will fail to connect silently.")
  if [ "$IS_WORKTREE" = "true" ]; then
    WIN_WT=$(echo "$WORKTREE" | sed 's|/d/|D:\\|; s|/|\\|g' 2>/dev/null || echo "$WORKTREE")
    WIN_MAIN=$(echo "$MAIN_REPO" | sed 's|/d/|D:\\|; s|/|\\|g' 2>/dev/null || echo "$MAIN_REPO")
    WARNINGS+=("  Cause:  node_modules symlink is absent or broken in worktree.")
    WARNINGS+=("  Fix A:  from your terminal → cd \"$WIN_WT\" && node scripts/setup-worktree-node-modules.mjs")
    WARNINGS+=("  Fix B:  from your terminal → cd \"$WIN_WT\" && make install  (independent node_modules, no Developer Mode needed)")
  else
    WARNINGS+=("  Fix:    run 'make install' in the project root, then restart the session.")
  fi
  WARNINGS+=("  After:  restart the Claude Code session — MCP servers only connect at session start.")
fi

# --- 2. .mcp.json present ---------------------------------------------------
if [ ! -f "$WORKTREE/.mcp.json" ]; then
  WARNINGS+=("[MCP WARNING] .mcp.json not found at $WORKTREE — no MCP servers will be registered.")
  WARNINGS+=("  Check that CLAUDE_PROJECT_DIR is set to the correct worktree/repo path.")
fi

# --- 3. mcp-bootstrap.mjs present -------------------------------------------
if [ ! -f "$WORKTREE/.github/copilot/hooks/mcp-bootstrap.mjs" ]; then
  WARNINGS+=("[MCP WARNING] .github/copilot/hooks/mcp-bootstrap.mjs missing — MCP server launch will fail.")
  WARNINGS+=("  Restore it: git checkout main -- .github/copilot/hooks/mcp-bootstrap.mjs")
fi

# --- Emit warnings ----------------------------------------------------------
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo ""
  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│  MCP SERVER HEALTH CHECK — precondition failure(s) detected        │"
  echo "├─────────────────────────────────────────────────────────────────────┤"
  for w in "${WARNINGS[@]}"; do
    echo "  $w"
  done
  echo "└─────────────────────────────────────────────────────────────────────┘"
  echo "  See .agents/skills/mcp-diagnostics/SKILL.md for the full diagnostic checklist."
  echo ""
fi

exit 0
