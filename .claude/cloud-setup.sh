#!/bin/bash
# =============================================================================
# Claude Code on the Web — Cloud Environment Setup Script
# =============================================================================
# Referenced from the cloud environment setup script UI via:
#   source "$HOME/legacy-sports/.claude/cloud-setup.sh"
#
# This runs when a new cloud session is created, AND on every session
# resume (it is registered as a SessionStart hook — see LS-8113). Steps
# are written to be idempotent so re-running is always safe.
# It installs tools that aren't in the default Ubuntu 24.04 image.
#
# This also installs Node.js dependencies (pnpm install) so that
# `make pc` works for code changes, not just docs-only PRs.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Navigate to repo root (cloud env starts in /home/user, not the repo)
# ---------------------------------------------------------------------------
REPO_DIR="$(dirname "$(dirname "$(realpath "${BASH_SOURCE[0]}")")")"
if [ ! -d "$REPO_DIR/.git" ] || [ ! -f "$REPO_DIR/package.json" ]; then
  echo "ERROR: repo root not found at $REPO_DIR (expected .git/ and package.json)"
  exit 1
fi
cd "$REPO_DIR"
echo "=== Legacy Sports cloud setup (repo: $REPO_DIR) ==="

# ---------------------------------------------------------------------------
# Neutralize a git-lfs pre-push hook stub when git-lfs is absent
# ---------------------------------------------------------------------------
# Cloud container images can carry a stock `git lfs install` pre-push hook
# stub even though this repo tracks no LFS files (.gitattributes has no
# filter=lfs entries anywhere) and git-lfs is not installed (gh/git-lfs
# installs were deliberately removed from this script on 2026-07-02, so
# git-lfs will reliably stay absent going forward). The stub blocks the first
# `git push` with "git-lfs not found on your path" even though the push
# contains no LFS content, forcing a --no-verify retry (LS-7773). Neutralize
# it here — this script re-runs on every SessionStart (LS-8113), so it also
# self-heals a session where the stub reappears after a resume. Only the
# stub is touched: this repo's own .github/hooks/pre-push (installed by
# `make setup-hooks`) never references git-lfs and is left alone.
hooks_dir="$(git rev-parse --git-path hooks 2>/dev/null || echo "$REPO_DIR/.git/hooks")"
# Match the stock `git lfs install` stub's distinctive wording, not just any
# mention of "git-lfs" — a hook that merely references git-lfs elsewhere
# (e.g. in a comment) should not be neutralized.
if [ -f "$hooks_dir/pre-push" ] && ! command -v git-lfs &>/dev/null && grep -qi "configured for git lfs" "$hooks_dir/pre-push" 2>/dev/null; then
  # -n (no-clobber): never overwrite an existing disabled-stub file. The `if`
  # guard also means a failed mv (unwritable hooks dir, race, etc.) only warns
  # here instead of aborting the rest of this script under `set -e`.
  if mv -n "$hooks_dir/pre-push" "$hooks_dir/pre-push.disabled-lfs-stub" 2>/dev/null; then
    echo "Neutralized stale git-lfs pre-push hook stub at $hooks_dir/pre-push (git-lfs absent, repo has no LFS files) — moved to pre-push.disabled-lfs-stub"
  else
    echo "WARNING: found a git-lfs pre-push hook stub at $hooks_dir/pre-push but could not neutralize it (mv failed — hooks dir may be read-only, or pre-push.disabled-lfs-stub already exists). git push may require --no-verify."
  fi
fi

# ---------------------------------------------------------------------------
# Deepen the shallow clone so origin/main merge-base exists
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
# Install Node.js dependencies
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
# Export GITHUB_REPO_OWNER / GITHUB_REPO_NAME for the github-server MCP
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

echo "=== Cloud setup complete (merge-base, pnpm deps, GitHub repo identity) ==="
