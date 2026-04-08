---
name: open-prs
description: 'Orchestrate PR maintenance across all open PRs: scan for conflicts/reviews/CI failures, rebase conflicting branches, fix review comments, debug CI failures, label clean PRs merge-when-ready, and report results. Burns through every open PR until each reaches a settled state (clean or labeled requires-human-review for blockers outside agent reach). Supports full overnight sweep (loop until all settled) or individual operations (rebase only, reviews only, label only). Works in both local (worktree) and cloud agent (read-only) modes. Use when asked to clean up PRs, sweep open PRs, fix all PR issues, rebase all PRs, label clean PRs, or get PRs ready to merge.'
---

# Skill: PR Operations

## Overview

Orchestrate PR maintenance across all open PRs. This skill is a **coordinator** — it discovers problems, delegates to specialized sub-skills for the actual fixes, and manages the overall flow.

The core principle is **burn through until settled**: every PR must reach a terminal state before the sweep ends. A PR is **settled** when it is either clean (no conflicts, CI passing, no unresolved threads) or labeled `requires-human-review` because the blocker is genuinely outside agent reach (see Critical Rules for valid/invalid reasons).

Supports three modes:

- **Full sweep** (local) — loop through all open PRs fixing conflicts, reviews, and CI until every PR is settled
- **Targeted operation** — run a single operation (e.g., "rebase all conflicting PRs", "label clean PRs")
- **Cloud agent sweep** — scan, triage, and take all API-only actions (label, re-run CI, resolve threads, request reviews); label `requires-human-review` only for blockers outside agent reach and report

> **Scope note** — The batch PR triage tools (`github_pr_scan`, `github_pr_dashboard`, `github_pr_batch_status`, `github_resolve_threads`) are provided by the `legacy-sports-github` MCP server and are available to both local and cloud agents for API-only operations (scan, triage, label, resolve threads, request reviews). In this skill, "local-only" refers specifically to actions that require a git checkout/commit/push (e.g., rebases, code edits, CI-fix branches), which must be handled by a local agent or human developer.

## Environment Compatibility

| Operation                          | Local Agent | Cloud Agent | Cloud Tool                                              |
| ---------------------------------- | :---------: | :---------: | ------------------------------------------------------- |
| Scan & classify all PRs            |     ✅      |     ✅      | `github_pr_dashboard`                                   |
| Detailed PR inspection             |     ✅      |     ✅      | `github_view_pr`, `github_pr_batch_status`              |
| Request Copilot reviews            |     ✅      |     ✅      | `github_request_review` (required for bot-authored PRs) |
| Re-run flaky / failed CI           |     ✅      |     ✅      | `ci_rerun`                                              |
| Diagnose CI failures (read logs)   |     ✅      |     ✅      | `ci_get_logs`, `ci_search_logs`                         |
| Resolve process/meta threads       |     ✅      |     ✅      | `github_resolve_thread`                                 |
| Fetch review thread details        |     ✅      |     ✅      | `github_get_review_threads`                             |
| Rebase conflicting PRs             |     ✅      |     ❌      | — (requires git checkout + push)                        |
| Fix review comments (code changes) |     ✅      |     ❌      | — (requires file edits + commit)                        |
| Fix CI failures (code changes)     |     ✅      |     ❌      | — (requires file edits + commit)                        |
| Post-rebase stabilization          |     ✅      |     ❌      | — (requires make pc + push)                             |

> **Cloud agents cannot commit or push code.** Any operation that requires file edits, git commits, or git push must be deferred to a local agent or human developer. The cloud workflow focuses on API-only actions and producing an actionable report.

## When to Use

- "Clean up all open PRs overnight"
- "Sweep open PRs and get them ready to merge"
- "Rebase all conflicting PRs" _(local only)_
- "Fix all review comments across PRs" _(local only)_
- "Check PR status across the board"
- "Re-run failed CI on all PRs"
- "Request Copilot reviews on all PRs"
- Periodic maintenance before a release cut

## Decision Table

| User Intent                                        | Operation                                        | Cloud? |
| -------------------------------------------------- | ------------------------------------------------ | :----: |
| "Sweep all PRs" / "overnight cleanup"              | Full sweep (all passes, outer loop)              |   ❌   |
| "Cloud sweep" / "triage all PRs"                   | Cloud sweep (API-only actions + report)          |   ✅   |
| "Rebase all PRs" / "fix conflicts"                 | Pass 1 only                                      |   ❌   |
| "Fix review comments" / "address Copilot feedback" | Pass 2 only (delegates to `fix-copilot-reviews`) |   ❌   |
| "Fix CI failures"                                  | Pass 3 only (delegates to `debug-ci-failure`)    |   ❌   |
| "Re-run failed CI" / "retry flaky CI"              | CI rerun only                                    |   ✅   |
| "Request Copilot reviews"                          | Request on all PRs missing Copilot review        |   ✅   |
| "Check PR status" / "scan PRs"                     | Scan + report only (no fixes)                    |   ✅   |

## Sub-Skills (Load on Demand)

This skill delegates to specialized sub-skills for each operation category. Load them when you encounter that problem type:

| Operation               | Sub-Skill                                 | When to Load                                 | Cloud? |
| ----------------------- | ----------------------------------------- | -------------------------------------------- | :----: |
| Rebase conflicting PRs  | `skills/rebase/SKILL.md`                  | PR has merge conflicts                       |   ❌   |
| Resolve merge conflicts | `skills/resolve-merge-conflicts/SKILL.md` | Rebase produces conflicts needing manual fix |   ❌   |
| Fix review comments     | `skills/pr-lifecycle/SKILL.md`            | PR has unresolved Copilot review threads     |   ❌   |
| Debug CI failures       | `skills/debugging/SKILL.md`               | PR has failing CI checks                     |   ❌   |
| Enter a worktree        | `skills/worktree-workflow/SKILL.md`       | Need to create or access a PR's worktree     |   ❌   |
| Create a PR             | `skills/pr-lifecycle/SKILL.md`            | Need to open a new PR after fixes            |   ❌   |

## Prerequisites

**Before starting any sweep, verify auth is working:**

```
github_auth_status()
jira_auth_status()   # Jira is needed for ticket transitions (In Review, Done) during the sweep
```

If either returns `configured: false`, **stop and prompt the user** before proceeding. For GitHub: direct them to set `GH_TOKEN` or `GITHUB_TOKEN`, or run `gh auth login`. For Jira: direct them to check `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET`/`JIRA_CLOUD_ID`. Do not silently fall back to CLI tools — broken auth will cause partial, misleading sweep results.

### Local Agent

- Running from the main repo directory (`D:\code\legacy-sports`)
- `gh` CLI authenticated with repo access
- `twig` available on PATH
- AWS SSO session active (for any Lambda-related CI fixes)

### Cloud Agent

- `gh` CLI authenticated (automatic via GitHub token)
- MCP servers available: `legacy-sports-github`, `legacy-sports-ci`
- No worktrees, twig, or AWS access needed

## CRITICAL RULES

### Both Environments

- **Skip draft PRs — always** — draft PRs are owned by their creating agent and are actively being worked on. **Never edit, rebase, label, or resolve threads on a draft PR.** Always pass `excludeDrafts: true` explicitly to `github_pr_scan` and `github_pr_dashboard` — do not rely on the default. Exclude drafts on every pass and every re-scan within a sweep (not just at initial scan time): a PR that transitions from draft → ready _during_ a sweep pass should only be picked up on the _next_ full pass. Wait for the creating agent to mark it ready via `github_mark_pr_ready`. Log the number of drafts skipped in the sweep report.
- **Dependabot PRs — comment-only** — never make local code changes to Dependabot-authored PRs. Identify them by author (`dependabot[bot]`) or branch prefix (`dependabot/`). Route them **only** to Pass 0b in PASSES.md and **exclude them from all other passes** (0a, 1, 2, 3). All interactions use Dependabot comment commands: `@dependabot rebase` for conflicts or stale CI, `merge-when-ready` label for clean PRs. Dependabot owns its branches — local rebases, lockfile regeneration, and code edits are invalid on these PRs.
- **Remove `@me` filter** — when using `gh` CLI directly, use `--limit 200` to catch all open PRs, not just yours (not applicable when using `github_pr_scan` / `github_pr_dashboard` MCP tools)
- **Resolve review threads after fixing** — leaving threads unresolved is incomplete work
- **Proactively label clean PRs** — when a PR has no unresolved review threads, add `merge-when-ready` immediately via `github_manage_labels(number: <PR#>, add: ["merge-when-ready"])`. Failing CI will automatically remove the label, so there is no risk in labeling early. The `copilot-auto-approve` bot also adds this label, but the agent should not wait for it.
- **Dashboard CI summary can be stale** — the dashboard reports `ciStatus` as `none`, `pass`, `fail`, or `pending`. Stale checks (e.g., Enhanced Merge Queue on an old SHA) can cause a PR to show `fail` or `pending` even when current-SHA checks all pass. Use `github_pr_batch_status` to inspect actual job-level results: if all CI Pipeline and Security Scanning jobs are SUCCESS/SKIPPED, the PR is clean regardless of dashboard `ciStatus`.
- **Burn through until settled** — every PR must reach a terminal state. A PR is settled when it is clean, has CI pending after the final pass, or labeled `requires-human-review` with a comment explaining the blocker. Do not stop the sweep while actionable PRs remain (subject to the max-passes safety cap).
- **`requires-human-review` — only for blockers outside agent reach** — this label means the PR is blocked on something no agent can fix, no matter how many retries or approaches it tries. Valid reasons: missing credentials/secrets the agent cannot access, product or design decisions that require human judgment, blocked on an external team or system, or requires manual infrastructure access. **Invalid reasons (never label for these):** CI failures (rebase, fix the code, or re-run), review comments (read the code and fix them), Dependabot PRs with conflicts or stale CI (use `@dependabot rebase` comment — see Pass 0b in PASSES.md), complexity or multiple failed attempts (try a different approach). Before labeling, the agent **must** have attempted at least one fix. When the label is genuinely needed, add it via `github_manage_labels(number: <PR#>, add: ["requires-human-review"])` with a PR comment explaining the specific blocker that is outside agent capability.

### Local Agent Only

- **One worktree per PR** — never mix fixes for different PRs in the same worktree
- **All file edits happen in the worktree**, never in `D:\code\legacy-sports`
- **Always `make pc` before pushing** — do not push broken code. **Every agent that modifies code must validate before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time.**
- **Dirty-tree guard before push** — after `make pc` passes, check `worktree_status(worktree: "LS-####")`. If the working tree is dirty (formatting auto-amend may leave changes on Windows), commit with `worktree_commit(message: "style: apply formatting", worktree: "LS-####")` and re-run `make pc` before pushing.
- **Always `--force-with-lease`** when pushing rebased branches — `worktree_push` uses this by default

### Cloud Agent Only

- **Never attempt git commit or push** — cloud agents cannot modify branches
- **Use MCP tools over raw `gh` commands** — the MCP servers handle error formatting and retries
- **Always produce an actionable report** — flag items that need a local agent or human developer

### MCP Fallback Protocol

When an MCP tool fails, **do not assume the entire server is down**. Different tools have different permission requirements — one tool failing does not mean all tools on that server are broken.

**Before falling back to `gh` CLI:**

1. **Test another tool on the same server** — e.g., if `github_pr_scan` fails, try `github_list_prs`. If a simpler tool works, only the failing tool has an issue.
2. **Distinguish GitHub auth failures, scope failures, and MCP outages:**
   - **GitHub auth/permissions failure** (401/403 on all GitHub MCP tools) → credentials or scopes are invalid. Use `github_auth_status` first; if needed, confirm with `gh auth status`. Fix auth or scopes rather than switching tools — raw `gh` will hit the same GitHub errors.
   - **Scope/permission failure on a specific tool** (403 on one tool while others on the same server work) → that tool's query or operation needs broader scopes. Continue using the server for everything else and fall back to simpler tools (`github_list_prs` + `github_view_pr`, etc.) for the failing operation.
   - **MCP server / transport failure** (connection errors, 5xx from the MCP layer, or multiple tools timing out) → treat as an MCP availability problem. In this case only, fall back to raw `gh` CLI for critical GitHub operations until the MCP server recovers.
3. **Check other MCP servers independently** — a GitHub MCP failure does not affect CI MCP tools. Always use `ci_list_runs`, `ci_view_run`, `ci_get_logs`, `ci_search_logs` for CI operations regardless of GitHub MCP status.

**Known scope-sensitive tools:**

- `github_pr_scan` uses a heavier GraphQL query (including `mergeable` and other enriched fields) that may fail with `Resource not accessible by integration` on tokens with limited scopes, while simpler tools (`github_list_prs`, `github_request_review`) often continue to work. Note that `github_view_pr` also queries `statusCheckRollup` and may share similar scope limitations, so it is not a guaranteed fallback when `github_pr_scan` fails due to permissions.
- `github_pr_dashboard` and `github_pr_batch_status` also use enriched queries — fall back to `github_list_prs` + individual `github_view_pr` if they fail

---

# Workflow

> For detailed step-by-step playbooks for the local agent sweep (Steps 0–2, Passes 0–3, outer loop, final summary, final validation), see [PASSES.md](PASSES.md).
>
> For the cloud agent workflow (Cloud Steps 1–6, Cloud Full Sweep Algorithm), see [CLOUD-SWEEP.md](CLOUD-SWEEP.md).

## High-Level Pass Order (Local)

1. **Step 0** — Create sweep task
2. **Step 1** — Scan all open PRs
3. **Step 2** — Find/enter PR worktree
4. **Pass 0** — API-fast triage: Copilot reviews, Dependabot commands, label clean PRs, re-run transient CI, resolve meta threads
5. **Pass 1** — Rebase conflicting PRs (parallel for disjoint files, sequential for overlapping)
6. **Pass 2** — Fix unresolved review comments (parallel batches of 3 sub-agents)
7. **Pass 3** — Fix failing CI (parallel batches of 3 sub-agents)
8. **Copilot Review Catch-Up** — batch-check pushed PRs for new review threads
9. **Label Clean PRs** — add `merge-when-ready` to all resolved PRs
10. **Full Sweep Outer Loop** — repeat passes 0–3 until all PRs settled (max 10 passes)
11. **Final Validation Pass** — lightweight re-scan of settled PRs
12. **Final Summary** — report and mark sweep task complete

## Troubleshooting

| Problem                                      | Fix                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Rebase aborts repeatedly on same commit      | `git rebase --skip` if commit already applied; load `skills/rebase/SKILL.md` |
| Copilot keeps re-reviewing with same comment | After 2 cycles on the same thread, resolve it and move on                    |
| CI failure is flaky (passes on re-run)       | Re-trigger: `ci_rerun(runId: <id>, failedOnly: true)` — do not change code   |
| Too many PRs to process in one session       | Prioritize: conflicts → CI → reviews                                         |
| `make pc` fails after rebase stabilization   | Load `skills/rebase/SKILL.md` for post-rebase steps                          |
