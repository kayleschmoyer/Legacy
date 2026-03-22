#!/bin/bash
# =============================================================================
# Claude Code on the Web — Cloud Environment Setup Script
# =============================================================================
# Paste this script into the "Setup script" field in Claude Code's cloud
# environment settings UI (Settings → Environment → Setup script).
#
# This runs ONCE when a new cloud session is created (not on resume).
# It installs tools that aren't in the default Ubuntu 24.04 image.
#
# This also installs Node.js dependencies (pnpm install) so that
# `make pc` works for code changes, not just docs-only PRs.
# =============================================================================

set -euo pipefail

echo "=== Legacy Sports cloud setup ==="

# ---------------------------------------------------------------------------
# 1. Install GitHub CLI (gh)
# ---------------------------------------------------------------------------
# The legacy-sports-github MCP server has a built-in OAuth device flow and
# does NOT require gh to be installed. However, gh is useful for:
#   - Ad-hoc git operations (gh pr view, gh run list)
#   - Fallback if MCP server is unavailable
#   - Scripts that shell out to gh
#
# If gh is already present (e.g., devcontainer image), skip installation.
if ! command -v gh &>/dev/null; then
  echo "Installing GitHub CLI..."
  apt-get update -qq && apt-get install -y -qq gh 2>&1 | tail -1
  echo "gh $(gh --version | head -1) installed"
else
  echo "gh already installed: $(gh --version | head -1)"
fi

# ---------------------------------------------------------------------------
# 2. Generate GitHub App token (if private key is available)
# ---------------------------------------------------------------------------
# The Agent Author GitHub App (ID 3158619) provides scoped, short-lived
# tokens for PR creation. Set AGENT_AUTHOR_APP_PRIVATE_KEY in Claude Code
# cloud environment settings (Settings > Environment) to enable this.
#
# The token is exported as GH_TOKEN so the legacy-sports-github MCP server
# and gh CLI both pick it up automatically.
if [ -n "${AGENT_AUTHOR_APP_PRIVATE_KEY:-}" ]; then
  echo "Generating GitHub App installation token..."
  GEN_STDERR=$(mktemp)
  if APP_TOKEN=$(node scripts/generate-github-app-token.mjs 2>"$GEN_STDERR"); then
    export GH_TOKEN="$APP_TOKEN"
    if [ -n "${GITHUB_ENV:-}" ]; then
      echo "GH_TOKEN=$GH_TOKEN" >> "$GITHUB_ENV" 2>/dev/null || true
    fi
    echo "GitHub App token: generated (expires in 1 hour)"
  else
    echo "WARNING: GitHub App token generation failed; falling back to env var or device flow"
    cat "$GEN_STDERR" 2>/dev/null || true
  fi
  rm -f "$GEN_STDERR"
fi

# ---------------------------------------------------------------------------
# 3. Authenticate gh CLI
# ---------------------------------------------------------------------------
# Uses GH_TOKEN (from step 2 or pre-set env var) to authenticate the gh CLI.
# The MCP server also handles its own auth via the 5-tier fallback chain
# (see tools/mcp/github-server/src/auth.ts).
if [ -n "${GH_TOKEN:-}" ]; then
  if echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null; then
    echo "gh auth: authenticated via GH_TOKEN"
  else
    echo "gh auth: WARNING — failed to authenticate via GH_TOKEN; MCP server/device flow will be used instead"
  fi
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  if echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null; then
    echo "gh auth: authenticated via GITHUB_TOKEN"
  else
    echo "gh auth: WARNING — failed to authenticate via GITHUB_TOKEN; MCP server/device flow will be used instead"
  fi
else
  echo "gh auth: no token set — MCP server will use device flow on first use"
fi

# ---------------------------------------------------------------------------
# 4. Install Git LFS (for dev-seed.dump)
# ---------------------------------------------------------------------------
if ! command -v git-lfs &>/dev/null && ! git lfs version &>/dev/null 2>&1; then
  echo "Installing Git LFS..."
  apt-get update -qq && apt-get install -y -qq git-lfs 2>&1 | tail -1
fi
git lfs install --skip-smudge >/dev/null 2>&1 || true
echo "Git LFS: $(git lfs version 2>/dev/null | head -1 || echo 'installed')"

# ---------------------------------------------------------------------------
# 5. Install Node.js dependencies
# ---------------------------------------------------------------------------
# Required for `make pc` (lint, typecheck, test, build) on code changes.
# Uses corepack to activate the correct pnpm version, then installs deps.
if command -v corepack &>/dev/null; then
  corepack enable
  corepack prepare pnpm@9.12.1 --activate 2>/dev/null || true
  echo "pnpm $(pnpm --version 2>/dev/null || echo 'unknown') activated"
else
  echo "WARNING: corepack not found — skipping pnpm install"
fi

if command -v pnpm &>/dev/null; then
  echo "Installing dependencies (pnpm install)..."
  pnpm install --frozen-lockfile 2>&1 | tail -3
  echo "Dependencies installed"
else
  echo "WARNING: pnpm not available — make pc will not work for code changes"
fi

echo "=== Cloud setup complete ==="
