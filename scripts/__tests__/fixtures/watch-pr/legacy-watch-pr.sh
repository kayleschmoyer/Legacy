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
#    runs AND commit statuses. Half the merge gate (bot-review, CI Gate — see
#    .github/ruleset.json) is commit statuses that go ABSENT when the pipeline
#    never fires, not red — hence the explicit stall emission below.
#  - Conflict detection is corroborated: mergeable==CONFLICTING or the
#    newest "No Merge Conflicts" run red, held for 2 consecutive polls. The
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
#  - Windows/Git Bash-safe: python for JSON (repo hook precedent — no bare jq),
#    clock-gap re-baseline after machine sleep, absolute paths only.
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
#    LS-8805): the LS-8805 fix only wrapped the json.load of the gh payload,
#    leaving every other line — argv parsing, an unexpected-but-valid payload
#    shape, any latent bug in the diff/emit logic — able to raise an uncaught
#    traceback that kills the watch exactly like the original bug, just from a
#    different call site. The whole per-poll body now runs inside one
#    try/except Exception (SystemExit still propagates for the terminal-state
#    and parse-failure exits), so any single bad poll degrades to a logged,
#    skip-and-retry diagnostic — never a silent or raw death.

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

  # Write the JSON to a file rather than piping it: `python -` reads its own
  # program from stdin via the heredoc below, and a pipe into the same
  # command's stdin is clobbered by that heredoc redirect (both target fd 0;
  # the heredoc wins) — python then hits EOF on json.load(sys.stdin) and
  # raises JSONDecodeError("Expecting value: line 1 column 1 (char 0)") on
  # every single poll (LS-8805). Passing a file path leaves stdin free for
  # the heredoc program and sidesteps the conflict entirely.
  CUR_JSON_FILE="${STATE_DIR}/cur.json"
  printf '%s' "$CUR_JSON" >"$CUR_JSON_FILE"

  # Diff current state against previous; print event lines; persist new state.
  # Exit code 10 = terminal PR state reached (watch ends cleanly).
  # Exit code 2 = the JSON payload was empty/malformed — a diagnostic line
  # was already printed to stdout; the bash side counts this toward
  # consec_failures so a persistent parse regression trips the DEAD exit
  # instead of spinning forever silently touching the heartbeat.
  python - "$STATE_FILE" "$CUR_JSON_FILE" "$PR_NUMBER" "$now_ts" "$REBASELINE" "$STALL_SECONDS" <<'PYEOF'
import json, os, sys

# Windows Git Bash: python stdout defaults to cp1252, which cannot encode
# arbitrary check names in event lines and would crash the poll. Force UTF-8.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    state_file, cur_json_file, pr, now_ts, rebaseline, stall_secs = (
        sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5] == "1", int(sys.argv[6]))
except (IndexError, ValueError) as e:
    print(f"watch: malformed poll arguments this cycle ({e}) — skipping, will retry next interval.")
    sys.exit(2)

# Everything below processes one gh poll response. A single bad or
# unexpectedly-shaped payload (empty body, non-JSON text, valid JSON of the
# wrong type, an unforeseen field shape) must never crash this loop raw — a
# raw traceback here is indistinguishable, from the arming agent's side, from
# the original LS-8805 bug, and kills the mandated watch just the same
# (LS-9337: the narrower json.load-only guard added for LS-8805 left every
# other line in this block unguarded, so the same "watch dies mid-poll"
# symptom recurred from a different, unguarded exception). Catch anything
# unexpected, print one diagnostic line so the Monitor event stream and
# output file both carry the reason, and exit 2 so the bash loop counts it
# toward consec_failures — a persistent regression still trips the existing
# "watch is DEAD" safety net; a single bad poll never does.
try:
    with open(cur_json_file, encoding="utf-8") as f:
        cur = json.load(f)
except (OSError, json.JSONDecodeError) as e:
    print(f"watch #{pr}: malformed gh payload this poll ({e}) — skipping, will retry next interval.")
    sys.exit(2)

if not isinstance(cur, dict):
    print(f"watch #{pr}: unexpected gh payload shape this poll (got {type(cur).__name__}, expected object) — skipping, will retry next interval.")
    sys.exit(2)


def _poll_body(cur, state_file, pr, now_ts, rebaseline, stall_secs):
    prev = {}
    if os.path.exists(state_file):
        try:
            with open(state_file) as f:
                prev = json.load(f)
        except Exception:
            prev = {}
    baseline = not prev  # first successful poll after arming

    sha = (cur.get("headRefOid") or "")[:7]
    emitted = set(prev.get("emitted", []))
    pending = dict(prev.get("pending", {}))  # condition-key -> consecutive-poll count
    events = []

    def emit_once(key, line):
        if key not in emitted:
            events.append(line)
            emitted.add(key)

    def emit_debounced(key, line, active):
        """Emit after the condition holds for 2 consecutive polls; reset when clear."""
        if not active:
            pending.pop(key, None)
            return
        pending[key] = pending.get(key, 0) + 1
        if pending[key] >= 2:
            emit_once(key, line)

    # --- Terminal states (computed from current state alone; ignore rebaseline) ---
    state = cur.get("state", "")
    if state == "MERGED":
        print(f"PR #{pr} MERGED — terminal. Proceed to post-merge steps: verify Jira Done, complete tracking tasks, MCP gap audit.")
        sys.exit(10)
    if state == "CLOSED":
        print(f"PR #{pr} CLOSED without merge — terminal. Report and stop.")
        sys.exit(10)

    # --- Normalize the merge-gate picture from statusCheckRollup ---
    # CheckRun nodes can appear more than once per name (Actions job run + the
    # sweep's API-owned run live in different suites); newest startedAt wins —
    # matching the newest-run-wins semantics of the merge gate and the sweep.
    checks = {}      # name -> node (newest)
    statuses = {}    # context -> state
    for node in (cur.get("statusCheckRollup") or []):
        t = node.get("__typename", "")
        if t == "CheckRun":
            name = node.get("name", "")
            prev_node = checks.get(name)
            if prev_node is None or (node.get("startedAt") or "") >= (prev_node.get("startedAt") or ""):
                checks[name] = node
        elif t == "StatusContext":
            statuses[node.get("context", "")] = node.get("state", "")

    labels = {l.get("name", "") for l in (cur.get("labels") or [])}
    prev_labels = set(prev.get("labels", []))

    # --- Conflict (corroborated + debounced; label is never the trigger) ---
    nmc = checks.get("No Merge Conflicts")
    nmc_red = bool(nmc and nmc.get("conclusion") == "FAILURE")
    conflicting = cur.get("mergeable") == "CONFLICTING" or nmc_red
    emit_debounced(
        f"conflict:{sha}",
        f"conflict: PR #{pr} has merge conflicts with main on {sha} "
        f"(mergeable={cur.get('mergeable')}, No Merge Conflicts={'red' if nmc_red else 'n/a'}). "
        f"Run /rebase now: resolve, push --force-with-lease, re-apply bot:ready-for-review.",
        conflicting,
    )

    # --- Red required contexts + early-signal CI Pipeline checks (debounced) ---
    RED_CHECK = {"FAILURE", "TIMED_OUT"}
    for name, node in checks.items():
        if name == "No Merge Conflicts":
            continue  # handled above
        required = name == "Verify All Migrations Applied"
        early = name.startswith("\U0001F680 CI Pipeline /")
        if (required or early) and node.get("conclusion") in RED_CHECK:
            emit_debounced(
                f"red:{name}:{sha}",
                f"check red: '{name}' = {node.get('conclusion')} on {sha} — triage per ci-event-response.md (ci_list_runs → ci_get_logs).",
                True,
            )
        else:
            pending.pop(f"red:{name}:{sha}", None)
    for ctx in ("bot-review", "CI Gate"):
        st = statuses.get(ctx)
        emit_debounced(
            f"red-status:{ctx}:{sha}",
            f"status red: '{ctx}' = {st} on {sha} — "
            + ("fetch review threads and respond per Author Agent Contract." if ctx == "bot-review"
               else "the CI pipeline failed; triage per ci-event-response.md."),
            st in ("FAILURE", "ERROR"),
        )

    # --- Label transitions (post-baseline only; adds of escalation/CI labels) ---
    WATCHED_ADD = {"needs-human-arbitration", "needs-human-security-review",
                   "needs-human-review", "review-bot-degraded", "review-bot-billing",
                   "ci-stuck"}
    # LS-9812: review-bot-billing is the one watched label whose remedy is NOT
    # "retry the bot" — the reviewer has no API credits, so re-applying
    # bot:ready-for-review just burns another run. Say so explicitly rather than
    # routing it to the generic triage doc.
    LABEL_ADD_HINTS = {
        "review-bot-billing":
            "label: 'review-bot-billing' added to PR #{pr} — the Reviewer Bot's LLM "
            "credits are depleted. Do NOT re-apply bot:ready-for-review; it cannot "
            "succeed. Escalate to the account owner to top up billing.",
    }
    if not baseline and not rebaseline:
        for lbl in sorted(labels - prev_labels):
            if lbl in WATCHED_ADD or (lbl.startswith("CI: ") and lbl != "CI: Conflicts"):
                hint = LABEL_ADD_HINTS.get(lbl)
                emit_once(f"label-add:{lbl}:{sha}",
                          hint.format(pr=pr) if hint
                          else f"label: '{lbl}' added to PR #{pr} — triage per ci-event-response.md.")
        if "merge-when-ready" in prev_labels and "merge-when-ready" not in labels:
            emit_once(f"mwr-removed:{sha}",
                      f"label: merge-when-ready removed from PR #{pr} — a required check went red or the gate stripped it; fix the upstream cause, never re-add manually.")

    # --- New reviews (post-baseline only) ---
    def review_key(r):
        return f"{r.get('author', {}).get('login', '?')}:{r.get('state', '?')}:{r.get('submittedAt', '?')}"
    cur_reviews = {review_key(r) for r in (cur.get("latestReviews") or [])}
    prev_reviews = set(prev.get("reviews", []))
    if not baseline and not rebaseline:
        for r in (cur.get("latestReviews") or []):
            k = review_key(r)
            if k not in prev_reviews:
                emit_once(f"review:{k}",
                          f"review: {r.get('author', {}).get('login', '?')} submitted {r.get('state', '?')} on PR #{pr} — respond per Author Agent Contract (FIX:/JUSTIFY:), then re-apply bot:ready-for-review.")

    # --- All-required-terminal summary (once per head SHA) ---
    REQUIRED_STATUSES = ("bot-review", "CI Gate")
    REQUIRED_CHECKS = ("No Merge Conflicts", "Verify All Migrations Applied")
    gate = {}
    all_terminal = True
    for ctx in REQUIRED_STATUSES:
        st = statuses.get(ctx, "ABSENT")
        gate[ctx] = st
        if st in ("ABSENT", "PENDING", "EXPECTED"):
            all_terminal = False
    for name in REQUIRED_CHECKS:
        node = checks.get(name)
        concl = (node or {}).get("conclusion") or "ABSENT"
        gate[name] = concl
        if concl in ("ABSENT", "") or (node or {}).get("status") not in ("COMPLETED", None):
            all_terminal = False
    if all_terminal and not cur.get("isDraft"):
        summary = ", ".join(f"{k}={v}" for k, v in gate.items())
        emit_once(f"gate-terminal:{sha}",
                  f"gate complete on {sha}: {summary} — evaluate merge readiness (if all green, the Reviewer Bot applies merge-when-ready itself; if any red, fix it).")

    # --- Stall detection: required statuses absent/pending with no progress ---
    # This is the SKIPPED-pipeline stall (ci-event-response.md "Pipeline Skipped /
    # Never Ran"): bot-review and CI Gate never go red when the pipeline never
    # fires — they stay absent. Nothing else would ever emit, so the watch must.
    fingerprint = json.dumps({"c": {k: (v.get("status"), v.get("conclusion")) for k, v in sorted(checks.items())},
                              "s": dict(sorted(statuses.items()))}, sort_keys=True)
    if fingerprint != prev.get("fingerprint") or sha != prev.get("sha"):
        progress_ts = now_ts
    else:
        progress_ts = prev.get("progress_ts", now_ts)
    gate_incomplete = not all_terminal
    if (gate_incomplete and not cur.get("isDraft")
            and now_ts - progress_ts > stall_secs and not rebaseline):
        missing = [k for k, v in gate.items() if v in ("ABSENT", "PENDING", "EXPECTED", "")]
        emit_once(f"stall:{sha}:{progress_ts}",
                  f"stall: no merge-gate progress on {sha} for {(now_ts - progress_ts) // 60} min (incomplete: {', '.join(missing) or 'unknown'}) — probable SKIPPED pipeline; re-apply bot:ready-for-review as the LAST label op, then confirm the pipeline starts.")

    # --- Persist state ---
    with open(state_file, "w") as f:
        json.dump({
            "sha": sha,
            "labels": sorted(labels),
            "reviews": sorted(cur_reviews),
            "emitted": sorted(emitted),
            "pending": pending,
            "fingerprint": fingerprint,
            "progress_ts": progress_ts,
        }, f)

    for line in events:
        print(line)


try:
    _poll_body(cur, state_file, pr, now_ts, rebaseline, stall_secs)
except SystemExit:
    raise
except Exception as e:
    print(f"watch #{pr}: unexpected error processing this poll ({type(e).__name__}: {e}) — skipping, will retry next interval.")
    sys.exit(2)
PYEOF
  py_rc=$?
  if [ $py_rc -eq 10 ]; then
    exit 0
  fi
  if [ $py_rc -ne 0 ]; then
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
