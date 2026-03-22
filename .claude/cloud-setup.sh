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
# For full environment setup (database, dependencies, etc.), see
# copilot-setup-steps.yml — those steps must be run manually or via
# a SessionStart hook in cloud sessions.
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
# 2. Authenticate gh CLI (optional — only if GH_TOKEN is set)
# ---------------------------------------------------------------------------
# The MCP server handles its own auth via the 5-tier fallback chain
# (see tools/mcp/github-server/src/auth.ts). This step authenticates
# the gh CLI for direct shell usage.
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
# 3. Install Git LFS (for dev-seed.dump)
# ---------------------------------------------------------------------------
if ! command -v git-lfs &>/dev/null && ! git lfs version &>/dev/null 2>&1; then
  echo "Installing Git LFS..."
  apt-get update -qq && apt-get install -y -qq git-lfs 2>&1 | tail -1
fi
git lfs install --skip-smudge >/dev/null 2>&1 || true
echo "Git LFS: $(git lfs version 2>/dev/null | head -1 || echo 'installed')"

echo "=== Cloud setup complete ==="
