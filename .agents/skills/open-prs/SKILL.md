---
name: open-prs
description: 'Orchestrate PR maintenance across all open PRs: scan for conflicts/reviews/CI failures, rebase conflicting branches, fix review comments, debug CI failures, label clean PRs merge-when-ready, and report results. Supports full overnight sweep (loop until all clean) or individual operations (rebase only, reviews only, label only). Works in both local (worktree) and cloud agent (read-only) modes. Use when asked to clean up PRs, sweep open PRs, fix all PR issues, rebase all PRs, label clean PRs, or get PRs ready to merge.'
---

# Skill: PR Operations

## Overview

Orchestrate PR maintenance across all open PRs. This skill is a **coordinator** — it discovers problems, delegates to specialized sub-skills for the actual fixes, and manages the overall flow.

Supports three modes:

- **Full sweep** (local) — loop through all open PRs fixing conflicts, reviews, and CI until everything is clean
- **Targeted operation** — run a single operation (e.g., "rebase all conflicting PRs", "label clean PRs")
- **Cloud agent sweep** — scan, triage, and take all API-only actions (label, re-run CI, resolve threads, request reviews); report remaining items that require code changes

## Environment Compatibility

| Operation                          | Local Agent | Cloud Agent | Cloud Tool                                 |
| ---------------------------------- | :---------: | :---------: | ------------------------------------------ |
| Scan & classify all PRs            |     ✅      |     ✅      | `github_pr_dashboard`                      |
| Detailed PR inspection             |     ✅      |     ✅      | `github_view_pr`, `github_pr_batch_status` |
| Label clean PRs `merge-when-ready` |     ✅      |     ✅      | `github_manage_labels`                     |
| Request Copilot reviews            |     ✅      |     ✅      | `github_request_review`                    |
| Re-run flaky / failed CI           |     ✅      |     ✅      | `ci_rerun`                                 |
| Diagnose CI failures (read logs)   |     ✅      |     ✅      | `ci_get_logs`, `ci_search_logs`            |
| Resolve process/meta threads       |     ✅      |     ✅      | `github_resolve_thread`                    |
| Fetch review thread details        |     ✅      |     ✅      | `github_get_review_threads`                |
| Rebase conflicting PRs             |     ✅      |     ❌      | — (requires git checkout + push)           |
| Fix review comments (code changes) |     ✅      |     ❌      | — (requires file edits + commit)           |
| Fix CI failures (code changes)     |     ✅      |     ❌      | — (requires file edits + commit)           |
| Post-rebase stabilization          |     ✅      |     ❌      | — (requires make pc + push)                |

> **Cloud agents cannot commit or push code.** Any operation that requires file edits, git commits, or git push must be deferred to a local agent or human developer. The cloud workflow focuses on API-only actions and producing an actionable report.

## When to Use

- "Clean up all open PRs overnight"
- "Sweep open PRs and get them ready to merge"
- "Rebase all conflicting PRs" _(local only)_
- "Fix all review comments across PRs" _(local only)_
- "Label clean PRs as merge-when-ready"
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
| "Label clean PRs" / "merge-when-ready"             | Label step only                                  |   ✅   |
| "Request Copilot reviews"                          | Request reviews on unreviewed PRs                |   ✅   |
| "Check PR status" / "scan PRs"                     | Scan + report only (no fixes)                    |   ✅   |

## Sub-Skills (Load on Demand)

This skill delegates to specialized sub-skills for each operation category. Load them when you encounter that problem type:

| Operation               | Sub-Skill                                 | When to Load                                 | Cloud? |
| ----------------------- | ----------------------------------------- | -------------------------------------------- | :----: |
| Rebase conflicting PRs  | `skills/rebase-conflicts/SKILL.md`        | PR has merge conflicts                       |   ❌   |
| Resolve merge conflicts | `skills/resolve-merge-conflicts/SKILL.md` | Rebase produces conflicts needing manual fix |   ❌   |
| Fix review comments     | `skills/fix-copilot-reviews/SKILL.md`     | PR has unresolved Copilot review threads     |   ❌   |
| Debug CI failures       | `skills/debug-ci-failure/SKILL.md`        | PR has failing CI checks                     |   ❌   |
| Enter a worktree        | `skills/worktree-workflow/SKILL.md`       | Need to create or access a PR's worktree     |   ❌   |
| Create a PR             | `skills/create-pr/SKILL.md`               | Need to open a new PR after fixes            |   ❌   |

## Prerequisites

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

- **Remove `@me` filter** — use `--limit 200` to catch all open PRs, not just yours
- **Resolve review threads after fixing** — leaving threads unresolved is incomplete work
- **Label step is REQUIRED** — the sweep is NOT complete until clean PRs are labeled `merge-when-ready`. Stopping after fixes without labeling is the most common sweep failure mode.
- **Wait for CI before labeling** — if all fixes are pushed but CI is still `mixed`/pending, poll every 3 minutes (max 5 polls) until runs complete. Only then scan and label. Do not skip labeling because CI hasn't finished yet.
- **Dashboard CI summary can be stale** — the dashboard reports `ciStatus` as `none`, `pass`, `fail`, or `pending`. Stale checks (e.g., Enhanced Merge Queue on an old SHA) can cause a PR to show `fail` or `pending` even when current-SHA checks all pass. Use `github_pr_batch_status` to inspect actual job-level results: if all CI Pipeline and Security Scanning jobs are SUCCESS/SKIPPED, the PR is clean regardless of dashboard `ciStatus`.

### Local Agent Only

- **One worktree per PR** — never mix fixes for different PRs in the same worktree
- **All file edits happen in the worktree**, never in `D:\code\legacy-sports`
- **Always `make pc` before pushing** — do not push broken code
- **Always `--force-with-lease`** when pushing rebased branches

### Cloud Agent Only

- **Never attempt git commit or push** — cloud agents cannot modify branches
- **Use MCP tools over raw `gh` commands** — the MCP servers handle error formatting and retries
- **Always produce an actionable report** — flag items that need a local agent or human developer

---

# Local Agent Workflow

> The following steps (Step 1 through Full Sweep) require a **local agent** with worktree access, git push, and `make pc`. For cloud agents, skip to [Cloud Agent Mode](#cloud-agent-mode) below.

## Step 1: Scan All Open PRs

Every operation starts with a scan. This produces a single snapshot used by all passes.

```powershell
Set-Location D:\code\legacy-sports
.\scripts\scan-prs.ps1
$scan = Get-Content scratch/pr-scan.json | ConvertFrom-Json
```

The scan produces categorized lists:

| Field               | Contains                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| `$scan.totalOpen`   | Total open PR count                                                              |
| `$scan.conflicting` | PRs with merge conflicts (`{ number, title, headRefName }`)                      |
| `$scan.reviews`     | PRs with unresolved review threads (`{ number, title, headRefName, threads[] }`) |
| `$scan.ciFailing`   | PRs with failing CI (`{ number, title, headRefName, failedChecks[] }`)           |
| `$scan.ciPending`   | PRs with in-progress CI (`{ number, title, headRefName }`)                       |
| `$scan.clean`       | PRs with no issues (MERGEABLE, CI passing, no unresolved threads)                |

Print the summary:

```powershell
Write-Host "Open PRs: $($scan.totalOpen)"
Write-Host "  Conflicting: $($scan.conflicting.Count)"
Write-Host "  Unresolved reviews: $($scan.reviews.Count)"
Write-Host "  CI failing: $($scan.ciFailing.Count)"
Write-Host "  CI pending: $($scan.ciPending.Count)"
Write-Host "  Clean: $($scan.clean.Count)"
```

> For a **scan-only** request, stop here and report the results.

---

## Step 2: Enter a PR Worktree

Every fix operation needs a worktree. Use this shared pattern:

```powershell
Set-Location D:\code\legacy-sports
$branch = $pr.headRefName
$wtPath = .\scripts\pr-enter-worktree.ps1 -Branch $branch
Set-Location $wtPath
```

Always return to the main repo before processing the next PR:

```powershell
Set-Location D:\code\legacy-sports
```

---

## Pass 1: Rebase Conflicting PRs

For each PR in `$scan.conflicting`:

1. Enter the worktree (Step 2)
2. Rebase: `.\scripts\rebase-pr.ps1 -Branch $branch`
3. If conflicts arise → load `skills/rebase-conflicts/SKILL.md` and `skills/resolve-merge-conflicts/SKILL.md`
4. After rebasing ALL PRs, batch-validate with parallel `make pc` (see Parallelization Strategy below)
5. Push passing PRs: `git push --force-with-lease origin HEAD`

If a rebase fails irrecoverably: `git rebase --abort`, log it, move on.

> **Full step-by-step rebase instructions** are in `skills/rebase-conflicts/SKILL.md`. Do not duplicate them here — load the skill.

---

## Pass 2: Fix Unresolved Review Comments

For each PR in `$scan.reviews`:

1. Enter the worktree (Step 2)
2. **Load `skills/fix-copilot-reviews/SKILL.md`** — it contains the full workflow: reading comments, applying fixes, validating, committing, resolving threads, and the common-patterns reference table
3. After pushing, re-check for new threads (Copilot re-reviews on push)

> **Label reminder**: After the outer loop completes, the Label step adds `merge-when-ready` to all clean PRs. Do NOT label PRs during this pass.

---

## Pass 3: Fix Failing CI

For each PR in `$scan.ciFailing`:

### 3a. Automated CI Triage

Before diving into manual debugging, use existing CI MCP tools to diagnose the failure:

1. **Get logs**: `ci_get_logs(runId: <runId>)` to retrieve full CI output
2. **Search for patterns**: `ci_search_logs(runId: <runId>, pattern: "error|failed|Error")` to find failure points
3. **Classify** the failure based on log output and apply the appropriate fix:

| Classification   | Fix Action                                                                |
| ---------------- | ------------------------------------------------------------------------- |
| `formatting`     | Run `pnpm exec nx format:write` in the worktree, commit and push          |
| `stale_branch`   | Rebase onto main via `worktree_rebase`, then re-run CI                    |
| `codegen`        | Run `make codegen` in the worktree, commit and push                       |
| `type_error`     | Check if error exists on main — if not, rebase (stale); if so, manual fix |
| `test_failure`   | Load `skills/debug-ci-failure/SKILL.md` for investigation                 |
| `lint`           | Run `pnpm exec nx affected -t lint --fix`, commit and push                |
| `flaky`          | Re-run CI: `ci_rerun(runId: <id>, failedOnly: true)` — no code change     |
| `infrastructure` | Re-run CI — timeout or GitHub Actions infra issue                         |
| `unknown`        | Load `skills/debug-ci-failure/SKILL.md` for manual investigation          |

### 3b. Stale Branch Detection

The most common CI failure is **type errors from stale branches** — errors that don't exist on main but appear because the PR branch is missing recent main commits. Signs:

- Type errors referencing identifiers that exist on main but not on the branch
- "Duplicate identifier" errors from overlapping PRs
- Import errors for modules that were renamed/moved on main

**Fix**: Rebase the branch onto main using `worktree_rebase`, then re-run CI. No code changes needed.

### 3c. Stale CI Labels

During triage, clean up stale `ci-failure-*` labels. The `github_pr_scan` tool already syncs these labels automatically (`applyLabels: true`), but if you spot stale labels during manual triage:

- If CI re-ran and passed after a previous failure, remove the failure label
- Use `github_manage_labels(number: <PR#>, remove: ["ci-failure-lint"])` to clean up

### 3d. Manual Debugging Fallback

If automated classification returns `unknown` or the auto-fix doesn't resolve the issue:

1. Enter the worktree (Step 2)
2. **Load `skills/debug-ci-failure/SKILL.md`** — it contains the full diagnostic playbook
3. Apply the fix based on error category
4. Validate: `make pc`
5. Commit and push

### Pending CI

PRs in `$scan.ciPending` are NOT skipped — continue with other work and circle back. If pending CI is the only remaining work, wait ~3 minutes and re-scan.

---

## Label Clean PRs for Merge (REQUIRED)

> **Do NOT stop before this step.** Fixing code without labeling clean PRs defeats the purpose of the sweep. If CI is still running, wait and re-scan — do not skip.

After all fixes (or as a standalone operation), add `merge-when-ready` to every clean PR. If most PRs show stale `ciStatus` (`fail` or `pending` due to old-SHA checks), use `github_pr_batch_status` to inspect job-level results — a PR is clean if all CI Pipeline and Security Scanning jobs are SUCCESS/SKIPPED, even when the dashboard disagrees:

```powershell
# Re-scan to get final state
Set-Location D:\code\legacy-sports
.\scripts\scan-prs.ps1
$scan = Get-Content scratch/pr-scan.json | ConvertFrom-Json

foreach ($pr in $scan.clean) {
  $labels = (gh pr view $pr.number --json labels | ConvertFrom-Json).labels.name
  if ($labels -notcontains 'merge-when-ready') {
    Write-Host "PR #$($pr.number) ($($pr.title)) — adding merge-when-ready"
    gh pr edit $pr.number --add-label "merge-when-ready"
  } else {
    Write-Host "PR #$($pr.number) ($($pr.title)) — already labeled"
  }
}
```

> **Stale-check gap**: The loop above only iterates `$scan.clean`, which won't include PRs misclassified by stale checks. When the dashboard marks PRs as `fail` or `pending` due to old-SHA checks, use `github_pr_batch_status` to identify PRs where all current-SHA CI Pipeline and Security Scanning jobs are SUCCESS/SKIPPED, then label them directly via `github_manage_labels(number: <PR#>, add: ["merge-when-ready"])`.

> **Only add `merge-when-ready`**. Do **not** add or remove `merge-to-parent` — that label is managed manually for stacked PRs targeting non-main branches.

---

## Full Sweep: Outer Loop

For full sweeps, run passes 1–3 in a loop (max 5 iterations) until all PRs are clean. Fixing one category often creates issues in another (rebase → CI fail, fix → new review).

**Algorithm:**

1. Scan all open PRs (Step 1)
2. Pass 1: Rebase all conflicting PRs
3. Pass 2: Fix all unresolved review comments
4. Pass 3: Fix all CI failures
5. Validate all changed PRs: `make pc` in each worktree
6. Repeat passes 1–3 until no new changes are made (or max 5 iterations)
7. Label all clean PRs `merge-when-ready`

> 📎 **Parallelization details**: see [references/sweep-and-parallelization.md](references/sweep-and-parallelization.md)

---

## Final Summary

After completion, print a summary table:

```
| PR    | Title                        | Conflicts | Reviews | CI      | Label            | Status         |
|-------|------------------------------|-----------|---------|---------|------------------|----------------|
| #101  | feat(scoring): new algo      | Rebased   | Fixed 3 | —       | merge-when-ready | ✅ Clean       |
| #102  | fix(ui): button color        | —         | —       | Fixed   | merge-when-ready | ✅ Clean       |
| #103  | feat(db): add index          | Failed    | —       | —       | —                | ⚠️ Needs human  |
| #104  | chore(deps): bump lodash     | —         | Fixed 1 | Fixed   | merge-when-ready | ✅ Clean       |
| #105  | feat(ws): reconnect logic    | —         | —       | Pending | —                | ⏳ CI running   |
```

Report:

- Total PRs processed
- Issues fixed per category (conflicts, reviews, CI)
- PRs labeled `merge-when-ready` (count)
- Any PRs that could not be fixed (with reason)
- Any PRs where CI was still running at exit
- Number of passes required

---

# Cloud Agent Mode

Cloud agents (Copilot Coding Agent) cannot commit or push code. This section covers the full cloud-compatible workflow: scan, triage, take all API-only actions, and produce an actionable report for items that need a local agent.

**Available MCP servers:** `legacy-sports-github`, `legacy-sports-ci`

## Cloud Step 1: Scan All Open PRs

Use the `github_pr_dashboard` MCP tool to get a full snapshot of all open PRs in a single call. It returns mergeable status, CI status, unresolved review threads, labels, and review decision for each PR.

```
github_pr_dashboard(state: "open", limit: 100)
```

The response includes a `summary` object with counts (`total`, `conflicting`, `ciFailing`, `ciPending`, `ciPassing`, `withUnresolvedThreads`, `drafts`, `approved`) and a `prs` array with per-PR details.

For detailed inspection of specific PRs, use `github_pr_batch_status` with an array of PR numbers.

> For a **scan-only** request, stop here and report the results.

## Cloud Step 2: Label Clean PRs

A PR is **clean** when all of these are true:

- `mergeable` is `MERGEABLE` (not `CONFLICTING` or `UNKNOWN`)
- `ciStatus` is `pass`
- `unresolvedThreads` is `0`
- Not a draft (`isDraft` is `false`)

For each clean PR that does not already have the `merge-when-ready` label:

```
github_manage_labels(number: <PR#>, add: ["merge-when-ready"])
```

> **Only add `merge-when-ready`**. Do **not** add or remove `merge-to-parent` — that label is managed manually for stacked PRs targeting non-main branches.

## Cloud Step 3: Re-run Flaky / Failed CI

For each PR where `ciStatus` is `fail`, inspect the failed checks to determine if the failure looks transient (flaky test, timeout, infrastructure error) vs. a real code issue.

### 3a. Diagnose the failure

Use the CI MCP tools to read logs:

```
ci_list_runs(branch: "<headRefName>", status: "failure", limit: 1)
ci_get_logs(runId: <runId>, failedOnly: true)
ci_search_logs(runId: <runId>, pattern: "error|FAIL|Error:", context: 5)
```

### 3b. Decide: re-run or defer

| Log Evidence                                     | Action                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| Flaky test (different test fails each run)       | Re-run: `ci_rerun(runId: <id>, failedOnly: true)`    |
| Timeout / infrastructure error                   | Re-run: `ci_rerun(runId: <id>, failedOnly: true)`    |
| Consistent lint/type/build/test error            | **Defer** — flag for local agent (requires code fix) |
| Formatting failure (`nx format:write` would fix) | **Defer** — flag for local agent                     |

```
ci_rerun(runId: <runId>, failedOnly: true)
```

After re-running, the PR moves to `ciPending`. Track these for the final report.

## Cloud Step 4: Request Copilot Reviews

Find PRs without a Copilot review and request one. Use the review details from the dashboard or batch status to identify PRs that have no review from `copilot-pull-request-reviewer[bot]`.

```
github_request_review(number: <PR#>, copilot: true)
```

## Cloud Step 5: Resolve Process / Meta Review Threads

Some review threads suggest no code change — they are process comments, "nice to have" suggestions, or scope observations (pattern #10 in the common Copilot review patterns). These can be resolved directly without code changes.

For each PR with unresolved threads, fetch the thread details:

```
github_get_review_threads(number: <PR#>, unresolvedOnly: true)
```

For each thread, read the comment body. If the thread is a **process/meta comment** that does not require a code change (e.g., "Consider extracting this into a utility in a future PR", "Nice improvement", suggestions about documentation outside the PR scope), resolve it:

```
github_resolve_thread(threadId: "<threadId>")
```

**Do NOT resolve threads that request actual code changes** — those must be deferred to a local agent.

## Cloud Step 6: Final Report

After completing all API-only actions, produce a summary report. This is the primary deliverable of a cloud sweep.

### Summary Table

```
| PR    | Title                        | Mergeable   | CI        | Threads | Label            | Cloud Action         | Status              |
|-------|------------------------------|-------------|-----------|---------|------------------|----------------------|---------------------|
| #101  | feat(scoring): new algo      | MERGEABLE   | pass      | 0       | merge-when-ready | Labeled              | ✅ Clean            |
| #102  | fix(ui): button color        | CONFLICTING | —         | 0       | —                | —                    | ⚠️ Needs rebase     |
| #103  | feat(db): add index          | MERGEABLE   | fail      | 2       | —                | Re-ran CI            | ⏳ CI re-running    |
| #104  | chore(deps): bump lodash     | MERGEABLE   | pass      | 1       | —                | Resolved 1 thread    | ✅ Clean            |
| #105  | feat(ws): reconnect logic    | MERGEABLE   | fail      | 0       | —                | Diagnosed            | 🔧 Needs code fix   |
| #106  | fix(auth): token refresh     | MERGEABLE   | pass      | 3       | —                | Resolved 1 meta      | 🔧 Needs code fix   |
```

### Report Sections

1. **Actions Taken** — list every API action performed:
   - PRs labeled `merge-when-ready` (count + PR numbers)
   - CI runs re-triggered (count + PR numbers + run IDs)
   - Review threads resolved (count + PR numbers)
   - Copilot reviews requested (count + PR numbers)

2. **Deferred to Local Agent** — items that require code changes:
   - PRs with merge conflicts (need rebase)
   - PRs with CI failures requiring code fixes (include the diagnosed root cause)
   - PRs with unresolved review threads requiring code changes (include thread summaries)

3. **Pending** — items where status is not yet final:
   - PRs with CI still running or re-running
   - PRs where Copilot review was just requested (no results yet)

## Cloud Full Sweep Algorithm

For a full cloud sweep, run steps 1–7 in order. Unlike the local sweep, there is no outer loop because the cloud agent cannot fix code issues that cascade.

1. Scan all open PRs (Cloud Step 1)
2. Re-run flaky CI (Cloud Step 3) — do this early so CI has time to complete
3. Request Copilot reviews on unreviewed PRs (Cloud Step 4)
4. Resolve process/meta review threads (Cloud Step 5)
5. Wait ~3 minutes if any CI re-runs were triggered, then re-scan
6. Label all clean PRs (Cloud Step 2)
7. Produce final report (Cloud Step 6)

---

## Troubleshooting

| Problem                                      | Fix                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Rebase aborts repeatedly on same commit      | `git rebase --skip` if commit already applied; load `skills/rebase-conflicts/SKILL.md` |
| Copilot keeps re-reviewing with same comment | After 2 cycles on the same thread, resolve it and move on                              |
| CI failure is flaky (passes on re-run)       | Re-trigger: `gh run rerun $runId --failed` — do not change code                        |
| Too many PRs to process in one session       | Prioritize: conflicts → CI → reviews                                                   |
| `make pc` fails after rebase stabilization   | Load `skills/rebase-conflicts/SKILL.md` for post-rebase steps                          |
