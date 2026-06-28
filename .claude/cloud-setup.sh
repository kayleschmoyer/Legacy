#!/bin/bash
# =============================================================================
# Claude Code on the Web — Cloud Environment Setup Script
# =============================================================================
# Referenced from the cloud environment setup script UI via:
#   source "$HOME/legacy-sports/.claude/cloud-setup.sh"
#
# This runs ONCE when a new cloud session is created (not on resume).
# It installs tools that aren't in the default Ubuntu 24.04 image.
#
# This also installs Node.js dependencies (pnpm install) so that
# `make pc` works for code changes, not just docs-only PRs.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# 0. Navigate to repo root (cloud env starts in /home/user, not the repo)
# ---------------------------------------------------------------------------
REPO_DIR="$(dirname "$(dirname "$(realpath "${BASH_SOURCE[0]}")")")"
if [ ! -d "$REPO_DIR/.git" ] || [ ! -f "$REPO_DIR/package.json" ]; then
  echo "ERROR: repo root not found at $REPO_DIR (expected .git/ and package.json)"
  exit 1
fi
cd "$REPO_DIR"
echo "=== Legacy Sports cloud setup (repo: $REPO_DIR) ==="

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
# 2. Authenticate gh CLI (if a token is already available)
# ---------------------------------------------------------------------------
# The legacy-sports-github MCP server handles GitHub App token generation
# natively when AGENT_AUTHOR_APP_PRIVATE_KEY is set (see auth.ts). This
# step only authenticates the gh CLI for ad-hoc use outside the MCP server.
if [ -n "${GH_TOKEN:-}" ]; then
  if echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null; then
    echo "gh auth: authenticated via GH_TOKEN"
  else
    echo "gh auth: WARNING — failed to authenticate via GH_TOKEN; MCP server will handle auth natively"
  fi
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  if echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null; then
    echo "gh auth: authenticated via GITHUB_TOKEN"
  else
    echo "gh auth: WARNING — failed to authenticate via GITHUB_TOKEN; MCP server will handle auth natively"
  fi
elif [ -n "${AGENT_AUTHOR_APP_PRIVATE_KEY:-}" ]; then
  echo "gh auth: AGENT_AUTHOR_APP_PRIVATE_KEY is set — MCP server will generate GitHub App tokens on demand"
else
  echo "gh auth: no token set — MCP server will use device flow on first use"
fi

# ---------------------------------------------------------------------------
# 3. Install git-lfs (required by pre-push hook)
# ---------------------------------------------------------------------------
# The repo's pre-push hook requires git-lfs on PATH — every push fails with
# exit 2 when it is absent. apt-get install git-lfs silently no-ops when PPAs
# return 403 (LS-8199), so we verify the binary after apt and fall back to the
# static binary from GitHub releases if apt failed to deliver it.
_install_git_lfs_from_github() {
  local version="3.6.1"
  local url="https://github.com/git-lfs/git-lfs/releases/download/v${version}/git-lfs-linux-amd64-v${version}.tar.gz"
  local tmp
  tmp="$(mktemp -d)"
  echo "git-lfs: apt did not install binary; downloading v${version} from GitHub releases..."
  if curl -fsSL --retry 3 "$url" | tar -xz -C "$tmp"; then
    mkdir -p "$HOME/bin"
    find "$tmp" -name "git-lfs" -type f -exec cp {} "$HOME/bin/git-lfs" \;
    chmod +x "$HOME/bin/git-lfs"
    export PATH="$HOME/bin:$PATH"
    echo "git-lfs: installed to ~/bin/git-lfs from GitHub releases"
  else
    echo "ERROR: git-lfs: failed to download fallback binary from GitHub releases" >&2
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
}

echo "Installing git-lfs..."
apt-get update -qq 2>&1 | tail -1
apt-get install -y -qq git-lfs 2>&1 | tail -1 || true

if ! command -v git-lfs >/dev/null 2>&1 || ! git lfs version >/dev/null 2>&1; then
  _install_git_lfs_from_github
fi

if command -v git-lfs >/dev/null 2>&1 && git lfs version >/dev/null 2>&1; then
  git lfs install --skip-smudge --force 2>/dev/null || true
  echo "Git LFS: $(git lfs version)"
else
  echo "ERROR: git-lfs installation failed — git push will be blocked by the pre-push hook." >&2
  echo "  Remediation: manually download git-lfs from https://github.com/git-lfs/git-lfs/releases" >&2
  echo "  and place the binary in ~/bin/ (already on PATH), then run: git lfs install" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Deepen the shallow clone so origin/main merge-base exists
# ---------------------------------------------------------------------------
# Cloud sessions start with a shallow clone. Without shared history,
# `git diff origin/main...HEAD` fails with "no merge base", causing make pc
# to fall back to whole-repo validation (slow + false format failures).
# Fetching enough history ensures classify-changes.js can scope the run.
if git rev-parse --is-shallow-repository 2>/dev/null | grep -q '^true$'; then
  echo "Shallow clone detected — deepening to establish merge-base with origin/main..."
  # --deepen=200 covers typical PR depths without fetching the full history.
  # Fall back to --unshallow if the branch history is unusually deep.
  if git fetch --deepen=200 origin main 2>&1 | tail -1; then
    if git merge-base origin/main HEAD >/dev/null 2>&1; then
      echo "Merge-base established: $(git merge-base origin/main HEAD | head -c 12)"
    else
      echo "Deepen insufficient — attempting --unshallow..."
      git fetch --unshallow origin 2>&1 | tail -1 || echo "WARNING: --unshallow failed; make pc will use whole-repo fail-safe"
      git merge-base origin/main HEAD >/dev/null 2>&1 \
        && echo "Merge-base established after unshallow" \
        || echo "WARNING: merge-base still unavailable; make pc will use whole-repo fail-safe"
    fi
  else
    echo "WARNING: git fetch --deepen=200 failed; make pc will use whole-repo fail-safe"
  fi
else
  echo "Full clone detected — merge-base check skipped"
fi

# ---------------------------------------------------------------------------
# 5. Install Node.js dependencies
# ---------------------------------------------------------------------------
# Required for `make pc` (lint, typecheck, test, build) on code changes.
# Uses corepack to activate the correct pnpm version, then installs deps.
#
# Fast-path: skip install if node_modules/.bin/tsx is already present and
# executable. This makes the script safe to re-run on every SessionStart
# without incurring the full ~60s install cost when deps are already complete.
# (LS-8113: cloud sessions start with an incomplete node_modules; this script
# is also registered as a SessionStart hook so it runs on every session start.)
TSX_BIN="$REPO_DIR/node_modules/.bin/tsx"
if [ -f "$TSX_BIN" ] && [ -x "$TSX_BIN" ]; then
  echo "node_modules/.bin/tsx present — skipping pnpm install (dependencies already complete)"
else
  if command -v corepack &>/dev/null; then
    corepack enable
    corepack prepare pnpm@9.12.1 --activate 2>/dev/null || true
    echo "pnpm $(pnpm --version 2>/dev/null || echo 'unknown') activated"
  else
    echo "WARNING: corepack not found — skipping pnpm install"
  fi

  if command -v pnpm &>/dev/null; then
    echo "node_modules/.bin/tsx absent — installing dependencies (LS-8113)..."
    pnpm install --frozen-lockfile 2>&1 | tail -5
    # Verify tsx is now present; warn if still missing so the agent can triage.
    if [ -f "$TSX_BIN" ] && [ -x "$TSX_BIN" ]; then
      echo "Dependencies installed — node_modules/.bin/tsx confirmed present"
    else
      echo "WARNING: pnpm install completed but node_modules/.bin/tsx is still absent"
      echo "  MCP stdio servers may not connect. Run 'pnpm install' manually and restart."
    fi
  else
    echo "WARNING: pnpm not available — make pc will not work for code changes"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Export GITHUB_REPO_OWNER / GITHUB_REPO_NAME for the github-server MCP
# ---------------------------------------------------------------------------
# In cloud sessions, git remote URLs may be proxy URLs that don't expose the
# real GitHub owner/repo. These env vars let the MCP server skip remote
# parsing entirely, avoiding "Could not parse GitHub owner/repo" errors.
if [ -z "${GITHUB_REPO_OWNER:-}" ] && [ -z "${GITHUB_REPO_NAME:-}" ]; then
  if [ -n "${GITHUB_REPOSITORY:-}" ]; then
    # Standard GitHub Actions env var: "owner/repo"
    export GITHUB_REPO_OWNER="${GITHUB_REPOSITORY%%/*}"
    export GITHUB_REPO_NAME="${GITHUB_REPOSITORY#*/}"
    echo "GitHub repo identity: ${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME} (from GITHUB_REPOSITORY)"
  else
    echo "Note: GITHUB_REPO_OWNER/GITHUB_REPO_NAME not set — MCP server will parse git remote URL"
  fi
fi

echo "=== Cloud setup complete (gh, pnpm, git-lfs, GitHub repo identity) ==="
