# Full Sweep & Parallelization Strategy

## Full Sweep: Outer Loop

For a full sweep, run passes in a loop until every PR is **settled** (clean, labeled `requires-human-review` for blockers outside agent reach, or with CI pending after the final pass):

```
settled = {}  # PR numbers that have reached a terminal state

REPEAT (max 10 passes):
  Scan all open PRs
  unsettled = [pr for pr in all_prs if pr.number not in settled]

  IF unsettled is empty → EXIT (all settled)

  Pass 0: API-Fast Triage (NO git ops — ~2 min)
    - Request Copilot reviews on bot-authored PRs
    - Handle Dependabot PRs via comment commands
    - Label already-clean PRs → add to settled
    - Re-run transient CI failures early
    - Resolve process/meta review threads

  Pass 1: Rebase unsettled conflicting PRs
    - Analyze file overlap; parallel for disjoint files, sequential for overlapping
    - Lightweight validation for clean rebases; full make pc for conflicted
    - On irrecoverable failure → comment blocker on PR, label requires-human-review only if outside agent reach → add to settled

  Pass 2: Fix unsettled PRs with unresolved reviews
    - On unfixable review → comment blocker on PR, label requires-human-review only if outside agent reach → add to settled

  Pass 3: Fix unsettled PRs with failing CI
    - Early CI failure detection: poll per-job status, begin triage on first failure
    - On unfixable CI failure → comment blocker on PR, label requires-human-review only if outside agent reach → add to settled

  Copilot Review Catch-Up: batch-check all modified PRs for new threads
    - Queue PRs with new threads for next Pass 2 iteration
    - Request Copilot re-review on bot-authored PRs with all threads resolved

  Validate changed PRs: make pc (or lightweight) in each worktree
  Push passing PRs

  For each unsettled PR:
    IF clean (no conflicts, CI pass, no threads) → add to settled
    IF CI pending after final pass → add to settled (CI pending)

  IF all PRs in settled → EXIT

IF unsettled PRs remain after max passes:
  Comment on each: "Agent reached max pass limit without resolving this PR"
  Add each to settled (as "Unresolved")
  Report all remaining PRs in the final summary

POST-SWEEP (after outer loop exits):
  Prune stale local worktrees (see "Worktree Pruning" section below)
```

**Why loop?** Fixing one category often creates issues in another:

- Rebasing can introduce CI failures (changed deps, formatting drift)
- CI fixes push code that triggers new Copilot review comments
- Review fixes may need a re-rebase if main moved ahead
- Freshly pushed code has pending CI that hasn't reported yet

**Key difference from the old pass-counter approach:** settled PRs are skipped in subsequent passes, so work is never repeated. The loop exits when all PRs are settled, not after a fixed count. The max 10 pass cap is a safety net — expect 2–4 passes in practice.

> **Bulk status check**: use `github_pr_batch_status({ numbers: [N1, N2, ...] })` to check CI status, labels, and mergeability (`mergeable`) in batches instead of sequential `gh pr view` calls. `numbers` is limited to **50 PRs per call**, so for larger sweeps split the PR list into chunks of 50 and make multiple batch calls. This is the MCP-first path for any multi-PR status query — do **not** loop `gh pr view <number>` or `github_view_pr` per PR when you need a batch snapshot.

## Parallelization Strategy

Each PR lives in its own junctioned worktree. The shared `node_modules` is **read-only** during `make pc`, so parallel validation is safe.

| Phase                            | Parallelizable?           | Reason                                                                       |
| -------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| API-Fast Triage (Pass 0)         | **Yes — all API calls**   | No git ops; label, re-run CI, resolve threads, request reviews in parallel   |
| Rebase — disjoint files (Pass 1) | **Yes — batches of 3**    | PRs touching non-overlapping files cannot create cross-PR conflicts          |
| Rebase — overlapping files       | **No — sequential**       | Shared file paths mean PR A's rebase can invalidate PR B's                   |
| Lightweight validation           | **Yes — `Start-Job`**     | codegen → typecheck → format; faster than full `make pc`                     |
| Full `make pc` validation        | **Yes — `Start-Job`**     | Each worktree reads shared `node_modules`, writes only local outputs         |
| CI wait/polling                  | **Yes — batch poll**      | Just polling `ci_view_run` / `github_pr_batch_status` — no contention        |
| Review fixes (Pass 2)            | **Yes — sub-agents**      | Each PR is in its own worktree; agents work independently (max 3 concurrent) |
| CI code fixes (Pass 3)           | **Yes — sub-agents**      | Each PR is in its own worktree; agents work independently (max 3 concurrent) |
| Copilot Review Catch-Up          | **Yes — batch API calls** | Check all modified PRs for new threads in one pass                           |

### Parallel Sub-Agents for Review Fixes and CI Fixes

Review fixes (Pass 2) and CI code fixes (Pass 3) operate on independent PRs in separate worktrees with no shared mutable state, making them safe to parallelize via sub-agents.

**How it works:**

1. After the scan identifies PRs needing review fixes or CI fixes, group them into a batch (max 3 concurrent)
2. Spawn one `Agent` per PR, each working in its own worktree. Use the appropriate prompt template:

   > **Orchestrator rule**: write the commit/push instruction as an **outcome** ("commit and push the fix") — never include explicit `git -C <path> commit` or `git -C <path> push` instructions in the prompt. Explicit git commands override the tool preference hints and can prevent the agent from using `worktree_commit`/`worktree_push`, which add the concrete safety checks we want here (for example: refusing unsafe pushes such as `main`, using `--force-with-lease`, retrying cleanly when hooks auto-amend and abort the first push, and confirming the remote when needed).

   **Review fix sub-agent (Pass 2):**

   > Fix review comments on PR #\<number\> in worktree \<path\>.
   > Read unresolved threads, apply fixes, run make pc, commit and push the fix.
   > Resolve all fixed threads in one call via github_resolve_threads(threadIds: [...]).
   > If unfixable, comment on the PR with the diagnosed blocker and move on.
   >
   > **Implementation context from Jira** (ticket \<LS-####\>):
   > \<paste the "## Implementation Notes" comment from `jira_get_comments(key: "LS-####")` verbatim (look for a comment with that header), or "No implementation notes found." if absent\>
   > Use this context to understand the original approach and design decisions before interpreting review feedback. If a reviewer's suggestion conflicts with a noted constraint, acknowledge it in the PR comment rather than blindly applying the change.
   >
   > Tool preferences:
   >
   > - Use Glob (not find/ls) for file discovery — do NOT use `find` or `ls`; if Glob returns empty on an absolute Windows worktree path, fall back to `worktree_ls_tree` first, or `worktree_run({ command: "ls <dir>" })` for that narrow case
   > - Use Grep (not grep/rg) for content search
   > - Use Read (not cat/head/tail) for reading files
   > - Use worktree_run for git commands (not git -C via Bash)
   > - Use worktree_commit/worktree_push for commits and pushes (not git -C commit / git -C push)

   **CI fix sub-agent (Pass 3):**

   > Fix the CI failure on PR #\<number\> in worktree \<path\>.
   > Diagnose using ci_get_logs, apply the fix, run make pc, commit and push the fix.
   > After a successful push, call github_clear_ci_failure_labels(number: \<number\>) to remove stale ci-failure-\* labels.
   > The CI system will re-add labels if CI fails again after the push.
   > If unfixable, comment on the PR with the diagnosed root cause and what was attempted — do not remove labels.
   >
   > Tool preferences:
   >
   > - Use Glob (not find/ls) for file discovery — do NOT use `find` or `ls`; if Glob returns empty on an absolute Windows worktree path, fall back to `worktree_ls_tree` first, or `worktree_run({ command: "ls <dir>" })` for that narrow case
   > - Use Grep (not grep/rg) for content search
   > - Use Read (not cat/head/tail) for reading files
   > - Use worktree_run for git commands (not git -C via Bash)
   > - Use worktree_commit/worktree_push for commits and pushes (not git -C commit / git -C push)

3. Wait for all agents in the batch to complete before spawning the next batch
4. Collect results from each agent — verify PR state (fixed, blocker commented, or failed)

**Concurrency limit**: max 3 concurrent sub-agents. Each agent runs `make pc` in its own worktree, and junctioned `node_modules` is read-only during validation. More than 3 saturates disk I/O and risks API rate limits.

**Failure handling**: if a sub-agent fails (crashes, times out), the orchestrator comments the failure on the PR and continues with remaining PRs. Do not label `requires-human-review` for transient agent failures — the issue may succeed on retry. Failed agents do not block the batch.

**When to fall back to sequential**:

- Fewer than 3 PRs in the pass (parallelism overhead outweighs benefit)
- PRs touch overlapping files where a fix on one PR may inform the fix on another
- Agent platform does not support concurrent sub-agents

### Lightweight Validation for Clean Rebases

When a rebase had zero conflicts and the PR's last CI run passed on the old base, the code hasn't changed — only the base moved. Use a lightweight validation instead of the full 9-step `make pc`:

```
Decision tree:
  IF rebase had zero conflicts
    AND last CI run passed on old base
    AND rebase did NOT touch pnpm-lock.yaml or schema files
  THEN:
    Lightweight: codegen → typecheck → format (~3-5 min)
  ELSE:
    Full: make pc (all 9 steps) (~10-20 min)
```

**Rationale**: lint rules, test assertions, and build outputs are deterministic for unchanged code. Only codegen (may depend on new base schema), typecheck (may see new types from base), and format (style drift) can produce different results after a clean rebase.

### Parallel Validation Pattern (with Nx Cache Warming)

After rebasing N PRs, validate them in parallel. **Run the first worktree's validation sequentially** to warm the Nx computation cache, then parallelize the rest at higher concurrency:

```powershell
$rebasedPRs = @(
  @{ Number=1234; Path="D:\code\legacy-sports-worktrees\LS-1234-branch-name"; Lightweight=$true }
  # ... etc
)

# Step 1: Warm Nx cache with the first PR (sequential)
# NOTE: Requires PowerShell 7+ (pwsh). PowerShell 5.1 does not support && operator.
# Run sequential make calls instead of chained commands on PS 5.1.
$first = $rebasedPRs[0]
Write-Host "Warming Nx cache with PR #$($first.Number)..."
Set-Location $first.Path
if ($first.Lightweight) {
  make codegen; if ($LASTEXITCODE -ne 0) { throw "codegen failed" }
  make typecheck; if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
  make format; if ($LASTEXITCODE -ne 0) { throw "format failed" }
} else {
  make pc; if ($LASTEXITCODE -ne 0) { throw "make pc failed" }
}

# Step 2: Parallelize remaining PRs with warm cache (bump to 4 concurrent)
$remaining = if ($rebasedPRs.Count -gt 1) { $rebasedPRs | Select-Object -Skip 1 } else { @() }
$maxParallel = 4  # safe with warm Nx cache (was 3 without)
$jobs = @()
foreach ($pr in $remaining) {
  while (($jobs | Where-Object { $_.State -eq 'Running' }).Count -ge $maxParallel) {
    Start-Sleep -Seconds 5
  }
  $isLightweight = $pr.Lightweight
  $jobs += Start-Job -Name "pc-$($pr.Number)" -ScriptBlock {
    param($wtPath, $lightweight)
    Set-Location $wtPath
    if ($lightweight) {
      make codegen; if ($LASTEXITCODE -ne 0) { throw "codegen failed" }
      make typecheck; if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
      make format; if ($LASTEXITCODE -ne 0) { throw "format failed" }
    } else {
      make pc; if ($LASTEXITCODE -ne 0) { throw "make pc failed" }
    }
  } -ArgumentList $pr.Path, $isLightweight
}

$jobs | Wait-Job

foreach ($job in $jobs) {
  $prNum = $job.Name -replace 'pc-',''
  $output = Receive-Job $job
  if ($job.State -eq 'Completed' -and $job.ChildJobs[0].JobStateInfo.State -eq 'Completed') {
    Write-Host "PR #$prNum: validation PASSED"
  } else {
    Write-Host "PR #$prNum: validation FAILED"
    $output | Out-File "scratch/pr-$prNum-pc-failure.txt"
  }
  Remove-Job $job
}
```

**Why cache warming helps**: Nx stores task computation results in `.nx-cache` at the workspace root (configured via `NX_CACHE_DIRECTORY=.nx-cache` in `.github/actions/nx-cache/action.yml` — NOT per-user or global). The first `make pc` populates this cache for shared dependencies. Subsequent worktrees benefit only if they share the same cache directory.

Cache sharing for **task results** (what actually speeds up `make pc`) requires `NX_CACHE_DIRECTORY` to point to a shared path accessible by all worktrees. Each worktree has its own root directory, so their `.nx-cache` directories are isolated by default.

The **shared `node_modules` junction** (created by `make worktree`) co-locates `node_modules/.cache/nx` (the Nx internal module cache) under the shared `node_modules` path — but this is distinct from `.nx-cache` and does **not** satisfy the task result cache requirement.

Without a shared `NX_CACHE_DIRECTORY`, each worktree builds its own isolated `.nx-cache` and warming does not carry over.

**Concurrency limit**: `$maxParallel = 4` (up from 3) is safe **only when caches are shared** (junction or `NX_CACHE_DIRECTORY`) — warming reduces per-job I/O significantly in that case. If worktrees have isolated caches (no junction, no shared `NX_CACHE_DIRECTORY`), keep `$maxParallel = 3` to avoid I/O contention. On machines with ≤4 cores, keep at 3 regardless.

### Early CI Failure Detection (Required)

After pushing a rebased/fixed branch, **always** poll per-job status instead of waiting for the full CI run. This is required behavior, not optional. Individual jobs complete independently — Build Validation can fail at minute 4 while Quality Gates doesn't finish until minute 10.

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

**Interleave with other work**: While waiting for PR A's CI (polling every 60s), start working on PR B. The orchestrator should maintain a list of in-flight CI runs and check them between other operations.

**Tools available**: `ci_view_run` already returns per-job status and completion timestamps. No new MCP tools needed.

### Rebase Parallelization: Disjoint-File Exception

The original rule was "never parallelize rebases" due to cascade invalidation. This is **partially relaxed** for PRs with disjoint file paths:

**When rebases MUST be sequential** (overlapping files):

- PRs touch the same files — rebasing PR A changes the base for those files, invalidating PR B's rebase
- PRs touch shared config files (`package.json`, `pnpm-lock.yaml`, `schema.graphql`, `tsconfig.base.json`)
- File overlap analysis fails or is unavailable

**When rebases CAN be parallel** (disjoint files):

- PRs touch completely different file sets — PR A's rebase cannot create conflicts in PR B's files
- Analyze via `github_pr_files(number: <PR#>)` before starting the rebase pass
- Max 3 concurrent rebase sub-agents (same limit as review/CI fix sub-agents)

**Additional reasons to prefer sequential** (even with disjoint files):

- **Context accumulation**: A single agent learns conflict resolution patterns across PRs (e.g., "AGENTS.md is always `--theirs`")
- **Rate limits**: Parallel sub-agents multiply API calls and can hit throttling
- Fewer than 3 conflicting PRs (overhead of parallelism outweighs benefit)

---

## Multi-Agent Coordination (Multiple Top-Level Agents)

The parallelization strategy above applies to sub-agents spawned by a **single** top-level orchestrator. The outer loop also handles **multiple independent top-level agents** running simultaneously via the same mechanism: `sweep-claimed` GitHub labels. Every sweep run — solo or multi-agent — claims PRs before working on them and releases when done. When running solo the claims simply never contend.

Each agent's inner parallelism (batches of 3 sub-agents for Passes 2 & 3) composes naturally with cross-agent coordination: the top-level agent claims a PR, spawns a sub-agent for it, and the sub-agent releases the claim on exit. Other top-level agents see the PR as claimed and skip it for the duration.

> **Full claim/release protocol, label setup (gh CLI), stale detection, and sub-agent prompt templates**: see [multi-agent-sweep-coordination.md](multi-agent-sweep-coordination.md)

---

## Worktree Pruning (Post-Sweep)

After the outer sweep loop exits, clean up local worktrees whose PR has been merged. This prevents worktree accumulation across sessions.

### When to Prune

Run once per sweep session, **after** the outer loop exits — never during the loop (a "merged" worktree may still be needed for conflict resolution or CI context).

### Algorithm

```
1. List all local worktrees:
   worktree_list()

2. For each worktree:
   a. Extract the Jira ticket key from the branch name (regex: LS-\d+)
   b. If no key found → skip (not a ticket branch)
   c. Look up the PR for that branch:
      github_list_prs(branch: <branchName>, state: "merged")
   d. If a PR is returned (i.e. it is merged) → prune:
      worktree_clean(worktree: <path>)
   e. If no PR found, or PR is open/draft/closed-unmerged → skip

3. Report pruned worktrees in sweep summary
```

### Rules

- **Always use `worktree_clean`** — never `git worktree remove` or manual deletion. `worktree_clean` uses `twig worktree remove` which safely handles junctions.
- **Skip worktrees with no associated PR** — may be in-flight work that hasn't been pushed yet.
- **Skip open, draft, and closed-unmerged PRs** — only `MERGED` state triggers pruning.
- **Skip the main repo worktree** — `worktree_list()` already excludes the main checkout from its output, so no explicit filtering is needed.

### MCP Tools

| Step              | Tool                                               |
| ----------------- | -------------------------------------------------- |
| List worktrees    | `worktree_list()`                                  |
| Find PR by branch | `github_list_prs(branch: <name>, state: "merged")` |
| Prune worktree    | `worktree_clean(worktree: <path>)`                 |

### Example Summary Output

```
Worktree pruning (post-sweep):
  Pruned 3 merged worktrees:
    LS-2191/fix-scoring        → PR #2198 (merged)
    LS-2205/add-oauth-proxy    → PR #2210 (merged)
    LS-2218/db-migration-fix   → PR #2220 (merged)
  Skipped 2 worktrees (no merged PR):
    LS-2230/wip-feature        → PR #2231 (open)
    LS-2235/draft-work         → no PR found
```
