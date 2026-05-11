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
# Normalise to forward slashes so the pattern check and cd both work on Windows
# (CLAUDE_PROJECT_DIR may be set with backslashes on Windows/Git Bash).
WORKTREE_NORM="${WORKTREE//\\//}"

# Only run inside native ephemeral worktrees
if [[ "$WORKTREE_NORM" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

# cd into the worktree using the normalised path so git commands work without -C.
# git -C does not translate /d/code/... Git Bash unix paths on Windows;
# cd does, because the translation happens at the shell level.
cd "$WORKTREE_NORM" 2>/dev/null || exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
[ "$BRANCH" = "main" ] && exit 0
[ -z "$BRANCH" ]       && exit 0

ISSUES=()

# --- 1. Uncommitted changes (tracked files only — excludes untracked scratch/) ---
# Bare uncommitted changes are NOT a strong abandonment signal on their own — they
# can mean the user is reviewing edits, paused mid-iteration, or considering whether
# to ship at all. We only flag them when paired with another mid-ship-flow signal
# (unpushed commits or a draft PR), where the combination clearly indicates the
# agent stopped mid-workflow rather than the user pausing for review.
DIRTY=$(git status --porcelain 2>/dev/null | grep -v '^??' || true)
HAS_DIRTY=0
[ -n "$DIRTY" ] && HAS_DIRTY=1

# --- 2. Unpushed commits ---
UPSTREAM=$(git rev-parse --abbrev-ref "@{u}" 2>/dev/null || true)
if [ -n "$UPSTREAM" ]; then
  AHEAD=$(git rev-list "@{u}..HEAD" --count 2>/dev/null || echo 0)
  if [ "${AHEAD:-0}" -gt 0 ]; then
    ISSUES+=("⛔ UNPUSHED COMMITS: $AHEAD commit(s) on '$BRANCH' not pushed. Call worktree_push() or: git push --set-upstream origin HEAD")
  fi
else
  # Branch exists but has no upstream — check against origin/main
  AHEAD=$(git rev-list "origin/main..HEAD" --count 2>/dev/null || echo 0)
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

# Only escalate uncommitted changes when paired with another mid-ship-flow signal.
if [ "$HAS_DIRTY" -eq 1 ] && [ "${#ISSUES[@]}" -gt 0 ]; then
  ISSUES+=("⛔ UNCOMMITTED CHANGES: staged or modified files exist alongside the issue(s) above. Commit them before stopping.")
fi

# --- Allow stop if nothing outstanding ---
[ "${#ISSUES[@]}" -eq 0 ] && exit 0

# --- Max-block guard: prevent infinite stop loops ---
# If the agent has been blocked MAX_BLOCKS times without resolving the issue,
# allow the stop with a warning rather than looping forever.
#
# Counter is scoped to this worktree (basename of WORKTREE_NORM) to avoid
# collisions across concurrent sessions on different repos.
#
# NOT reset by SessionStart (reset-tool-count.sh): Claude Code fires SessionStart
# on each re-prompt, which would reset the count every cycle. Instead, a 1-hour
# staleness window treats files older than STALE_SECONDS as reset, giving a clean
# slate between separate work sessions without resetting mid-loop.
MAX_BLOCKS=3
WORKTREE_SLUG=$(basename "$WORKTREE_NORM")
STOP_BLOCK_COUNTER="${TMPDIR:-/tmp}/claude-stop-block-${WORKTREE_SLUG}"
STALE_SECONDS=3600

block_count=0
if [[ -f "$STOP_BLOCK_COUNTER" ]]; then
  # Portable mtime: GNU stat (-c %Y), then BSD/macOS stat (-f %m), then 0.
  file_mtime=$(stat -c %Y "$STOP_BLOCK_COUNTER" 2>/dev/null || \
               stat -f %m "$STOP_BLOCK_COUNTER" 2>/dev/null || \
               echo 0)
  now=$(date +%s)
  age=$(( now - file_mtime ))
  if [[ "$age" -lt "$STALE_SECONDS" ]]; then
    raw=$(<"$STOP_BLOCK_COUNTER")
    [[ "$raw" =~ ^[0-9]+$ ]] && block_count="$raw"
  fi
fi
block_count=$((block_count + 1))
# Atomic write via temp file + mv (same pattern as remind-compact.sh).
_tmp=$(mktemp "${STOP_BLOCK_COUNTER}.tmp.XXXXXX" 2>/dev/null || true)
if [[ -n "$_tmp" ]]; then
  printf '%s' "$block_count" > "$_tmp" && mv -f "$_tmp" "$STOP_BLOCK_COUNTER" 2>/dev/null || rm -f "$_tmp" 2>/dev/null || true
else
  printf '%s' "$block_count" > "$STOP_BLOCK_COUNTER" 2>/dev/null || true
fi

if [ "$block_count" -ge "$MAX_BLOCKS" ]; then
  echo ""
  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│  ⚠️  STOP GUARD BYPASSED — blocked $block_count time(s), allowing stop │"
  echo "├─────────────────────────────────────────────────────────────────────┤"
  for issue in "${ISSUES[@]}"; do
    echo "  $issue"
  done
  echo "├─────────────────────────────────────────────────────────────────────┤"
  echo "  Agent was unable to resolve the above after $block_count attempt(s)."
  echo "  Human review required — the above items may still be outstanding."
  echo "└─────────────────────────────────────────────────────────────────────┘"
  echo ""
  exit 0
fi

# --- Block stop with a structured message Claude will act on ---
remaining=$(( MAX_BLOCKS - block_count ))
echo ""
echo "┌─────────────────────────────────────────────────────────────────────┐"
echo "│  ⛔ STOP BLOCKED — incomplete work detected (LS-4258)              │"
echo "├─────────────────────────────────────────────────────────────────────┤"
for issue in "${ISSUES[@]}"; do
  echo "  $issue"
done
echo "├─────────────────────────────────────────────────────────────────────┤"
echo "  Resolve the above before the task is complete. Continue working."
echo "  (Attempt $block_count of $MAX_BLOCKS — auto-bypasses in $remaining more.)"
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""
exit 2
