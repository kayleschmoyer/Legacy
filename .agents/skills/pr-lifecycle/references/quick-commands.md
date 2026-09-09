# Quick Commands

```
# MCP (preferred) — full post-creation sequence
github_open_pr(title: "LS-#### type(scope): msg", body: <markdown>, jiraKey: "LS-####", draft: true, head: <branch-name>)
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])   # while still draft — MUST come before bot:ready-for-review
github_mark_pr_ready(number: <PR#>)  # NOTE: this now applies bot:ready-for-review itself (last label op, idempotent)
github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])  # redundant-but-harmless after github_mark_pr_ready; REQUIRED on the CC-web built-in mark-ready path (update_pull_request draft:false does NOT apply it). MUST be last label op — see note below
mcp__github__subscribe_pr_activity(pullRequestNumber: <PR#>)  # OPTIONAL — call only if this built-in exists in the session tool list (absent from most current sessions; events arrive automatically without it). NOT in legacy-sports-github; unavailable in cloud/headless. Fallback: event-triggered one-shot lookups (github_view_pr / ci_list_runs) — no sleep/polling loops (Critical Rule 9)
jira_transition(key: "LS-####", status: "In Review")

# After EACH fix-and-push round (resolve threads → push → re-trigger review + CI)
github_resolve_threads(threadIds: [...], prNumber: <PR#>)
github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])  # MANDATORY and MUST be last label op — fires Reviewer (W1) → bot review → CI Orchestrator. Plain pushes do NOT trigger CI.

# ⛔ Why bot:ready-for-review must be last: Reviewer (W1) uses concurrency.cancel-in-progress: true.
# Since PR #4738 irrelevant-label events land in a separate `noop` concurrency group and CANNOT
# cancel the active reviewer run — only the review-trigger labels themselves (bot:ready-for-review,
# review-bot-degraded, bot:reset-cycle-counter, review-bot-override) and pushes land in the `active`
# group. Label-last ordering remains required hygiene: it guarantees the labeled event that fires W1
# is the final state GitHub delivers. If a W1 run still dies before posting any bot-review status
# (external cancellation, runner failure/starvation), the merge-queue processor's review-stall sweep
# self-heals it on its next wake by cycling the label; after 2 dead re-triggers per SHA it escalates
# to a terminal bot-review failure + needs-human-arbitration (LS-9209).
# If agent-in-progress is missing when you reach this step, apply it first, then bot:ready-for-review.

# Enable auto-merge (worktree-safe — use instead of `gh pr merge --auto`)
github_pr_enable_auto_merge(number: <PR#>)                         # SQUASH (default)
github_pr_enable_auto_merge(number: <PR#>, mergeMethod: "REBASE")  # or MERGE
```

<details>
<summary>Script (single command — when MCP tools are unavailable)</summary>

`make ship-pr` runs the full 5-step pipeline in one shot: create draft PR → label → mark ready → request Copilot review → transition Jira to "In Review". Requires `JIRA_API_TOKEN` + `JIRA_EMAIL` env vars for the Jira step. Use `NO_JIRA=1`, `BODY_FILE=`, `BASE=`, and `ARGS=` Make variables to pass additional options; or invoke `node scripts/ship-pr.js` directly for full flag control.

```bash
# Minimal Make target — auto-detects body from .github/tmp-pr-body.md if it exists
make ship-pr TITLE="LS-#### type(scope): description"

# Make target with options
make ship-pr TITLE="LS-#### type(scope): desc" NO_JIRA=1
make ship-pr TITLE="LS-#### type(scope): desc" BODY_FILE=.github/tmp-pr-body.md BASE=my-branch

# Direct script — use for full flag control (--dry-run, --json, --no-jira, --body-file, etc.)
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --body-file=.github/tmp-pr-body.md
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --no-jira
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --dry-run
```

</details>

<details>
<summary>CLI fallback (only when both MCP and ship-pr script are unavailable)</summary>

```bash
gh pr create --draft --title "LS-#### type(scope): msg" --body-file ".github/tmp-pr-body.md" --base main
bash scripts/cleanup-pr-body.sh
gh pr ready <PR#>
```

</details>
