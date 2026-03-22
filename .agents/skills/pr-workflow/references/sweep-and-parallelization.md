# Full Sweep & Parallelization Strategy

## Full Sweep: Outer Loop

For a full sweep, run passes in a loop until every PR is **settled** (clean, labeled `requires-human-review`, or with CI pending after the final pass):

```
settled = {}  # PR numbers that have reached a terminal state

REPEAT (max 10 passes):
  Scan all open PRs
  unsettled = [pr for pr in all_prs if pr.number not in settled]

  IF unsettled is empty → EXIT (all settled)

  Pass 1: Rebase unsettled conflicting PRs
    - On irrecoverable failure → label requires-human-review → add to settled
  Pass 2: Fix unsettled PRs with unresolved reviews
    - On unfixable review → label requires-human-review → add to settled
  Pass 3: Fix unsettled PRs with failing CI
    - On unfixable CI failure → label requires-human-review → add to settled
  Validate changed PRs: make pc in each worktree
  Push passing PRs

  For each unsettled PR:
    IF clean (no conflicts, CI pass, no threads) → add to settled
    IF CI pending after final pass → add to settled (CI pending)

  IF all PRs in settled → EXIT

IF unsettled PRs remain after max passes:
  Label all remaining unsettled PRs requires-human-review
  Comment: "Agent reached max pass limit without resolving this PR"
```

**Why loop?** Fixing one category often creates issues in another:

- Rebasing can introduce CI failures (changed deps, formatting drift)
- CI fixes push code that triggers new Copilot review comments
- Review fixes may need a re-rebase if main moved ahead
- Freshly pushed code has pending CI that hasn't reported yet

**Key difference from the old pass-counter approach:** settled PRs are skipped in subsequent passes, so work is never repeated. The loop exits when all PRs are settled, not after a fixed count. The max 10 pass cap is a safety net — expect 2–4 passes in practice.

## Parallelization Strategy

Each PR lives in its own junctioned worktree. The shared `node_modules` is **read-only** during `make pc`, so parallel validation is safe.

| Phase                  | Parallelizable?       | Reason                                                               |
| ---------------------- | --------------------- | -------------------------------------------------------------------- |
| Rebase (Pass 1)        | **No — sequential**   | Merging PR A shifts `main`, invalidating PR B's rebase               |
| `make pc` validation   | **Yes — `Start-Job`** | Each worktree reads shared `node_modules`, writes only local outputs |
| CI wait/polling        | **Yes — batch poll**  | Just polling `gh pr checks` — no contention                          |
| Review fixes (Pass 2)  | **No — sequential**   | Each fix requires reading context, reasoning, editing                |
| CI code fixes (Pass 3) | **No — sequential**   | Sub-agents lack tool permissions; process each PR sequentially       |

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

### Why NOT Sub-Agents for Rebases

- **Cascade invalidation**: Merging PR A changes `main`, invalidating PR B's rebase
- **Context accumulation**: A single agent learns patterns across PRs (e.g., "AGENTS.md is always `--theirs`")
- **Rate limits**: Parallel sub-agents multiply costs and hit API throttling
