#!/usr/bin/env bash
#
# Remove the temporary PR body file after a PR has been created.
#
# Deletes .github/tmp-pr-body.md from the current directory (or from a
# specified worktree path) so it is not left behind after `gh pr create`.
#
# Usage:
#   ./scripts/cleanup-pr-body.sh
#   ./scripts/cleanup-pr-body.sh /path/to/worktree

set -euo pipefail

path="${1:-.}"
target="$path/.github/tmp-pr-body.md"

if [ -f "$target" ]; then
  rm -f -- "$target"
  echo "Removed $target"
else
  echo "Nothing to clean up ($target not found)"
fi
