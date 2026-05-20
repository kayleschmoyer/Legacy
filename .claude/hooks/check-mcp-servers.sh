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

# --- 4. MCP auth token + API Gateway URLs ------------------------------------
# The 3 URL-based servers (jira, github, ci) now connect via API Gateway HTTP
# API using an IAM Identity Center OIDC JWT. The token and URLs must be present
# in .env.local (written by scripts/mcp-auth.mjs). Check both.
ENV_LOCAL="$WORKTREE/.env.local"

read_env_var() {
  local key="$1"
  grep -m1 "^${key}=" "$ENV_LOCAL" 2>/dev/null | cut -d'=' -f2-
}

if [ -f "$ENV_LOCAL" ]; then
  MCP_TOKEN=$(read_env_var "MCP_AUTH_TOKEN")
  MCP_EXPIRES=$(read_env_var "MCP_AUTH_EXPIRES_AT")

  if [ -z "$MCP_TOKEN" ]; then
    WARNINGS+=("[MCP WARNING] MCP_AUTH_TOKEN not set in .env.local — jira/github/ci MCP servers will fail to connect.")
    WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs --setup' (first time) or 'node scripts/mcp-auth.mjs' (refresh).")
  else
    # Check expiry using Python (available on Windows + Linux; avoids base64 cross-platform quirks)
    NOW=$(date +%s)
    TOKEN_EXP=""
    if [ -n "$MCP_EXPIRES" ]; then
      TOKEN_EXP="$MCP_EXPIRES"
    else
      TOKEN_EXP=$(python3 -c "
import base64, json, sys
try:
    token = '${MCP_TOKEN}'.split('.')
    pad = token[1] + '=' * ((4 - len(token[1]) % 4) % 4)
    print(json.loads(base64.urlsafe_b64decode(pad)).get('exp', 0))
except Exception:
    print(0)
" 2>/dev/null)
    fi

    if [ -n "$TOKEN_EXP" ] && [ "$TOKEN_EXP" -gt 0 ] 2>/dev/null; then
      SECS_LEFT=$((TOKEN_EXP - NOW))
      if [ "$SECS_LEFT" -lt 0 ]; then
        WARNINGS+=("[MCP WARNING] MCP_AUTH_TOKEN has expired — jira/github/ci MCP servers will return 401.")
        WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs' to refresh the token, then restart the session.")
      elif [ "$SECS_LEFT" -lt 900 ]; then
        MINS_LEFT=$((SECS_LEFT / 60))
        WARNINGS+=("[MCP WARNING] MCP_AUTH_TOKEN expires in ${MINS_LEFT} minutes — consider refreshing soon.")
        WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs' then restart the session.")
      fi
    fi
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
    WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs' (runs terraform apply first if URLs are missing).")
  fi
else
  WARNINGS+=("[MCP WARNING] .env.local not found — MCP_AUTH_TOKEN and API Gateway URLs are missing.")
  WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs --setup' then restart the session.")
fi

# --- 5. .claude/settings.local.json#/env mirror (LS-4592) -------------------
# When Claude Code is launched from the Claude Desktop GUI app, .env.local is
# NOT sourced — the only way ${MCP_*} substitutions in .mcp.json resolve is
# through settings.local.json#/env. scripts/mcp-auth.mjs mirrors the 4 MCP_*
# vars there; warn if the mirror is missing or stale.
SETTINGS_LOCAL="$WORKTREE/.claude/settings.local.json"
if [ -f "$SETTINGS_LOCAL" ] && command -v python3 >/dev/null 2>&1; then
  MIRROR_STATUS=$(python3 - "$SETTINGS_LOCAL" <<'PY' 2>/dev/null
import json, sys
required = ['MCP_AUTH_TOKEN', 'MCP_JIRA_URL', 'MCP_GITHUB_URL', 'MCP_CI_URL']
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
      WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs' to populate the mirror, then restart the session.")
      ;;
    UNREADABLE)
      WARNINGS+=("[MCP WARNING] .claude/settings.local.json is unreadable or malformed — Claude Desktop launches may fail to resolve \${MCP_*}.")
      WARNINGS+=("  Fix: repair the JSON or remove the file, then run 'node scripts/mcp-auth.mjs'.")
      ;;
    MISSING:*)
      MISSING_KEYS="${MIRROR_STATUS#MISSING:}"
      WARNINGS+=("[MCP WARNING] .claude/settings.local.json#/env is missing required keys: $MISSING_KEYS — Claude Desktop launches will fail to resolve those \${MCP_*}.")
      WARNINGS+=("  Fix: run 'node scripts/mcp-auth.mjs' to refresh the mirror, then restart the session.")
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
