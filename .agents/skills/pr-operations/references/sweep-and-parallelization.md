# Full Sweep & Parallelization Strategy

## Full Sweep: Outer Loop

For a full sweep, run passes in a loop until everything is clean:

```
REPEAT (max 5 passes):
  problems_found = 0
  pending_ci = 0
  Pass 1: Rebase all conflicting PRs         → problems_found += count
  Pass 2: Fix all unresolved review comments  → problems_found += count
  Pass 3: Fix all failing CI runs             → problems_found += count
           Track PRs with pending CI           → pending_ci += count
  IF problems_found == 0 AND pending_ci == 0 → EXIT (all clean)
  IF problems_found == 0 AND pending_ci > 0  → WAIT 3 minutes, re-scan
```

**Why loop?** Fixing one category often creates issues in another:

- Rebasing can introduce CI failures (changed deps, formatting drift)
- CI fixes push code that triggers new Copilot review comments
- Review fixes may need a re-rebase if main moved ahead
- Freshly pushed code has pending CI that hasn't reported yet

Expect 2–3 passes. Cap at **5 passes** — if issues persist, report remaining problems and stop.

## Parallelization Strategy

Each PR lives in its own junctioned worktree. The shared `node_modules` is **read-only** during `make pc`, so parallel validation is safe.

| Phase                  | Parallelizable?            | Reason                                                               |
| ---------------------- | -------------------------- | -------------------------------------------------------------------- |
| Rebase (Pass 1)        | **No — sequential**        | Merging PR A shifts `main`, invalidating PR B's rebase               |
| `make pc` validation   | **Yes — `Start-Job`**      | Each worktree reads shared `node_modules`, writes only local outputs |
| CI wait/polling        | **Yes — batch poll**       | Just polling `gh pr checks` — no contention                          |
| Review fixes (Pass 2)  | **No — sequential**        | Each fix requires reading context, reasoning, editing                |
| CI code fixes (Pass 3) | **Partially — sub-agents** | Independent per-PR; spawn sub-agents when ≥2 PRs need fixes          |

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
