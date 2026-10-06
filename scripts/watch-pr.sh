#!/usr/bin/env bash
set -uo pipefail
# scripts/watch-pr.sh <PR#> [interval-seconds] — canonical PR watch monitor (LS-8544)
#
# Armed by an agent session via the Claude Code harness Monitor tool:
#   Monitor({ command: "bash <worktree-abs-path>/scripts/watch-pr.sh <PR#>",
#             persistent: true, description: "PR #<N> watch" })
# The path MUST be absolute — Monitor is not guaranteed to run with the repo
# root as its cwd, and bash resolves the script path before executing the first
# line, so a relative `scripts/watch-pr.sh` exits 127 instantly (LS-9045).
# Each stdout line becomes a notification that re-invokes the idle session, which
# then routes the event through the triage table in
# .agents/skills/pr-lifecycle/references/ci-event-response.md.
#
# Design contract (do not weaken — each rule closes an observed failure mode):
#  - Emits ONLY actionable transitions, never raw status dumps (the harness
#    auto-stops monitors that emit too much; a killed watch = silent stall).
#  - Polls `gh pr view --json ... statusCheckRollup`, which carries BOTH check
#    runs AND commit statuses. The merge gate (bot-review, CI Gate, No Merge
#    Conflicts, Verify All Migrations Applied — see .github/ruleset.json) is all
#    commit statuses that go ABSENT when the pipeline never fires, not red —
#    hence the explicit stall emission below.
#  - Conflict detection is corroborated: mergeable==CONFLICTING or the
#    "No Merge Conflicts" commit status red (FAILURE/ERROR), held for 2
#    consecutive polls; the once-key re-arms while clear. The
#    "CI: Conflicts" label alone is never a trigger — it is a multi-writer flag
#    that flaps (see check-conflicts-sweep.yml header, LS-8229).
#  - Every way the watch can end produces a line (loud death): terminal PR
#    state, degraded API (N consecutive failures), or script error via exit
#    code. Silence always means "nothing actionable has happened".
#  - Heartbeats .claude/.pr-watch-armed-<PR#> every poll and removes it on
#    exit; .claude/hooks/check-open-pr.sh treats a fresh flag (<5 min) as
#    "watch armed" and allows a CI-wait stop without burning block budget.
#  - Diagnostics go IN the stdout event line — the monitor's stderr file is
#    not readable by agents (block-tmp-polling.mjs blocks Temp\claude reads).
#  - Windows/Git Bash-safe: node for JSON (scripts/watch-pr-poll.mjs, builtins
#    only — no python, no bare jq), clock-gap re-baseline after machine sleep,
#    absolute paths only. Python was dropped (LS-10598): on Windows `python`
#    often resolves only to the Microsoft Store App Execution Alias
#    (%LOCALAPPDATA%\Microsoft\WindowsApps), which prints "Python was not
#    found..." on every call and killed the watch after 5 polls. Node is
#    guaranteed on every dev host; its absence fails fast at startup.
#  - Never trusts the caller's cwd: the repo root is derived from ${BASH_SOURCE[0]}
#    and cd'd into, so the gh lookup and the heartbeat resolve correctly no
#    matter where Monitor starts the script (LS-9045). Arm it with an ABSOLUTE
#    path regardless — bash resolves the script path before the first line runs,
#    so a relative invocation still dies with exit 127 before any of this helps.
#  - `gh` is absent in Claude Code Remote / hosted cloud sessions (LS-8717) and
#    there is no working fallback: GH_TOKEN/GITHUB_TOKEN in that environment
#    are the literal placeholder "proxy-injected" — the network proxy injects
#    real credentials only for the pinned gh/GitHub-MCP operations, so a direct
#    REST or GraphQL call 403s no matter the endpoint. This script fails fast
#    and loud instead; callers in that environment must not arm it at all (see
#    AGENTS.md's Tier-2 PR-watch rule, which branches on gh availability).
#  - Nothing in the per-poll body may crash the loop raw (LS-9337 regression of
#    LS-8805): the whole per-poll body in watch-pr-poll.mjs runs inside one
#    try/catch (the terminal-state and parse-failure exits still propagate),
#    so any single bad poll degrades to a logged, skip-and-retry diagnostic —
#    never a silent or raw death.

PR_NUMBER="${1:?usage: watch-pr.sh <PR#> [interval-seconds]}"
INTERVAL="${2:-90}"
# Both args feed file paths and arithmetic — reject anything but integers
# (e.g. a PR "number" of ../evilfile would traverse out of .claude/).
if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "watch: PR number must be a positive integer (got: ${PR_NUMBER})" >&2
  exit 1
fi
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [ "$INTERVAL" -lt 30 ]; then
  echo "watch: interval must be an integer >= 30 seconds (got: ${INTERVAL})" >&2
  exit 1
fi
MAX_CONSEC_FAILURES=5
STALL_SECONDS=900

# Self-locating (LS-9045). Neither $(pwd) nor CLAUDE_PROJECT_DIR is trustworthy
# in the harness Monitor environment: Monitor is not guaranteed to run with the
# repo root as its cwd, and it does not export CLAUDE_PROJECT_DIR. This script
# always lives at <repo-root>/scripts/watch-pr.sh, so derive the root from its
# own path and cd there — `gh pr view` needs a repo cwd to resolve the remote,
# and the heartbeat MUST land at <repo-root>/.claude/ because that is where
# .claude/hooks/check-open-pr.sh reads it. An explicit CLAUDE_PROJECT_DIR still
# wins for the flag path so the script and the hook always agree.
# NOTE: this hardens the cwd-dependent paths only. It cannot rescue a relative
# *invocation* — bash resolves the script path before executing a single line,
# so `bash scripts/watch-pr.sh` still exits 127 from the wrong cwd. Callers must
# arm the watch with an absolute path; see the usage block above.
SCRIPT_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd) || exit 1
cd -- "$SCRIPT_ROOT" || exit 1
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$SCRIPT_ROOT}"
PROJECT_DIR="${PROJECT_DIR//\\//}"
FLAG_FILE="${PROJECT_DIR}/.claude/.pr-watch-armed-${PR_NUMBER}"
STATE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/watch-pr-${PR_NUMBER}.XXXXXX") || exit 1
STATE_FILE="${STATE_DIR}/state.json"

cleanup() {
  rm -f "$FLAG_FILE" 2>/dev/null || true
  rm -rf "$STATE_DIR" 2>/dev/null || true
}
trap cleanup EXIT

command -v gh >/dev/null 2>&1 || {
  # No REST/GraphQL fallback is possible here: Claude Code Remote sessions run
  # behind a network proxy that injects real GitHub credentials ONLY for the
  # pinned set of operations gh/the GitHub MCP server issue (LS-8717) — GH_TOKEN
  # and GITHUB_TOKEN are both literally the placeholder string "proxy-injected"
  # in that environment, so a direct `curl`/`urllib` call to api.github.com
  # 403s regardless of which endpoint or auth header is used. Fail fast and
  # loud instead of retrying a call that can never succeed.
  echo "watch #${PR_NUMBER} degraded: gh CLI not available — watch is DEAD, fall back to push-notification doctrine (subscribe_pr_activity + send_later check-ins, see AGENTS.md Tier-2 rule)"
  exit 1
}

# JSON runtime preflight (LS-10598): fail fast on the FIRST line, not after
# MAX_CONSEC_FAILURES polls. `node -e` (not just `command -v`) so a broken shim
# or stub on PATH is caught too.
POLL_SCRIPT="${SCRIPT_ROOT}/scripts/watch-pr-poll.mjs"
if ! node -e '' >/dev/null 2>&1; then
  echo "watch #${PR_NUMBER} degraded: no usable JSON runtime — \`node\` is not on PATH or does not run — watch is DEAD; fix PATH (node is required by every MCP server), then re-arm"
  exit 1
fi
if [ ! -f "$POLL_SCRIPT" ]; then
  echo "watch #${PR_NUMBER} degraded: ${POLL_SCRIPT} is missing — watch is DEAD; restore it from main, then re-arm"
  exit 1
fi

consec_failures=0
rate_limited_notified=0
last_poll_ts=0

while true; do
  now_ts=$(date +%s)

  # Clock-gap detection: after machine sleep/hibernate the loop resumes with a
  # large wall-clock gap. Diffing against pre-sleep state would replay hours of
  # transitions (or mis-order them) — re-baseline silently instead; terminal
  # states still emit because they are computed from current state alone.
  REBASELINE=0
  if [ "$last_poll_ts" -gt 0 ] && [ $((now_ts - last_poll_ts)) -gt $((INTERVAL * 3 + 60)) ]; then
    REBASELINE=1
  fi
  last_poll_ts=$now_ts

  CUR_JSON=$(gh pr view "$PR_NUMBER" --json \
    number,state,isDraft,mergeable,mergeStateStatus,labels,statusCheckRollup,latestReviews,headRefOid \
    2>"${STATE_DIR}/gh-err.txt")
  gh_rc=$?

  if [ $gh_rc -ne 0 ] || [ -z "$CUR_JSON" ]; then
    ERR=$(head -c 300 "${STATE_DIR}/gh-err.txt" 2>/dev/null | tr '\n' ' ')
    case "$ERR" in
      *"429"*|*"rate limit"*|*"Rate limit"*|*"secondary rate"*)
        # Rate limiting is not a death signal: back off, warn once per streak,
        # and do NOT count toward the failure budget (a shared-token 403 would
        # otherwise kill every concurrent watch simultaneously).
        if [ "$rate_limited_notified" -eq 0 ]; then
          echo "watch #${PR_NUMBER}: rate-limited by GitHub API — backing off to $((INTERVAL * 4))s polls until it clears"
          rate_limited_notified=1
        fi
        sleep $((INTERVAL * 4))
        continue
        ;;
    esac
    consec_failures=$((consec_failures + 1))
    if [ "$consec_failures" -ge "$MAX_CONSEC_FAILURES" ]; then
      echo "watch #${PR_NUMBER} degraded: ${consec_failures} consecutive API failures (last: ${ERR:-empty response}) — watch is DEAD; investigate auth/network, then re-arm"
      exit 1
    fi
    sleep "$INTERVAL"
    continue
  fi
  rate_limited_notified=0

  # Heartbeat: prove the watch is alive to the stop guard.
  mkdir -p "${PROJECT_DIR}/.claude" 2>/dev/null || true
  touch "$FLAG_FILE" 2>/dev/null || true

  # Hand the JSON over as a file path (not stdin) — the LS-8805 lesson: keep
  # the payload channel independent of how the parser is launched.
  CUR_JSON_FILE="${STATE_DIR}/cur.json"
  printf '%s' "$CUR_JSON" >"$CUR_JSON_FILE"

  # Diff current state against previous; print event lines; persist new state.
  # Exit code 10 = terminal PR state reached (watch ends cleanly).
  # Exit code 2 = the JSON payload was empty/malformed — a diagnostic line
  # was already printed to stdout; the bash side counts this toward
  # consec_failures so a persistent parse regression trips the DEAD exit
  # instead of spinning forever silently touching the heartbeat.
  node "$POLL_SCRIPT" "$STATE_FILE" "$CUR_JSON_FILE" "$PR_NUMBER" "$now_ts" "$REBASELINE" "$STALL_SECONDS"
  poll_rc=$?
  if [ $poll_rc -eq 10 ]; then
    exit 0
  fi
  if [ $poll_rc -ne 0 ]; then
    consec_failures=$((consec_failures + 1))
    if [ "$consec_failures" -ge "$MAX_CONSEC_FAILURES" ]; then
      echo "watch #${PR_NUMBER} degraded: ${consec_failures} consecutive parse failures — watch is DEAD; investigate, then re-arm"
      exit 1
    fi
    sleep "$INTERVAL"
    continue
  fi
  consec_failures=0

  # Jitter (0-15s) de-synchronizes concurrent session watches sharing a token.
  sleep $((INTERVAL + RANDOM % 16))
done
