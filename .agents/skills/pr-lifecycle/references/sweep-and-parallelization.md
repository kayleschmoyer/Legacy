# Full Sweep & Parallelization Strategy

## Full Sweep: Outer Loop

For a full sweep, run passes in a loop until every PR is **settled** (clean, labeled `requires-human-review` for blockers outside agent reach, or with CI pending after the final pass):

```
settled = {}  # PR numbers that have reached a terminal state

REPEAT (max 10 passes):
  Scan all open PRs
  unsettled = [pr for pr in all_prs if pr.number not in settled]

  IF unsettled is empty → EXIT (all settled)

  Pass 1: Rebase unsettled conflicting PRs
    - On irrecoverable failure → comment blocker on PR, label requires-human-review only if outside agent reach → add to settled
  Pass 2: Fix unsettled PRs with unresolved reviews
    - On unfixable review → comment blocker on PR, label requires-human-review only if outside agent reach → add to settled
  Pass 3: Fix unsettled PRs with failing CI
    - On unfixable CI failure → comment blocker on PR, label requires-human-review only if outside agent reach → add to settled
  Validate changed PRs: make pc in each worktree
  Push passing PRs

  For each unsettled PR:
    IF clean (no conflicts, CI pass, no threads) → add to settled
    IF CI pending after final pass → add to settled (CI pending)

  IF all PRs in settled → EXIT

IF unsettled PRs remain after max passes:
  Comment on each: "Agent reached max pass limit without resolving this PR"
  Add each to settled (as "Unresolved")
  Report all remaining PRs in the final summary
```

**Why loop?** Fixing one category often creates issues in another:

- Rebasing can introduce CI failures (changed deps, formatting drift)
- CI fixes push code that triggers new Copilot review comments
- Review fixes may need a re-rebase if main moved ahead
- Freshly pushed code has pending CI that hasn't reported yet

**Key difference from the old pass-counter approach:** settled PRs are skipped in subsequent passes, so work is never repeated. The loop exits when all PRs are settled, not after a fixed count. The max 10 pass cap is a safety net — expect 2–4 passes in practice.

## Parallelization Strategy

Each PR lives in its own junctioned worktree. The shared `node_modules` is **read-only** during `make pc`, so parallel validation is safe.

| Phase                  | Parallelizable?       | Reason                                                                       |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------- |
| Rebase (Pass 1)        | **No — sequential**   | Merging PR A shifts `main`, invalidating PR B's rebase                       |
| `make pc` validation   | **Yes — `Start-Job`** | Each worktree reads shared `node_modules`, writes only local outputs         |
| CI wait/polling        | **Yes — batch poll**  | Just polling `ci_view_run` / `github_pr_batch_status` — no contention        |
| Review fixes (Pass 2)  | **Yes — sub-agents**  | Each PR is in its own worktree; agents work independently (max 3 concurrent) |
| CI code fixes (Pass 3) | **Yes — sub-agents**  | Each PR is in its own worktree; agents work independently (max 3 concurrent) |

### Parallel Sub-Agents for Review Fixes and CI Fixes

Review fixes (Pass 2) and CI code fixes (Pass 3) operate on independent PRs in separate worktrees with no shared mutable state, making them safe to parallelize via sub-agents.

**How it works:**

1. After the scan identifies PRs needing review fixes or CI fixes, group them into a batch (max 3 concurrent)
2. Spawn one `Agent` per PR, each working in its own worktree. Example prompt:

   > Fix review comments on PR #\<number\> in worktree \<path\>.
   > Read unresolved threads, apply fixes, run make pc, commit, push.
   > Resolve all fixed threads in one call via github_resolve_threads(threadIds: [...]).
   > If unfixable, comment on the PR with the diagnosed blocker and move on.
   >
   > Tool preferences:
   >
   > - Use Glob (not find/ls) for file discovery
   > - Use Grep (not grep/rg) for content search
   > - Use Read (not cat/head/tail) for reading files
   > - Use worktree_run for git commands (not git -C via Bash)
   > - Use worktree_commit/worktree_push for commits and pushes

3. Wait for all agents in the batch to complete before spawning the next batch
4. Collect results from each agent — verify PR state (fixed, blocker commented, or failed)

**Concurrency limit**: max 3 concurrent sub-agents. Each agent runs `make pc` in its own worktree, and junctioned `node_modules` is read-only during validation. More than 3 saturates disk I/O and risks API rate limits.

**Failure handling**: if a sub-agent fails (crashes, times out), the orchestrator comments the failure on the PR and continues with remaining PRs. Do not label `requires-human-review` for transient agent failures — the issue may succeed on retry. Failed agents do not block the batch.

**When to fall back to sequential**:

- Fewer than 3 PRs in the pass (parallelism overhead outweighs benefit)
- PRs touch overlapping files where a fix on one PR may inform the fix on another
- Agent platform does not support concurrent sub-agents

### Parallel `make pc` Pattern

After rebasing N PRs sequentially, validate them all in parallel:

```powershell
$rebasedPRs = @(
  @{ Number=1234; Path="D:\code\legacy-sports-worktrees\LS-1234-branch-name" }
  # ... etc
)

$maxParallel = 3
$jobs = @()
foreach ($pr in $rebasedPRs) {
  while (($jobs | Where-Object { $_.State -eq 'Running' }).Count -ge $maxParallel) {
    Start-Sleep -Seconds 5
  }
  $jobs += Start-Job -Name "pc-$($pr.Number)" -ScriptBlock {
    param($wtPath)
    Set-Location $wtPath
    make pc 2>&1
  } -ArgumentList $pr.Path
}

$jobs | Wait-Job

foreach ($job in $jobs) {
  $prNum = $job.Name -replace 'pc-',''
  $output = Receive-Job $job
  if ($job.State -eq 'Completed' -and $job.ChildJobs[0].JobStateInfo.State -eq 'Completed') {
    Write-Host "PR #$prNum: make pc PASSED"
  } else {
    Write-Host "PR #$prNum: make pc FAILED"
    $output | Out-File "scratch/pr-$prNum-pc-failure.txt"
  }
  Remove-Job $job
}
```

**Concurrency limit**: `$maxParallel = 3` avoids disk I/O saturation.

### Early CI Failure Detection

After pushing a rebased/fixed branch, don't wait for the entire CI run to complete. Individual jobs within a run complete independently — Build Validation can fail at minute 4 while Quality Gates doesn't finish until minute 10. Poll per-job status to detect failures early:

```
After pushing branch:
  1. Get in-progress run: ci_list_runs(branch: branchName, commit: headSha, status: "in_progress", limit: 1)
  2. Poll with ci_view_run(runId, includeJobs: true) every ~60s
  3. As soon as ANY job shows conclusion: "failure":
     → Identify the failing job's jobId from ci_view_run(..., includeJobs: true)
     → Fetch logs: ci_get_logs(runId, jobId, errorSummary: true)
     → Begin fixing immediately — don't wait for full run
  4. If all critical jobs pass (Quality Gates + Build Validation):
     → Mark PR as "CI pending E2E" and move to next PR
```

**Impact**: Detect failures ~5-8 min earlier per PR. Particularly valuable when multiple PRs have the same root cause — fix one, apply to all.

**Tools available**: `ci_view_run` already returns per-job status and completion timestamps. No new MCP tools needed.

### Why NOT Sub-Agents for Rebases

- **Cascade invalidation**: Merging PR A changes `main`, invalidating PR B's rebase
- **Context accumulation**: A single agent learns patterns across PRs (e.g., "AGENTS.md is always `--theirs`")
- **Rate limits**: Parallel sub-agents multiply costs and hit API throttling
