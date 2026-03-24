# PR Maintenance Workflow

Detailed workflow for orchestrating PR maintenance across all open PRs, including local sweep and cloud agent modes.

## Environment Compatibility

| Operation                          | Local Agent | Cloud Agent | Cloud Tool                                  |
| ---------------------------------- | :---------: | :---------: | ------------------------------------------- |
| Scan & classify all PRs            |     Yes     |     Yes     | `github_pr_dashboard`                       |
| Detailed PR inspection             |     Yes     |     Yes     | `github_view_pr`, `github_pr_batch_status`  |
| Request Copilot reviews (fallback) |     Yes     |     Yes     | `github_request_review` (auto via workflow) |
| Re-run flaky / failed CI           |     Yes     |     Yes     | `ci_rerun`                                  |
| Diagnose CI failures (read logs)   |     Yes     |     Yes     | `ci_get_logs`, `ci_search_logs`             |
| Resolve process/meta threads       |     Yes     |     Yes     | `github_resolve_thread`                     |
| Fetch review thread details        |     Yes     |     Yes     | `github_get_review_threads`                 |
| Rebase conflicting PRs             |     Yes     |     No      | — (requires git checkout + push)            |
| Fix review comments (code changes) |     Yes     |     No      | — (requires file edits + commit)            |
| Fix CI failures (code changes)     |     Yes     |     No      | — (requires file edits + commit)            |
| Post-rebase stabilization          |     Yes     |     No      | — (requires make pc + push)                 |

> **Cloud agents cannot commit or push code.** Any operation that requires file edits, git commits, or git push must be deferred to a local agent or human developer. The cloud workflow focuses on API-only actions and producing an actionable report.

## Local Agent — Full Sweep

### Step 1: Scan All Open PRs

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

### Step 2: Enter a PR Worktree

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

### Pass 1: Rebase Conflicting PRs

For each PR in `$scan.conflicting`:

1. Enter the worktree (Step 2)
2. Rebase: `.\scripts\rebase-pr.ps1 -Branch $branch`
3. If conflicts arise — load `skills/rebase/SKILL.md` and `skills/rebase/SKILL.md`
4. After rebasing ALL PRs, batch-validate with parallel `make pc` (see [sweep-and-parallelization.md](sweep-and-parallelization.md))
5. Push passing PRs: `git push --force-with-lease origin HEAD`

If a rebase fails irrecoverably: `git rebase --abort`, log it, move on.

### Pass 2: Fix Unresolved Review Comments

For each PR in `$scan.reviews`:

1. Enter the worktree (Step 2)
2. Use the fix-copilot-reviews workflow (see [fix-copilot-reviews-workflow.md](fix-copilot-reviews-workflow.md))
3. After pushing, re-check for new threads (Copilot re-reviews on push)

> **No manual labeling needed.** The `copilot-auto-approve` bot labels clean PRs automatically after Copilot re-reviews the pushed fixes.

### Pass 3: Fix Failing CI

For each PR in `$scan.ciFailing`:

#### 3a. Automated CI Triage

Use CI MCP tools to diagnose the failure:

1. **Get logs**: `ci_get_logs(runId: <runId>)`
2. **Search for patterns**: `ci_search_logs(runId: <runId>, pattern: "error|failed|Error")`
3. **Classify** and apply fix:

| Classification   | Fix Action                                                                |
| ---------------- | ------------------------------------------------------------------------- |
| `formatting`     | Run `pnpm exec nx format:write` in the worktree, commit and push          |
| `stale_branch`   | Rebase onto main via `worktree_rebase`, then re-run CI                    |
| `codegen`        | Run `make codegen` in the worktree, commit and push                       |
| `type_error`     | Check if error exists on main — if not, rebase (stale); if so, manual fix |
| `test_failure`   | Load `skills/debugging/SKILL.md` for investigation                        |
| `lint`           | Run `pnpm exec nx affected -t lint --fix`, commit and push                |
| `flaky`          | Re-run CI: `ci_rerun(runId: <id>, failedOnly: true)` — no code change     |
| `infrastructure` | Re-run CI — timeout or GitHub Actions infra issue                         |
| `unknown`        | Load `skills/debugging/SKILL.md` for manual investigation                 |

#### 3b. Stale Branch Detection

The most common CI failure is **type errors from stale branches**. Signs:

- Type errors referencing identifiers that exist on main but not on the branch
- "Duplicate identifier" errors from overlapping PRs
- Import errors for modules that were renamed/moved on main

**Fix**: Rebase the branch onto main, then re-run CI.

#### Pending CI

PRs in `$scan.ciPending` are NOT skipped — continue with other work and circle back. If pending CI is the only remaining work, wait ~3 minutes and re-scan.

### Verify Clean PRs Are Labeled

After all fixes, verify that clean PRs have been labeled by the `copilot-auto-approve` bot. If any PRs are missing the label, request a Copilot review to trigger the auto-approve flow:

```
github_request_review(number: <PR#>, copilot: true)
```

> **Only the bot should add `merge-when-ready`**. Do **not** manually add or remove `merge-to-parent` — that label is managed manually for stacked PRs targeting non-main branches.

### Full Sweep: Outer Loop

For full sweeps, run passes 1–3 in a loop (max 5 iterations) until all PRs are clean.

**Algorithm:**

1. Scan all open PRs (Step 1)
2. Pass 1: Rebase all conflicting PRs
3. Pass 2: Fix all unresolved review comments
4. Pass 3: Fix all CI failures
5. Validate all changed PRs: `make pc` in each worktree
6. Repeat passes 1–3 until no new changes are made (or max 5 iterations)
7. Verify clean PRs are labeled (bot handles labeling automatically after Copilot re-review)

> Parallelization details: [sweep-and-parallelization.md](sweep-and-parallelization.md)

### Final Summary

After completion, print a summary table:

```
| PR    | Title                        | Conflicts | Reviews | CI      | Label            | Status         |
|-------|------------------------------|-----------|---------|---------|------------------|----------------|
| #101  | feat(scoring): new algo      | Rebased   | Fixed 3 | —       | merge-when-ready | Clean          |
| #102  | fix(ui): button color        | —         | —       | Fixed   | merge-when-ready | Clean          |
| #103  | feat(db): add index          | Failed    | —       | —       | —                | Needs human    |
| #104  | chore(deps): bump lodash     | —         | Fixed 1 | Fixed   | merge-when-ready | Clean          |
| #105  | feat(ws): reconnect logic    | —         | —       | Pending | —                | CI running     |
```

Report:

- Total PRs processed
- Issues fixed per category (conflicts, reviews, CI)
- PRs labeled `merge-when-ready` (count)
- Any PRs that could not be fixed (with reason)
- Any PRs where CI was still running at exit
- Number of passes required

---

## Cloud Agent Mode

Cloud agents (Copilot Coding Agent) cannot commit or push code. This section covers the full cloud-compatible workflow: scan, triage, take all API-only actions, and produce an actionable report for items that need a local agent.

**Available MCP servers:** `legacy-sports-github`, `legacy-sports-ci`

### Cloud Step 1: Scan All Open PRs

```
github_pr_dashboard(state: "open", limit: 100)
```

The response includes a `summary` object with counts and a `prs` array with per-PR details. For detailed inspection of specific PRs, use `github_pr_batch_status` with an array of PR numbers.

### Cloud Step 2: Verify Clean PRs Are Labeled

The `copilot-auto-approve` workflow automatically requests Copilot reviews and adds `merge-when-ready` when clean. If any clean PRs are missing the label:

```
github_request_review(number: <PR#>, copilot: true)
```

### Cloud Step 3: Re-run Flaky / Failed CI

For each PR where `ciStatus` is `fail`, diagnose then decide:

```
ci_list_runs(branch: "<headRefName>", status: "failure", limit: 1)
ci_get_logs(runId: <runId>, failedOnly: true)
ci_search_logs(runId: <runId>, pattern: "error|FAIL|Error:", context: 5)
```

| Log Evidence                                     | Action                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| Flaky test (different test fails each run)       | Re-run: `ci_rerun(runId: <id>, failedOnly: true)`    |
| Timeout / infrastructure error                   | Re-run: `ci_rerun(runId: <id>, failedOnly: true)`    |
| Consistent lint/type/build/test error            | **Defer** — flag for local agent (requires code fix) |
| Formatting failure (`nx format:write` would fix) | **Defer** — flag for local agent                     |

### Cloud Step 4: Request Copilot Reviews

Find PRs without a Copilot review and request one:

```
github_request_review(number: <PR#>, copilot: true)
```

### Cloud Step 5: Resolve Process / Meta Review Threads

Some review threads suggest no code change — they are process comments or "nice to have" suggestions. For each PR with unresolved threads:

```
github_get_review_threads(number: <PR#>, unresolvedOnly: true)
```

If the thread is a process/meta comment (no code change needed), resolve it:

```
github_resolve_thread(threadId: "<threadId>")
```

**Do NOT resolve threads that request actual code changes.**

### Cloud Step 6: Final Report

Produce a summary report with:

1. **Actions Taken** — PRs labeled, CI re-triggered, threads resolved, reviews requested
2. **Deferred to Local Agent** — PRs with conflicts, CI failures needing code fixes, unresolved code-change threads
3. **Pending** — PRs with CI still running or Copilot review pending

### Cloud Full Sweep Algorithm

1. Scan all open PRs (Cloud Step 1)
2. Re-run flaky CI (Cloud Step 3) — do this early so CI has time to complete
3. Request Copilot reviews on unreviewed PRs (Cloud Step 4)
4. Resolve process/meta review threads (Cloud Step 5)
5. Wait ~3 minutes if any CI re-runs were triggered, then re-scan
6. Verify clean PRs are labeled (Cloud Step 2)
7. Produce final report (Cloud Step 6)

---

## Troubleshooting

| Problem                                      | Fix                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Rebase aborts repeatedly on same commit      | `git rebase --skip` if commit already applied; load `skills/rebase/SKILL.md` |
| Copilot keeps re-reviewing with same comment | After 2 cycles on the same thread, resolve it and move on                    |
| CI failure is flaky (passes on re-run)       | Re-trigger: `ci_rerun(runId: <id>, failedOnly: true)` — do not change code   |
| Too many PRs to process in one session       | Prioritize: conflicts → CI → reviews                                         |
| `make pc` fails after rebase stabilization   | Load `skills/rebase/SKILL.md` for post-rebase steps                          |
