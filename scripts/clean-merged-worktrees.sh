#!/usr/bin/env bash
# Detect worktrees whose PRs have been merged and clean them up via twig.
# Usage: ./scripts/clean-merged-worktrees.sh [--dry-run]
#
# Key constraint: NEVER uses `git worktree remove` directly — always goes
# through `twig worktree clean` to preserve junctions.

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

# Ensure twig is available
if ! command -v twig &>/dev/null; then
  echo "ERROR: twig is not installed. Install it with: cargo install twig-cli" >&2
  exit 1
fi

# Ensure gh CLI is available
if ! command -v gh &>/dev/null; then
  echo "ERROR: gh CLI is not installed. Install it from https://cli.github.com/" >&2
  exit 1
fi

# Ensure gh CLI is authenticated and can access the current repository
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh CLI is not authenticated or cannot access the current repository. Run 'gh auth login' and try again." >&2
  exit 1
fi

# Get the main repo root (git-common-dir points to the shared .git)
COMMON_DIR=$(git rev-parse --git-common-dir)
if [[ "$COMMON_DIR" == ".git" ]]; then
  MAIN_REPO=$(pwd)
else
  MAIN_REPO=$(dirname "$COMMON_DIR")
fi

cleaned=0
skipped=0

echo ""
echo "=== Merged Worktree Cleanup ==="
echo "Scanning worktrees for merged PRs..."
echo ""

# Parse worktree list in porcelain format
current_path=""
current_branch=""

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^worktree\ (.+)$ ]]; then
    current_path="${BASH_REMATCH[1]}"
    current_branch=""
  elif [[ "$line" =~ ^branch\ refs/heads/(.+)$ ]]; then
    current_branch="${BASH_REMATCH[1]}"
  elif [[ -z "$line" ]]; then
    # End of a worktree entry — process it
    if [[ -z "$current_branch" || -z "$current_path" ]]; then
      current_path=""
      current_branch=""
      continue
    fi

    # Skip the main repo worktree
    normalized_path=$(cd "$current_path" 2>/dev/null && pwd || echo "$current_path")
    normalized_main=$(cd "$MAIN_REPO" 2>/dev/null && pwd || echo "$MAIN_REPO")
    if [[ "$normalized_path" == "$normalized_main" ]]; then
      current_path=""
      current_branch=""
      continue
    fi

    # Skip non-ticket branches (e.g. main, develop)
    if [[ ! "$current_branch" =~ ^LS-[0-9]+ ]]; then
      current_path=""
      current_branch=""
      continue
    fi

    # Check if there is a merged PR for this branch
    merged_pr=$(gh pr list --head "$current_branch" --state merged --json number --jq '.[0].number // empty' 2>/dev/null || echo "")

    if [[ -n "$merged_pr" && "$merged_pr" =~ ^[0-9]+$ ]]; then
      echo "  MERGED: $current_branch (PR #$merged_pr)"
      echo "          Worktree: $current_path"

      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "          [dry-run] Would clean via twig"
        ((cleaned++)) || true
      else
        # Use twig worktree clean from the main repo
        echo "          Cleaning via twig..."
        if (cd "$MAIN_REPO" && twig worktree clean --path "$current_path" 2>&1); then
          echo "          Cleaned successfully."
          ((cleaned++)) || true
        else
          echo "          WARNING: twig worktree clean failed. Skipping."
          ((skipped++)) || true
        fi
      fi
      echo ""
    fi

    current_path=""
    current_branch=""
  fi
done < <(git worktree list --porcelain; echo "")

echo "=== Summary ==="
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  Would clean: $cleaned worktree(s)"
  echo "  Run without --dry-run to actually clean them."
else
  echo "  Cleaned: $cleaned worktree(s)"
  if [[ "$skipped" -gt 0 ]]; then
    echo "  Skipped (errors): $skipped worktree(s)"
  fi
fi
echo ""
