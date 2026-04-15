# Local Agent Pass Playbooks

> This file contains the detailed step-by-step playbooks for each pass in the local agent sweep.
> For the overview, decision table, critical rules, and environment compatibility, see [SKILL.md](SKILL.md).
> For cloud agent mode, see [CLOUD-SWEEP.md](CLOUD-SWEEP.md).

---

## Step 0: Create and Start a Sweep Task

Before scanning, create a task to track the sweep and mark it in progress. This ensures the sweep is accounted for even if the session is interrupted or context rolls over.

```
TaskCreate(subject: "Sweep all open PRs", activeForm: "Sweeping open PRs")
TaskUpdate(taskId: <id>, status: "in_progress")
```

If a sweep task already exists from a previous session (check `TaskList`), mark it `in_progress` rather than creating a duplicate.

Use the `taskId` returned by `TaskCreate` (or, if reusing an existing sweep task, the `taskId` found via `TaskList`) and persist/reuse that same id for all `TaskUpdate` calls in this sweep.

## Step 1: Scan All Open PRs

Every operation starts with a scan. This produces a single snapshot used by all passes.

**MCP (preferred):**

```
github_pr_dashboard(state: "open", limit: 100, excludeDrafts: true)
```

This returns a structured list of open PRs with CI status, review state, labels, and merge state in a single MCP/tool call; the tool may make multiple underlying GitHub API requests — no PowerShell or file I/O needed. Use the returned PR list directly for pass categorization.

Important: `github_pr_dashboard` is capped at 100 results. On the default scan path (without an `author` filter), results are sorted by `UPDATED_AT` descending. For repos with >100 open PRs, use label filters for additional runs, or use author filters only when needed and do not assume the same `UPDATED_AT` ordering; alternatively use the `scan-prs.ps1 -Limit` shell fallback.

**Shell fallback** (only if `github_pr_dashboard` MCP tool is unavailable):

```powershell
Set-Location D:\code\legacy-sports
.\scripts\scan-prs.ps1
$scan = Get-Content scratch/pr-scan.json | ConvertFrom-Json
```

When using the shell fallback, the scan produces categorized lists:

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

## Step 2: Find and Enter a PR Worktree

Every fix operation needs a worktree. **Use `worktree_list` to discover existing worktrees** — do not use `ls D:/code/legacy-sports-worktrees/ | grep` or similar shell patterns.

### Discover worktrees (MCP)

```
worktree_list()
```

This returns all worktrees with paths, branches, and ticket IDs. Match the PR's branch name or ticket number from the response to find the correct worktree path. Then set it active:

```
worktree_set(key: "LS-####")
```

> **Disambiguation**: `worktree_set` resolves by ticket key, full branch name, or directory name. If multiple worktrees share the same ticket key (e.g., `LS-1234/feature-a` and `LS-1234/feature-b`), passing just `LS-1234` will return an ambiguity error. In that case, pass the full branch name or directory name from the `worktree_list` response instead (e.g., `worktree_set(key: "LS-1234/feature-a")`).

### Create a worktree if none exists

If no worktree exists for the PR's branch, create one using the worktree workflow skill.

### Shell fallback

Only when MCP is unavailable:

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

## Pass 0: API-Fast Triage (No Git Required)

Before any git operations, settle as many PRs as possible via API-only actions. This pass typically completes in ~2 minutes and reduces the set of PRs requiring expensive worktree operations (rebase, code fix, `make pc`).

**All actions in this pass are API-only — no worktree, git checkout, or push needed.**

### 0a. Request Copilot Reviews

Ensure every open PR has a Copilot review. The repository ruleset (`review_on_push: true`) auto-triggers Copilot for user-authored PRs, but **not for PRs authored by GitHub Apps** (the `requestReviewers` REST API silently drops Copilot when called with installation tokens). Since most agent-created PRs are authored by `legacy-sports-code-bot`, this step is essential.

For each PR without a Copilot review (check `github_pr_batch_status(numbers: [...], compact: false)` results — the `reviews` field is available in `github_pr_batch_status` and `scan-prs.ps1` output, not in `github_pr_dashboard` rows). **Note**: `github_pr_batch_status` accepts at most 50 PR numbers per call — chunk larger lists into batches of ≤50 before calling.

```
github_request_review(prs: [<PR#>])
```

The MCP tool uses a user OAuth token (via `gh auth token`) for Copilot requests, bypassing the default app token that would silently fail.

> **Also treat stale `COMMENTED` reviews as missing**: if a bot-authored PR has a Copilot review in `COMMENTED` state with **0 unresolved threads**, re-request a Copilot review. Copilot does not re-review automatically when threads are resolved externally — leaving `reviewDecision` as `null` and `auto-approve` permanently SKIPPED. Detect this using the actual tool fields: latest Copilot review `state === "COMMENTED"` from `github_pr_batch_status`/`view_pr`, plus no open threads (`threadCount === 0` in `github_pr_scan` or `unresolvedThreads === 0` where available).

### 0b. Handle Dependabot PRs (Comment-Only)

Identify all Dependabot PRs in the scan results and handle them via comments only. When using `github_pr_scan` results (which do not include `author`), treat a PR as Dependabot if its `headRefName`/branch starts with `dependabot/`. When using richer data from `github_pr_dashboard` or `github_pr_batch_status`, you may additionally check `author.login == "dependabot[bot]"`.

For each Dependabot PR, apply exactly one action based on its state:

| PR State                         | Action                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Conflicting or stale/failing CI  | Post PR comment: `@dependabot rebase`                                                                     |
| Clean (no conflicts, CI passing) | Label `merge-when-ready` via `github_manage_labels`                                                       |
| Has unresolved review threads    | Label `requires-human-review` — note: Dependabot PR has unresolved human review threads; do not auto-edit |

Dependabot PRs are only considered **settled** when they are either clean (labeled `merge-when-ready`) or labeled `requires-human-review`. After posting `@dependabot rebase`, the PR is settled for the current pass — Dependabot handles the rebase asynchronously and the updated branch will appear in the next sweep.

Post a Dependabot command comment using the `gh` CLI:

```bash
gh pr comment <PR#> --body "@dependabot rebase"
```

> **MCP vs. `gh` note** — An MCP tool exists for posting generic PR comments, but use `gh pr comment` for Dependabot commands. This is a deliberate exception to the "prefer MCP tools over raw `gh` commands" rule because Dependabot command handling may depend on the authenticated GitHub user/session that posts the comment. Ensure `gh` is authenticated with an account that has write access to the repository so Dependabot commands are accepted.

After posting a rebase command, the PR enters a "commanded" state. Dependabot handles the rebase asynchronously — the updated branch will appear in the next sweep with fresh status. Mark the PR as settled for the current pass.

**Remove Dependabot PRs from all subsequent passes (1, 2, 3)** — never enter their worktrees, modify their branches, or attempt code fixes.

### 0c. Label Already-Clean PRs

Any PR that is already mergeable, CI passing, and has no unresolved threads can be labeled immediately — no git operation needed:

```
github_manage_labels(prs: [<PR#>], add: ["merge-when-ready"])
```

Add these PRs to `settled` immediately.

### 0d. Re-run Transient CI Failures

For PRs with CI failures that look transient (flaky tests, infrastructure timeouts), re-run immediately so CI has time to complete while later passes do git work:

```
ci_rerun(runId: <id>, failedOnly: true)
```

Do not re-run CI for failures that clearly need code fixes (type errors, lint errors, test assertion failures). Those are handled in Pass 3.

### 0e. Resolve Process/Meta Review Threads

Some review threads suggest no code change — they are process comments or "nice to have" suggestions. Resolve these without code changes:

> **Do not write Python/GraphQL scratch scripts to check review threads in this pass.** Use `github_get_review_threads` directly — it returns structured thread data (id, body, resolved, author). If `github_get_review_threads` is unavailable, stop and escalate instead of improvising with `gh api graphql` here.

```
github_get_review_threads(number: <PR#>, unresolvedOnly: true)
```

For each thread that is a process/meta comment (not requesting code changes), resolve it directly:

```
github_resolve_thread(threadId: "<threadId>")
```

After resolving all meta threads, if no code-change threads remain, the PR may now be clean — label it `merge-when-ready` and add to `settled`.

---

## Pass 1: Rebase Conflicting PRs

### Disjoint-File Parallel Rebase

Before rebasing, analyze which PRs can be rebased in parallel by checking for file overlap:

1. For each conflicting PR, collect changed file paths: `github_pr_files(number: <PR#>)` or `git diff --name-only origin/main...origin/<branch>`
2. Build a dependency graph: PRs with **overlapping file paths** must be serialized; PRs with **disjoint files** can rebase concurrently
3. Group PRs into parallel batches (max 3 concurrent, matching sub-agent concurrency limit)
4. Within each batch, PRs rebase independently since they touch disjoint files — a merge to main from one cannot create conflicts in another
5. **Fall back to fully sequential** if: file overlap analysis fails, fewer than 3 conflicting PRs, or PRs share files in high-churn areas (e.g., `package.json`, `pnpm-lock.yaml`, `schema.graphql`)

> **Why this is safe**: the original "cascade invalidation" concern applies when rebasing PR A shifts main in a way that affects PR B's rebase. If A and B touch completely different files, A's rebase cannot introduce conflicts in B's files. The cascade only matters for overlapping paths.

For each PR (sequentially within a dependency chain, or in parallel for disjoint batches):

1. Enter the worktree (Step 2)
2. **Rebase via MCP**: `worktree_rebase(worktree: "LS-####")` — this fetches the latest remote state and rebases onto the parent branch in one operation. Worktrees have their own fetch state and may be stale even if the main repo fetched recently.
3. If conflicts arise → load `skills/rebase/SKILL.md` and `skills/resolve-merge-conflicts/SKILL.md`
4. **Post-rebase stabilization**: `worktree_stabilize(worktree: "LS-####")` — reinstalls deps, regenerates schema, and runs affected codegen so `make pc` does not fail on stale artifacts.

### Lightweight vs. Full Validation

After rebasing, choose the validation level based on rebase outcome:

| Condition                                                                 | Validation                                          | Rationale                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Rebase had **zero conflicts** AND PR's last CI run **passed** on old base | **Lightweight**: `codegen` → `typecheck` → `format` | Code unchanged — only base moved; lint/test/build results won't differ |
| Rebase had **conflicts** OR last CI **failed**                            | **Full**: `make pc` (all 9 steps)                   | Conflict resolution or pre-existing failures need complete validation  |
| Rebase touched **lock files** (`pnpm-lock.yaml`) or **schema**            | **Full**: `make pc`                                 | Dependency/schema changes can cascade unpredictably                    |

After validation:

6. **Dirty-tree guard**: after validation passes, run `worktree_status(worktree: "LS-####")`. If dirty (e.g., `tsconfig.base.json` reformatted), commit with `worktree_commit(message: "style: apply formatting after rebase", worktree: "LS-####")` and re-run validation.
7. Push passing PRs: `worktree_push(worktree: "LS-####")`
8. **Verify mergeability after push** — do not assume CONFLICTING status clears automatically:
   - GitHub's mergeability check typically updates within 2–3 minutes after a force-push
   - If a PR still shows CONFLICTING more than **5 minutes** after the push, treat it as a **real conflict** — do not dismiss as cache lag
   - Verify with: `worktree_run(worktree: "LS-####", command: "git fetch origin && git merge-base --is-ancestor origin/main HEAD")` — command must exit successfully (status 0)
   - If the `merge-base --is-ancestor` check fails (non-zero exit status): new commits merged to main after the rebase — rebase again
   - Only mark a PR as "resolved" after it shows MERGEABLE, or the `git merge-base --is-ancestor` check confirms the branch tip is based on current main

> **"Cache lag" expiry**: the 2–3 minute window is the only safe assumption. After 5 minutes, always verify with `git merge-base --is-ancestor origin/main HEAD` — a failing check (non-zero exit status) plus persistent CONFLICTING status is almost certainly a real conflict. Batch sweeps are especially at risk: new PRs can merge to main between individual rebases in a long batch, creating fresh conflicts on already-pushed branches.

> **Shell fallback** (only when MCP unavailable): `git -C "$wtPath" fetch origin && git -C "$wtPath" rebase origin/main`, then `git -C "$wtPath" push --force-with-lease origin HEAD`.

> **Multiple PRs touching the same files**: When several PRs add code to the same location (e.g., tool registrations in `index.ts`), they conflict with each other — not just with main. After one merges, the next will conflict with the updated main. Rebase these sequentially, fetching whenever `main` changes (e.g., after each merge and before rebasing the next PR). Consider alphabetizing shared files (imports, registrations) so git can auto-merge concurrent additions.

If a rebase fails irrecoverably: `git rebase --abort`, comment on the PR with the failure reason, and move on. Only label `requires-human-review` if the conflict requires human judgment (e.g., schema design decisions) — routine merge conflicts should be retried in a future sweep. The PR is now **settled**.

> **Full step-by-step rebase instructions** are in `skills/rebase/SKILL.md`. Do not duplicate them here — load the skill.

---

## Pass 2: Fix Unresolved Review Comments

**Parallel by default** — PRs with review comments are independent and can be fixed concurrently. Spawn up to 3 sub-agents, each working in its own worktree. See [sweep-and-parallelization.md](../pr-lifecycle/references/sweep-and-parallelization.md) for the agent prompt template and failure handling.

For each PR in the review-comments bucket from Step 1's `github_pr_dashboard` result (in parallel batches of 3):

1. Enter the worktree (Step 2)
2. **Load `skills/pr-lifecycle/SKILL.md`** — it contains the full workflow: reading comments, applying fixes, validating, committing, resolving threads, and the common-patterns reference table
3. After pushing, re-check for new threads (Copilot re-reviews on push)
4. If a review fix sub-agent **cannot complete the task but runs successfully**, analyze why, and optionally do **one** orchestrator-driven retry with a different approach (e.g., read the module source, check related files for patterns, try an alternative implementation). If it still cannot resolve the comments, comment on the PR with the diagnosed blocker. Only label `requires-human-review` if the blocker is outside agent reach (needs credentials, product decisions, or external dependencies) — otherwise leave it unlabeled for a future sweep attempt. If the sub-agent **execution itself fails** (crash, timeout, or tool error), do not retry — comment on the PR with the failure details and continue to the next PR (do not label, as the failure may be transient).

> **Re-request Copilot review after resolving threads on bot-authored PRs**: for each bot-authored PR where review threads were resolved in this pass (either by code fix + push or by resolving meta threads), call `github_request_review(prs: [<PR#>])`. This only asks Copilot to review again; it does **not** itself emit a `pull_request_review` event. When Copilot actually submits a new review, GitHub emits `pull_request_review: submitted`, which triggers the `review-check` job; on successful completion, the `auto-approve` job (configured in `.github/workflows/copilot-auto-approve.yml` to run on `workflow_run`) can then approve and label the PR. If you skip the explicit re-request, Copilot never re-reviews, so no new `pull_request_review` event is fired and the auto-approve flow never runs, leaving approvals stuck.

> **No manual labeling needed.** The `copilot-auto-approve` bot labels clean PRs automatically after Copilot re-reviews the pushed fixes.
>
> **Fall back to sequential** when fewer than 3 PRs need fixes or when PRs touch overlapping files.

---

## Pass 3: Fix Failing CI

**Parallel by default** — CI fixes for different PRs are independent. After the orchestrator classifies each failure (3a), spawn up to 3 sub-agents for PRs that need code fixes. PRs needing only a CI re-run (`flaky`, `infrastructure`) are handled inline by the orchestrator — no sub-agent needed. See [sweep-and-parallelization.md](../pr-lifecycle/references/sweep-and-parallelization.md) for details.

For each PR in the derived `ciFailing` bucket (from `github_pr_dashboard` in the preferred path, or `$scan.ciFailing` only in the shell fallback path), process in parallel batches of 3 for code fixes:

### 3a. Automated CI Triage

Before diving into manual debugging, use existing CI MCP tools to diagnose the failure:

1. **Get logs**: `ci_get_logs(runId: <runId>)` to retrieve logs from failed CI steps
2. **Search for patterns**: `ci_search_logs(runId: <runId>, pattern: "error|failed|Error", isRegex: true)` to find failure points
3. **Classify** the failure based on log output and apply the appropriate fix:

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

### 3b. Stale Branch Detection

The most common CI failure is **type errors from stale branches** — errors that don't exist on main but appear because the PR branch is missing recent main commits. Signs:

- Type errors referencing identifiers that exist on main but not on the branch
- "Duplicate identifier" errors from overlapping PRs
- Import errors for modules that were renamed/moved on main

**Fix**: Rebase the branch onto main using `worktree_rebase`, then re-run CI. No code changes needed.

### 3c. Remove CI Failure Labels After a Successful Fix

**After every successful CI fix push**, remove all `ci-failure-*` labels from the PR. The CI system re-adds them automatically if CI fails again, so clearing them avoids stale labels misleading the next sweep pass.

```
github_clear_ci_failure_labels(number: <PR#>)
```

Call this after push succeeds — not before — so a failed push doesn't prematurely clear the labels. The tool fetches current labels, filters to `ci-failure-*`, and removes all matches in one call. It no-ops cleanly if none are present.

The `github_pr_scan` tool syncs these labels automatically (`applyLabels: true`) on each scan, but it only runs at pass boundaries. Removing labels inline after each fix keeps the scan snapshot accurate during a pass and prevents the orchestrator from re-queuing an already-fixed PR.

### 3d. Manual Debugging Fallback

If automated classification returns `unknown` or the auto-fix doesn't resolve the issue:

1. Enter the worktree (Step 2)
2. **Load `skills/debugging/SKILL.md`** — it contains the full diagnostic playbook
3. Apply the fix based on error category
4. Validate: `make pc`
5. Commit and push
6. **Remove CI failure labels**: `github_clear_ci_failure_labels(number: <PR#>)` — the CI system will re-add them if the fix didn't hold
7. If the fix attempt fails, comment on the PR with the diagnosed root cause and what was attempted. Only label `requires-human-review` if the failure requires something outside agent reach — otherwise leave it unlabeled for a future sweep. The PR is now **settled**.

### Pending CI

PRs with dashboard status `pr.ciStatus == "pending"` are NOT skipped — continue with other work and circle back. If pending CI is the only remaining work in **local mode**, wait ~3 minutes and re-scan. In **cloud mode**, do **not** sleep/poll — record the pending runs in the report and exit (a later sweep will pick them up).

### Early CI Failure Detection (Required)

After pushing any rebased or fixed branch, **do not wait for the full CI run to complete**. Individual jobs complete independently — Build Validation can fail at minute 4 while Quality Gates doesn't finish until minute 10. Poll per-job status to detect failures early and begin triage immediately:

```
After pushing branch:
  1. Get in-progress run: ci_list_runs(branch: branchName, commit: headSha, status: "in_progress", limit: 1)
  2. Poll with ci_view_run(runId, includeJobs: true) every ~60s
  3. As soon as ANY job shows conclusion: "failure":
     → Identify the failing job's jobId from ci_view_run(..., includeJobs: true)
     → Fetch logs: ci_get_logs(jobId: jobId)
     → Begin fixing immediately — don't wait for full run
  4. If all critical jobs pass (Quality Gates + Build Validation):
     → Mark PR as "CI pending E2E" and move to next PR
```

**Impact**: Detects failures ~5-8 min earlier per PR. Particularly valuable when multiple PRs have the same root cause — fix one, apply the pattern to all.

This is **required behavior**, not optional. Interleave CI polling with other pass work — while waiting for PR A's CI, start working on PR B.

---

## Copilot Review Catch-Up

After Passes 1-3, Copilot may have re-reviewed pushed changes. Instead of waiting for Copilot inline (which adds ~3 min per PR), batch-check all PRs that were modified in this pass:

1. For each PR that was pushed in Passes 1-3, check for new unresolved Copilot threads:
   ```
   github_get_review_threads(number: <PR#>, unresolvedOnly: true)
   ```
2. If new threads appeared, queue the PR for the next Pass 2 iteration
3. For bot-authored PRs where all threads are now resolved, explicitly request Copilot re-review to trigger auto-approve:
   ```
   github_request_review(prs: [<PR#>])
   ```

This decouples Copilot review from the critical path — the sweep continues working while Copilot reviews asynchronously, and catches up in a batch at the end of each pass cycle.

---

## Label Clean PRs

After each pass, proactively label PRs that have no unresolved review threads with `merge-when-ready`:

```
github_manage_labels(prs: [<PR#>], add: ["merge-when-ready"])
```

This is safe to do even if CI is still running or pending — failing CI will automatically remove the label. Do not wait for the `copilot-auto-approve` bot; label immediately when reviews are clean.

> **Do not manually add or remove `merge-to-parent`** — that label is managed manually for stacked PRs targeting non-main branches.

---

## Full Sweep: Outer Loop

> **Cloud-mode short-circuit**: this outer loop is **local-only**. Passes 1–3 all require `git commit` / `git push` and will never settle any PR when run from a cloud agent, so the 10-pass `REPEAT` will spin until the session times out (the #1 cause of "sweep-prs hangs in cloud"). If you cannot commit and push code in your current environment, **stop here and jump to [CLOUD-SWEEP.md](CLOUD-SWEEP.md)** — run its steps 1–8 exactly once, then produce the report. Do not sleep or poll.

For full sweeps, run passes 0–3 in a loop until every PR is **settled** — either clean, CI-pending, or labeled `requires-human-review` for a blocker outside agent reach. Fixing one category often creates issues in another (rebase → CI fail, fix → new review), so multiple passes are expected.

The outer loop uses `sweep-claimed` labels to coordinate across agents. This is always active — it's a no-op overhead when running solo (claims never contend) and automatically prevents duplicate work when multiple agents run simultaneously.

**Settled states** — a PR is settled when it reaches any of these terminal states:

| State                     | Meaning                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| **Clean**                 | No conflicts, CI passing, no unresolved threads                       |
| **requires-human-review** | Blocker is outside agent reach (see Critical Rules for valid reasons) |
| **CI pending (final)**    | CI is running after the last fix pass — settled on exit               |

**Algorithm:**

```
# Startup: ensure coordination labels exist
github_ensure_sweep_labels()
# (shell fallback only if MCP unavailable)
# gh label list --search "sweep-" --json name | grep -q "sweep-claimed" \
#   || gh label create "sweep-claimed" --color "e4e669" --description "Sweep agent actively working on this PR"
# gh label list --search "sweep-" --json name | grep -q "sweep-stale-claim" \
#   || gh label create "sweep-stale-claim" --color "d93f0b" --description "sweep-claimed was not cleaned up — claiming agent may have crashed"

# Optional: reclaim stale sweep-claimed labels before scanning (long sweeps >20 PRs)
#   github_sweep_stale_claims(olderThanMinutes: 30)
#   → for each stale PR: gh pr edit <n> --remove-label "sweep-claimed" --add-label "sweep-stale-claim"
#                         gh pr edit <n> --remove-label "sweep-stale-claim" --add-label "sweep-claimed"

settled = {}  # PR numbers that have reached a terminal state

REPEAT (max 10 passes):
  Scan all open PRs, excluding drafts (Step 1):
    dashboard = github_pr_dashboard(state: "open", limit: 100, excludeDrafts: true)
  # Prefer github_pr_dashboard over github_pr_scan — it returns richer data (CI status,
  # labels, review state, merge state) in one MCP/tool call, eliminating the scan-prs.ps1 round-trip.
  # github_pr_dashboard returns { summary, prs: [...] }. Categorize each PR from prs[] using:
  #   mergeable       → "MERGEABLE" | "CONFLICTING" | "UNKNOWN"
  #   ciStatus        → "pass" | "fail" | "pending" | "none"
  #   reviewDecision  → "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null
  #   unresolvedThreads → number of open review threads
  #   labels          → string[] of label names
  # Label-based exclusion (e.g. "sweep-claimed") must be done via post-filtering.
  all_prs = dashboard.prs  # full list returned by github_pr_dashboard
  workable = [pr for pr in all_prs if pr.number not in settled
                                   and "sweep-claimed" not in pr.labels]
  # Derive buckets from pr fields:
  #   conflicting  = [pr for pr in workable if pr.mergeable == "CONFLICTING"]
  #   ciFailing    = [pr for pr in workable if pr.ciStatus == "fail"]
  #   ciPending    = [pr for pr in workable if pr.ciStatus == "pending"]
  #   reviews      = [pr for pr in workable if pr.reviewDecision in ("CHANGES_REQUESTED", "REVIEW_REQUIRED")
  #                                         or pr.unresolvedThreads > 0
  #                                         or pr.unresolvedThreads < 0]  # unknown thread state; inspect manually
  #   clean        = [pr for pr in workable if pr.mergeable == "MERGEABLE"
  #                                         and pr.ciStatus == "pass"
  #                                         and pr.reviewDecision in ("APPROVED", null)
  #                                         and pr.unresolvedThreads == 0]
  # Note: draft count is in dashboard.draftsExcluded (top-level field, may be omitted when 0) — log it in the sweep summary

  IF workable is empty → EXIT (all settled or held by other agents)

  # Partition into Dependabot PRs (comment-only) and regular PRs (local git ops)
  # github_pr_dashboard rows use branch for the head ref name; use its prefix to identify Dependabot PRs.
  # If author.login is available (e.g., from github_pr_batch_status), you may also check == "dependabot[bot]".
  dependabot_prs = [pr for pr in workable if pr.branch.startswith("dependabot/")]
  regular_prs    = [pr for pr in workable if pr not in dependabot_prs]

  Pass 0: API-Fast Triage (NO git ops — ~2 min total)
    - 0a: Request Copilot reviews on regular (non-Dependabot) workable PRs that have none
      - Claim PR → github_request_review() → release claim
      - Bot-authored PRs need explicit request (uses user OAuth token via gh auth)
    - 0b: Handle Dependabot PRs (comment-only, no worktree needed)
      - For each pr in dependabot_prs:
          - Claim PR via github_manage_labels(prs: [<pr.number>], add: ["sweep-claimed"]) before acting
          - IF pr is conflicting or has failing/stale CI → gh pr comment <pr.number> --body "@dependabot rebase"
          - IF pr is clean (no conflicts, CI passing)   → github_manage_labels(prs: [<pr.number>], add: ["merge-when-ready"])
          - IF pr has unresolved review threads         → github_manage_labels(prs: [<pr.number>], add: ["requires-human-review"])
          - Release claim via github_manage_labels(prs: [<pr.number>], remove: ["sweep-claimed"]) after acting
      - After acting, add pr to settled (Dependabot handles rebase asynchronously)
    - 0c: Label already-clean PRs with merge-when-ready → add to settled
    - 0d: Re-run transient CI failures early (flaky tests, infra timeouts) so CI runs during later passes
    - 0e: Resolve process/meta review threads (no code change needed) — may settle additional PRs

  Pass 1: Rebase regular conflicting PRs (PARALLEL for disjoint files, SEQUENTIAL for overlapping)
    - Analyze file overlap via github_pr_files() to build dependency graph
    - Group disjoint PRs into parallel batches (max 3 concurrent)
    - Serialize PRs with overlapping file paths
    - Claim ONE PR immediately before rebasing — do NOT bulk-claim
    - Release claim after push (success) or after commenting blocker (failure)
    - Use lightweight validation (codegen → typecheck → format) for clean rebases; full make pc for conflicted
    - On irrecoverable failure → comment blocker, label requires-human-review only if outside agent reach → add to settled

  Pass 2: Fix regular PRs with unresolved reviews (PARALLEL — batches of 3 sub-agents)
    - Claim each PR in the batch before spawning its sub-agent
    - Sub-agent prompt must include: "release sweep-claimed on exit regardless of outcome"
    - Orchestrator releases any claims sub-agents failed to clean up
    - On unfixable review → comment blocker, label requires-human-review only if outside agent reach → add to settled

  Pass 3: Fix regular PRs with failing CI (PARALLEL — batches of 3 sub-agents)
    - Same claim/release pattern as Pass 2
    - On unfixable CI failure → comment blocker, label requires-human-review only if outside agent reach → add to settled
    - Use early CI failure detection: poll per-job status after push, begin triage on first failure (~5-8 min faster)

  Copilot Review Catch-Up: batch-check all PRs modified in Passes 1-3 for new Copilot threads
    - Queue PRs with new threads for next Pass 2 iteration
    - Request Copilot re-review on bot-authored PRs where all threads are resolved

  Each sub-agent runs make pc before pushing (NEVER skip — see callout below; lightweight validation is only permitted for zero-conflict rebases, not code changes)
  Collect results from all sub-agents; verify passing PRs have their branches/PRs updated

  Mark clean PRs (no conflicts, CI pass, no threads) → release claim → add to settled
  Mark PRs with only pending CI after final pass → release claim → add to settled

  IF all PRs in settled → EXIT
```

> **CRITICAL: Run `make pc` before pushing.** Every agent that modifies code must validate before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time. Minimum alternative: `make format && make lint-fix && make typecheck`. When dispatching sub-agents, always include "Run `make -C $wt pc` before committing" in the agent prompt.

**Key differences from a simple pass counter:**

- PRs that are settled or claimed by another agent are **skipped** — no wasted effort or duplicate work
- The loop exits when all PRs are settled, not after a fixed number of passes
- The max 10 pass cap is a safety net, not the expected exit condition
- If the cap is hit with unsettled PRs remaining, comment the blocker on each and report them in the summary — but do **not** auto-label them `requires-human-review` just because the cap was hit (the blocker may still be agent-fixable in a future sweep)

> 📎 **Claim/release protocol, stale detection, race mitigation, and sub-agent prompt templates**: see [multi-agent-sweep-coordination.md](../pr-lifecycle/references/multi-agent-sweep-coordination.md)
> 📎 **Parallelization details**: see [sweep-and-parallelization.md](../pr-lifecycle/references/sweep-and-parallelization.md)

---

## Final Summary

After completion, print a summary table. Every PR must show a settled status — no PR should be left in an ambiguous state.

**Mark the sweep task complete** once the summary is printed — even if one or more PRs are waiting on external blockers (infrastructure, credentials, etc.) that are outside the sweep's scope. Those PRs are settled by definition (either labeled `requires-human-review` or noted as infrastructure-dependent). The sweep task tracks _the sweep work itself_, not the downstream merge of every PR.

Use the same `taskId` captured in Step 0 — do not create a new task here.

```
TaskUpdate(taskId: <id>, status: "completed")
```

```
| PR    | Title                        | Conflicts | Reviews | CI      | Label                  | Settled | Reason                                  |
|-------|------------------------------|-----------|---------|---------|------------------------|---------|-----------------------------------------|
| #101  | feat(scoring): new algo      | Rebased   | Fixed 3 | —       | merge-when-ready       | ✅      | Clean                                   |
| #102  | fix(ui): button color        | —         | —       | Fixed   | merge-when-ready       | ✅      | Clean                                   |
| #103  | feat(db): add index          | Failed    | —       | —       | —                      | ⏳      | Rebase conflict — retryable next sweep  |
| #104  | chore(deps): bump lodash     | —         | Fixed 1 | Fixed   | merge-when-ready       | ✅      | Clean                                   |
| #105  | feat(ws): reconnect logic    | —         | —       | Pending | —                      | ✅      | CI running after final pass             |
| #106  | feat(auth): token refresh    | —         | —       | Failed  | requires-human-review  | ✅      | Needs prod DB credentials (not in env)  |
```

Report:

- Total PRs processed
- **Draft PRs skipped** (count — excluded at every scan; owned by their creating agent)
- PRs settled as **clean** (count)
- PRs settled as **requires-human-review** (count + PR numbers + reasons — must each cite a blocker outside agent reach)
- PRs **unsettled** (count + PR numbers + reasons — agent-fixable issues to retry in next sweep)
- PRs settled as **CI pending** (count — CI running after final pass)
- Issues fixed per category (conflicts rebased, reviews fixed, CI fixed)
- Number of passes required
- Whether the max-pass safety cap was hit

---

## Final Validation Pass

After all fix passes complete and before producing the final summary, run a single validation pass over every PR marked as "settled" this sweep. This is a lightweight re-scan — not a full pass — to catch cases where the sweep's own work invalidated an earlier settled state (e.g., a batch rebase took 30+ minutes during which new PRs merged to main).

For each PR marked as settled in this sweep, verify:

1. **If rebased this sweep**: confirm the branch is still based on the current base branch

   ```
   worktree_run(command: "git fetch origin && git merge-base origin/<baseRefName> origin/<branch>")
   ```

   Output must equal `git rev-parse origin/<baseRefName>`. If not → rebase again; update settled state.

2. **If bot-authored with `merge-when-ready` label**: confirm `reviewDecision` is not `null`

   ```
   github_view_pr(number: <PR#>)
   ```

   If `reviewDecision` is `null` and, based on the latest `github_pr_dashboard` / `github_pr_batch_status` data, Copilot's last review is `COMMENTED` with 0 unresolved threads → re-request Copilot review via `github_request_review(prs: [<PR#>])`.

3. **If CI appears not to have run** (e.g., `statusCheckRollup` is empty, has fewer than 3 entries, _or_ the dashboard-computed CI status / `summarizeCIStatus` reports `ciStatus === "none"`): flag as "CI may not have run", then:
   - Use `ci_list_runs` to discover the latest run (if any) for the PR's branch.
   - Dispatch the CI orchestrator via `ci_rerun(runId: <latest-run-id>, failedOnly: false)` as appropriate.

4. **If stale CI failure labels exist** (any `CI:`-prefixed failure labels present: `CI: Lint Failure`, `CI: Type Error`, `CI: Test Failure`, `CI: Build Failure`, `CI: E2E Failure`, `CI: Schema Drift`, `CI: Migration`, `CI: Security`, `CI: Quality Gates`) but the corresponding check(s) now pass: compute the subset that are both currently applied and stale, then strip only those via `github_manage_labels(prs: [<PR#>], remove: [<stale-labels-only>])`.

This pass runs **once at the end of the sweep**, not in the per-PR loop, to keep it lightweight. If any PR requires another rebase or re-review, update the final summary accordingly.
