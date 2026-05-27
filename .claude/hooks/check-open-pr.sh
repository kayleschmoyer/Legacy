#!/usr/bin/env bash
set -euo pipefail
# Stop hook: warn when ending a session with an open, ready-for-review PR that
# is neither merged nor in a terminal blocked state (LS-4907).
#
# Catches the "Drive to merge" violation from AGENTS.md: stopping after the bot
# has reviewed but before the PR is merged. Complements check-incomplete-work.sh
# (which covers unpushed commits and draft PRs).
#
# Exit 0 = allow stop normally.
# Exit 2 + stderr = block stop; Claude Code surfaces stderr to the agent as
# follow-up input so it resumes work.
#
# Only exits non-zero for things the agent can actually drive. Skips on:
#   - main branch or non-claude/ branches
#   - no PR for current branch
#   - PR is MERGED or CLOSED
#   - PR has needs-human-security-review, needs-human-arbitration, or
#     review-bot-override (legitimately blocked, outside agent control)
#   - opt-out flag file .claude/.pr-watch-opt-out exists (user pausing
#     intentionally, e.g. waiting on long CI overnight)
#
# Cross-platform: runs on Windows (Git Bash) and Linux (cloud sessions).

WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"
WORKTREE_NORM="${WORKTREE//\\//}"

cd "$WORKTREE_NORM" 2>/dev/null || exit 0

# --- Opt-out flag ---
if [ -f ".claude/.pr-watch-opt-out" ]; then
  exit 0
fi

# --- Branch checks ---
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
[ -z "$BRANCH" ] && exit 0
[ "$BRANCH" = "main" ] && exit 0
case "$BRANCH" in
  claude/*) ;;
  *) exit 0 ;;
esac

# --- gh CLI required ---
command -v gh >/dev/null 2>&1 || exit 0

# --- Look up the PR for this branch ---
PR_JSON=$(gh pr list --head "$BRANCH" --state all --json number,state,isDraft,labels --limit 1 2>/dev/null || true)
[ -z "$PR_JSON" ] || [ "$PR_JSON" = "[]" ] && exit 0

# Parse with python (no jq on Windows). Emits: "<number>|<state>|<isDraft>|<labels-csv>"
PARSED=$(PR_JSON="$PR_JSON" python -c '
import json, os, sys
data = json.loads(os.environ["PR_JSON"])
if not data:
    sys.exit(0)
pr = data[0]
num = pr["number"]
state = pr["state"]
draft = "true" if pr["isDraft"] else "false"
labels = ",".join(l["name"] for l in pr.get("labels", []))
print("{}|{}|{}|{}".format(num, state, draft, labels))
' 2>/dev/null || true)

[ -z "$PARSED" ] && exit 0

IFS='|' read -r PR_NUMBER PR_STATE PR_IS_DRAFT PR_LABELS <<< "$PARSED"

# --- Terminal states: allow stop ---
case "$PR_STATE" in
  MERGED|CLOSED) exit 0 ;;
esac

# --- Legitimately blocked: allow stop ---
case ",$PR_LABELS," in
  *,needs-human-security-review,*|*,needs-human-arbitration,*|*,review-bot-override,*) exit 0 ;;
esac

# --- Max-block bypass to avoid infinite stop loops ---
# Same pattern as check-incomplete-work.sh: per-worktree counter with 1-hour
# staleness window. After MAX_BLOCKS attempts, allow stop with a warning.
MAX_BLOCKS=3
WORKTREE_SLUG=$(basename "$WORKTREE_NORM")
STOP_BLOCK_COUNTER="${TMPDIR:-/tmp}/claude-open-pr-block-${WORKTREE_SLUG}"
STALE_SECONDS=3600

block_count=0
if [ -f "$STOP_BLOCK_COUNTER" ]; then
  file_mtime=$(stat -c %Y "$STOP_BLOCK_COUNTER" 2>/dev/null || \
               stat -f %m "$STOP_BLOCK_COUNTER" 2>/dev/null || \
               echo 0)
  now=$(date +%s)
  age=$(( now - file_mtime ))
  if [ "$age" -lt "$STALE_SECONDS" ]; then
    raw=$(<"$STOP_BLOCK_COUNTER")
    [[ "$raw" =~ ^[0-9]+$ ]] && block_count="$raw"
  fi
fi
block_count=$((block_count + 1))
_tmp=$(mktemp "${STOP_BLOCK_COUNTER}.tmp.XXXXXX" 2>/dev/null || true)
if [ -n "$_tmp" ]; then
  printf '%s' "$block_count" > "$_tmp" && mv -f "$_tmp" "$STOP_BLOCK_COUNTER" 2>/dev/null || rm -f "$_tmp" 2>/dev/null || true
else
  printf '%s' "$block_count" > "$STOP_BLOCK_COUNTER" 2>/dev/null || true
fi

# --- Build the message ---
if [ "$PR_IS_DRAFT" = "true" ]; then
  MSG="Draft PR #${PR_NUMBER} is not a terminal state. Mark ready with github_mark_pr_ready before ending the session, or explain why you cannot."
else
  MSG="PR #${PR_NUMBER} is open and ready for review but not merged. Per AGENTS.md (Drive to merge), continue watching to merge, or surface a specific blocker."
fi

if [ "$block_count" -ge "$MAX_BLOCKS" ]; then
  {
    echo ""
    echo "⚠️  OPEN-PR STOP GUARD BYPASSED — blocked ${block_count} time(s), allowing stop"
    echo "  ${MSG}"
    echo "  Human review required — the PR may still need attention."
    echo ""
  } >&2
  exit 0
fi

remaining=$(( MAX_BLOCKS - block_count ))
{
  echo ""
  echo "⛔ STOP BLOCKED — open PR not driven to merge (LS-4907)"
  echo "  ${MSG}"
  echo "  (Attempt ${block_count} of ${MAX_BLOCKS} — auto-bypasses in ${remaining} more.)"
  echo "  Opt out for this worktree: touch .claude/.pr-watch-opt-out"
  echo ""
} >&2
exit 2
