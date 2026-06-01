#!/bin/bash
# MCP-server precondition check (LS-3022).
#
# Invoked at the END of setup-worktree-symlink.sh — never registered as a
# standalone SessionStart hook. The previous parallel-hook registration caused
# false-positive "[MCP WARNING] .env.local not found" output because Claude Code
# runs SessionStart hooks concurrently, so the check tested for symlinks while
# setup was still creating them (LS-4505). Sequential invocation eliminates the
# race; no retries or sleeps are needed here.
#
# Can still be invoked ad-hoc for diagnostics: bash .claude/hooks/check-mcp-servers.sh
#
# 7 of the 10 legacy-sports MCP servers use stdio (mcp-bootstrap.mjs → pnpm exec tsx).
# The remaining 3 (jira, github, ci) connect via Streamable HTTP directly to the
# MCP HTTP API Gateways (${MCP_JIRA_URL}, ${MCP_GITHUB_URL}, ${MCP_CI_URL}) with a
# Cognito-issued bearer token; those do not need tsx.
# If node_modules/.bin/tsx is absent, the 7 stdio servers silently time out — the
# agent receives an empty deferred tools list and may fall back to gh/git/make
# without knowing why.  This script surfaces the failure proactively so the agent
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
# Use -f (follows symlinks) rather than "! -f && ! -L" so that a broken symlink
# (pnpm stores binaries as symlinks) also triggers the warning. With "! -L",
# a broken symlink would pass silently: -L is true for any symlink, broken or not.
TSX="$WORKTREE/node_modules/.bin/tsx"
if [ ! -f "$TSX" ]; then
  WARNINGS+=("[MCP WARNING] node_modules/.bin/tsx is missing — all 7 stdio MCP servers will fail to connect silently.")
  if [ "$IS_WORKTREE" = "true" ]; then
    WIN_WT=$(echo "$WORKTREE" | sed 's|/d/|D:\\|; s|/|\\|g' 2>/dev/null || echo "$WORKTREE")
    WIN_MAIN=$(echo "$MAIN_REPO" | sed 's|/d/|D:\\|; s|/|\\|g' 2>/dev/null || echo "$MAIN_REPO")
    WARNINGS+=("  Cause:  node_modules symlink is absent or broken in worktree.")
    WARNINGS+=("  Fix A:  from your terminal → cd \"$WIN_WT\" && node scripts/modules-pool/link.mjs  (links a content-addressable pool slot)")
    WARNINGS+=("  Fix B:  from your terminal → cd \"$WIN_WT\" && make modules-link WT=\"$WIN_WT\"  (directory symlinks require Windows Developer Mode)")
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

# --- 4. MCP machine credential + API Gateway URLs ----------------------------
# The 3 URL-based servers (jira, github, ci) connect via API Gateway HTTP API.
# Auth is the Cognito machine credential (RFC Track A / LS-5094): the
# headersHelper (scripts/mcp-mint-token.mjs) mints a SHORT-LIVED per-connect
# bearer token from the long-lived machine secret. There is no per-session
# expiring MCP_AUTH_TOKEN any more, so there is nothing to warn about
# expiring — we instead verify the machine credential + URLs are present in
# .env.local (written by scripts/mcp-auth.mjs --machine). Because the minted
# token refreshes on every connect, a session of any length stays authed
# without a refresh (RFC AC-G1/AC-G3).
ENV_LOCAL="$WORKTREE/.env.local"

read_env_var() {
  local key="$1"
  grep -m1 "^${key}=" "$ENV_LOCAL" 2>/dev/null | cut -d'=' -f2-
}

if [ -f "$ENV_LOCAL" ]; then
  # Machine credential: client id + secret + Cognito domain (token endpoint).
  # All three are required for the headersHelper to mint a token.
  CRED_MISSING=false
  for CRED_KEY in "MCP_MACHINE_CLIENT_ID" "MCP_MACHINE_CLIENT_SECRET" "MCP_AUTH_COGNITO_DOMAIN"; do
    if [ -z "$(read_env_var "$CRED_KEY")" ]; then
      WARNINGS+=("[MCP WARNING] $CRED_KEY not set in .env.local — jira/github/ci MCP servers cannot mint a token and will fail to connect.")
      CRED_MISSING=true
    fi
  done
  if [ "$CRED_MISSING" = "true" ]; then
    WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs --machine' to provision the machine credential, then restart the session.")
  fi

  # Check that all three API Gateway URLs are populated
  URL_MISSING=false
  for URL_KEY in "MCP_JIRA_URL" "MCP_GITHUB_URL" "MCP_CI_URL"; do
    if [ -z "$(read_env_var "$URL_KEY")" ]; then
      WARNINGS+=("[MCP WARNING] $URL_KEY not set in .env.local — corresponding MCP server will fail to connect.")
      URL_MISSING=true
    fi
  done
  if [ "$URL_MISSING" = "true" ]; then
    WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs --machine' (runs terraform apply first if URLs are missing).")
  fi
else
  WARNINGS+=("[MCP WARNING] .env.local not found — the MCP machine credential and API Gateway URLs are missing.")
  WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs --machine' then restart the session.")
fi

# --- 5. .claude/settings.local.json#/env mirror (LS-4592) -------------------
# When Claude Code is launched from the Claude Desktop GUI app, .env.local is
# NOT sourced — the only way ${MCP_*} substitutions in .mcp.json resolve (and
# the only way the headersHelper can read the machine credential) is through
# settings.local.json#/env. scripts/mcp-auth.mjs mirrors the machine
# credential + URLs there; warn if the mirror is missing or stale.
SETTINGS_LOCAL="$WORKTREE/.claude/settings.local.json"
if [ -f "$SETTINGS_LOCAL" ] && command -v python3 >/dev/null 2>&1; then
  MIRROR_STATUS=$(python3 - "$SETTINGS_LOCAL" <<'PY' 2>/dev/null
import json, sys
required = ['MCP_MACHINE_CLIENT_ID', 'MCP_MACHINE_CLIENT_SECRET', 'MCP_AUTH_COGNITO_DOMAIN', 'MCP_JIRA_URL', 'MCP_GITHUB_URL', 'MCP_CI_URL']
try:
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        data = json.load(f)
except Exception:
    print('UNREADABLE')
    sys.exit(0)
env_block = data.get('env') if isinstance(data, dict) else None
if not isinstance(env_block, dict):
    print('NO_ENV')
    sys.exit(0)
missing = [k for k in required if not env_block.get(k)]
print('MISSING:' + ','.join(missing) if missing else 'OK')
PY
)
  case "$MIRROR_STATUS" in
    OK) ;;
    NO_ENV)
      WARNINGS+=("[MCP WARNING] .claude/settings.local.json has no top-level \"env\" block — Claude Desktop launches will not resolve \${MCP_*} in .mcp.json.")
      WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs --machine' to populate the mirror, then restart the session.")
      ;;
    UNREADABLE)
      WARNINGS+=("[MCP WARNING] .claude/settings.local.json is unreadable or malformed — Claude Desktop launches may fail to resolve \${MCP_*}.")
      WARNINGS+=("  Fix: repair the JSON or remove the file, then run 'node scripts/mcp-auth.mjs --machine'.")
      ;;
    MISSING:*)
      MISSING_KEYS="${MIRROR_STATUS#MISSING:}"
      WARNINGS+=("[MCP WARNING] .claude/settings.local.json#/env is missing required keys: $MISSING_KEYS — Claude Desktop launches will fail to resolve those \${MCP_*}.")
      WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs --machine' to refresh the mirror, then restart the session.")
      ;;
  esac
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
