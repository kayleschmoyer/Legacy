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

# --- Look up the PR for this branch (view carries mergeable; list does not) ---
PR_JSON=$(gh pr view "$BRANCH" --json number,state,isDraft,labels,mergeable,headRefOid 2>/dev/null || true)
[ -z "$PR_JSON" ] && exit 0

# Parse with python (no jq on Windows).
# Emits: "<number>|<state>|<isDraft>|<labels-csv>|<mergeable>|<head-sha>"
PARSED=$(PR_JSON="$PR_JSON" python -c '
import json, os, sys
pr = json.loads(os.environ["PR_JSON"])
if not pr:
    sys.exit(0)
num = pr["number"]
state = pr["state"]
draft = "true" if pr["isDraft"] else "false"
labels = ",".join(l["name"] for l in pr.get("labels", []))
mergeable = pr.get("mergeable") or "UNKNOWN"
sha = (pr.get("headRefOid") or "")[:7]
print("{}|{}|{}|{}|{}|{}".format(num, state, draft, labels, mergeable, sha))
' 2>/dev/null || true)

[ -z "$PARSED" ] && exit 0

IFS='|' read -r PR_NUMBER PR_STATE PR_IS_DRAFT PR_LABELS PR_MERGEABLE PR_HEAD_SHA <<< "$PARSED"

# --- Terminal states: allow stop ---
case "$PR_STATE" in
  MERGED|CLOSED) exit 0 ;;
esac

# --- Legitimately blocked: allow stop ---
case ",$PR_LABELS," in
  *,needs-human-security-review,*|*,needs-human-arbitration,*|*,review-bot-override,*) exit 0 ;;
esac

WORKTREE_SLUG=$(basename "$WORKTREE_NORM")

# --- Merge conflict: block with an actionable directive (LS-8544) ---
# Conflicts are the one blocker that never wakes an idle session (the base-push
# sweep surfaces them only as an API check run + label + comment — no event).
# Catching the agent at stop time is therefore load-bearing, so conflict blocks
# use their OWN counter, keyed to the head SHA: a fresh conflict always gets a
# fresh block budget even if the generic guard below already bypassed, and a
# rebase (new SHA) resets it naturally. mergeable==CONFLICTING is GitHub's own
# computation; the CI: Conflicts label is corroborating only (it flaps — see
# check-conflicts-sweep.yml).
HAS_CONFLICT=0
[ "$PR_MERGEABLE" = "CONFLICTING" ] && HAS_CONFLICT=1
case ",$PR_LABELS," in
  *,"CI: Conflicts",*) [ "$PR_MERGEABLE" != "MERGEABLE" ] && HAS_CONFLICT=1 ;;
esac

if [ "$HAS_CONFLICT" -eq 1 ]; then
  CONFLICT_COUNTER="${TMPDIR:-/tmp}/claude-conflict-block-${WORKTREE_SLUG}"
  conflict_count=0
  if [ -f "$CONFLICT_COUNTER" ]; then
    read -r rec_sha rec_count < "$CONFLICT_COUNTER" 2>/dev/null || true
    if [ "${rec_sha:-}" = "$PR_HEAD_SHA" ] && [[ "${rec_count:-}" =~ ^[0-9]+$ ]]; then
      conflict_count="$rec_count"
    fi
  fi
  conflict_count=$((conflict_count + 1))
  printf '%s %s' "$PR_HEAD_SHA" "$conflict_count" > "$CONFLICT_COUNTER" 2>/dev/null || true

  if [ "$conflict_count" -ge 3 ]; then
    {
      echo ""
      echo "⚠️  CONFLICT STOP GUARD BYPASSED — blocked ${conflict_count} time(s) on ${PR_HEAD_SHA}, allowing stop"
      echo "  PR #${PR_NUMBER} still has merge conflicts with main. Human attention required."
      echo ""
    } >&2
    exit 0
  fi
  {
    echo ""
    echo "⛔ STOP BLOCKED — PR #${PR_NUMBER} has merge conflicts with main (LS-8544)"
    echo "  Resolve them NOW: run the /rebase skill (rebase onto origin/main, resolve"
    echo "  conflicts, git push --force-with-lease), then re-apply bot:ready-for-review."
    echo "  This is actionable immediately — do not wait for CI or reviews first."
    echo ""
  } >&2
  exit 2
fi

# --- Armed watch: allow a CI-wait stop without burning block budget (LS-8544) ---
# scripts/watch-pr.sh heartbeats this flag on every poll and removes it on exit.
# A fresh flag (mtime < 5 min) proves a live watch will re-invoke the session on
# any actionable PR event, so idling is safe and correct. A stale flag means the
# watch died — fall through to the normal guard.
WATCH_FLAG=".claude/.pr-watch-armed-${PR_NUMBER}"
if [ -f "$WATCH_FLAG" ]; then
  flag_mtime=$(stat -c %Y "$WATCH_FLAG" 2>/dev/null || \
               stat -f %m "$WATCH_FLAG" 2>/dev/null || \
               echo 0)
  flag_age=$(( $(date +%s) - flag_mtime ))
  if [ "$flag_age" -lt 300 ]; then
    {
      echo ""
      echo "✅ PR #${PR_NUMBER} watch is armed (flag ${flag_age}s old) — stop allowed; the watch monitor will re-invoke this session on the next actionable PR event."
      echo ""
    } >&2
    exit 0
  fi
  {
    echo ""
    echo "⚠️  Watch flag for PR #${PR_NUMBER} is STALE (${flag_age}s old) — the watch monitor has died. Re-arm it before idling: Monitor + \"bash ${WORKTREE_NORM}/scripts/watch-pr.sh ${PR_NUMBER}\" (persistent: true) — absolute path required, a relative one exits 127."
    echo ""
  } >&2
fi

# --- Periodic Wake Protocol breadcrumb: allow idle when a chained one-shot
# reminder is presumably armed (LS-9961). CCR sessions have no `gh` CLI, so
# the WATCH_FLAG channel above never applies to them; they instead follow the
# Periodic Wake Protocol (.agents/skills/mcp-first/references/waiting-and-wakeups.md),
# whose own state file (`.claude/.pr-state-<N>.json`) is already the doctrine's
# memory of record. Its invariant #2 ("exactly one outstanding reminder") means
# a state file updated within the last cadence window (~20 min, +buffer) is
# itself proof that a reminder is outstanding — no separate flag needed. Skip
# the allowance once the protocol's own terminal thresholds (idleCount >= 6 or
# cycleCount >= 12) are recorded, since those branches deliberately do NOT
# re-arm and the file falls through to the normal block/bypass guard below.
STATE_FILE=".claude/.pr-state-${PR_NUMBER}.json"
if [ -f "$STATE_FILE" ]; then
  state_mtime=$(stat -c %Y "$STATE_FILE" 2>/dev/null || \
                stat -f %m "$STATE_FILE" 2>/dev/null || \
                echo 0)
  state_age=$(( $(date +%s) - state_mtime ))
  STATE_STALE_SECONDS=1800
  if [ "$state_age" -lt "$STATE_STALE_SECONDS" ]; then
    STATE_TERMINAL=$(python -c '
import json, sys
try:
    with open(sys.argv[1]) as f:
        state = json.load(f)
except Exception:
    print("unknown")
    sys.exit(0)
idle = state.get("idleCount") or 0
cycle = state.get("cycleCount") or 0
print("terminal" if idle >= 6 or cycle >= 12 else "ok")
' "$STATE_FILE" 2>/dev/null || echo "unknown")
    if [ "$STATE_TERMINAL" = "ok" ]; then
      {
        echo ""
        echo "✅ PR #${PR_NUMBER} periodic-wake state (${STATE_FILE}, ${state_age}s old) — stop allowed; per the Periodic Wake Protocol a chained one-shot reminder is presumed outstanding and will re-invoke this session."
        echo ""
      } >&2
      exit 0
    fi
  fi
fi

# --- Max-block bypass to avoid infinite stop loops ---
# Same pattern as check-incomplete-work.sh: per-worktree counter with 1-hour
# staleness window. After MAX_BLOCKS attempts, allow stop with a warning.
MAX_BLOCKS=3
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
  MSG="PR #${PR_NUMBER} is open and ready for review but not merged. Per AGENTS.md (Drive to merge): fix anything actionable now; if you are only waiting on in-flight CI/review, idle via one of the sanctioned channels (see waiting-and-wakeups.md): (a) where \`gh\` is available, arm the watch monitor (Monitor tool + \"bash ${WORKTREE_NORM}/scripts/watch-pr.sh ${PR_NUMBER}\", persistent: true — the absolute path is required, a relative one exits 127); (b) in a CCR session without \`gh\`, follow the Periodic Wake Protocol — a chained CronCreate/scheduled-task one-shot reminder, with \`${STATE_FILE}\` written/updated within the last 30 minutes so this hook can detect it; (c) any equivalent breadcrumb this hook recognizes. Do not stop with none of these armed."
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
