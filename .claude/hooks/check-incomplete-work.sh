#!/usr/bin/env bash
set -euo pipefail
# Stop hook: block the stop when there is incomplete work in a worktree session.
# Catches three common agent failure modes (LS-4258):
#   1. Uncommitted changes left staged or modified
#   2. Commits not pushed (no upstream, or ahead of upstream)
#   3. A PR that was created but never marked ready (still draft)
#
# Only active in native ephemeral worktree sessions (path contains /.claude/worktrees/).
# Never fires on the main branch or outside a known worktree.
#
# Exit 0 = allow stop normally.
# Exit 2 + stdout = block stop; Claude Code feeds stdout back as a new user message
# that forces the agent to continue resolving the outstanding work.
#
# Ordering: this hook must appear FIRST in the Stop hooks group so that the cleanup
# hooks (cleanup-worktree-junction.sh, cleanup-worktree-symlink.sh) are skipped when
# the stop is blocked — premature symlink removal would break node_modules for the
# continuing session.

WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Only run inside native ephemeral worktrees
if [[ "$WORKTREE" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

BRANCH=$(git -C "$WORKTREE" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
[ "$BRANCH" = "main" ] && exit 0
[ -z "$BRANCH" ]       && exit 0

ISSUES=()

# --- 1. Uncommitted changes (tracked files only — excludes untracked scratch/) ---
DIRTY=$(git -C "$WORKTREE" status --porcelain 2>/dev/null | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then
  ISSUES+=("⛔ UNCOMMITTED CHANGES: staged or modified files exist. Commit them before stopping.")
fi

# --- 2. Unpushed commits ---
UPSTREAM=$(git -C "$WORKTREE" rev-parse --abbrev-ref "@{u}" 2>/dev/null || true)
if [ -n "$UPSTREAM" ]; then
  AHEAD=$(git -C "$WORKTREE" rev-list "@{u}..HEAD" --count 2>/dev/null || echo 0)
  if [ "${AHEAD:-0}" -gt 0 ]; then
    ISSUES+=("⛔ UNPUSHED COMMITS: $AHEAD commit(s) on '$BRANCH' not pushed. Call worktree_push() or: git push --set-upstream origin HEAD")
  fi
else
  # Branch exists but has no upstream — check against origin/main
  AHEAD=$(git -C "$WORKTREE" rev-list "origin/main..HEAD" --count 2>/dev/null || echo 0)
  if [ "${AHEAD:-0}" -gt 0 ]; then
    ISSUES+=("⛔ NO UPSTREAM SET: '$BRANCH' has $AHEAD commit(s) not pushed. Call worktree_push({ setUpstream: true }) or: git push --set-upstream origin HEAD")
  fi
fi

# --- 3. Draft PR on this branch ---
if command -v gh >/dev/null 2>&1; then
  DRAFT_PR=$(gh pr list --head "$BRANCH" --json isDraft,number \
    --jq '.[] | select(.isDraft) | "#\(.number)"' 2>/dev/null | head -1 || true)
  if [ -n "$DRAFT_PR" ]; then
    ISSUES+=("⛔ DRAFT PR: PR $DRAFT_PR is still a draft — the reviewer bot and all orchestrated CI are blocked. Call github_mark_pr_ready(number: <PR#>) now.")
  fi
fi

# --- Allow stop if nothing outstanding ---
[ "${#ISSUES[@]}" -eq 0 ] && exit 0

# --- Block stop with a structured message Claude will act on ---
echo ""
echo "┌─────────────────────────────────────────────────────────────────────┐"
echo "│  ⛔ STOP BLOCKED — incomplete work detected (LS-4258)              │"
echo "├─────────────────────────────────────────────────────────────────────┤"
for issue in "${ISSUES[@]}"; do
  echo "  $issue"
done
echo "├─────────────────────────────────────────────────────────────────────┤"
echo "  Resolve the above before the task is complete. Continue working."
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""
exit 2
