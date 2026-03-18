---
name: pr-operations
description: 'Orchestrate PR maintenance across all open PRs: scan for conflicts/reviews/CI failures, rebase conflicting branches, fix review comments, debug CI failures, label clean PRs merge-when-ready, and report results. Supports full overnight sweep (loop until all clean) or individual operations (rebase only, reviews only, label only). Use when asked to clean up PRs, sweep open PRs, fix all PR issues, rebase all PRs, label clean PRs, or get PRs ready to merge.'
---

# Skill: PR Operations

## Overview

Orchestrate PR maintenance across all open PRs. This skill is a **coordinator** — it discovers problems, delegates to specialized sub-skills for the actual fixes, and manages the overall flow.

Supports two modes:

- **Full sweep** — loop through all open PRs fixing conflicts, reviews, and CI until everything is clean
- **Targeted operation** — run a single operation (e.g., "rebase all conflicting PRs", "label clean PRs")

## When to Use

- "Clean up all open PRs overnight"
- "Sweep open PRs and get them ready to merge"
- "Rebase all conflicting PRs"
- "Fix all review comments across PRs"
- "Label clean PRs as merge-when-ready"
- "Check PR status across the board"
- Periodic maintenance before a release cut

## Decision Table

| User Intent                                        | Operation                                        |
| -------------------------------------------------- | ------------------------------------------------ |
| "Sweep all PRs" / "overnight cleanup"              | Full sweep (all passes, outer loop)              |
| "Rebase all PRs" / "fix conflicts"                 | Pass 1 only                                      |
| "Fix review comments" / "address Copilot feedback" | Pass 2 only (delegates to `fix-copilot-reviews`) |
| "Fix CI failures"                                  | Pass 3 only (delegates to `debug-ci-failure`)    |
| "Label clean PRs" / "merge-when-ready"             | Label step only                                  |
| "Check PR status" / "scan PRs"                     | Scan + report only (no fixes)                    |

## Sub-Skills (Load on Demand)

This skill delegates to specialized sub-skills for each operation category. Load them when you encounter that problem type:

| Operation               | Sub-Skill                                 | When to Load                                          |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Rebase conflicting PRs  | `skills/rebase-conflicts/SKILL.md`        | PR has merge conflicts                                |
| Resolve merge conflicts | `skills/resolve-merge-conflicts/SKILL.md` | Rebase produces conflicts requiring manual resolution |
| Fix review comments     | `skills/fix-copilot-reviews/SKILL.md`     | PR has unresolved Copilot review threads              |
| Debug CI failures       | `skills/debug-ci-failure/SKILL.md`        | PR has failing CI checks                              |
| Enter a worktree        | `skills/worktree-workflow/SKILL.md`       | Need to create or access a PR's worktree              |
| Create a PR             | `skills/create-pr/SKILL.md`               | Need to open a new PR after fixes                     |

## Prerequisites

- Running from the main repo directory (`D:\code\legacy-sports`)
- `gh` CLI authenticated with repo access
- `twig` available on PATH
- AWS SSO session active (for any Lambda-related CI fixes)

## CRITICAL RULES

- **One worktree per PR** — never mix fixes for different PRs in the same worktree
- **All file edits happen in the worktree**, never in `D:\code\legacy-sports`
- **Always `make pc` before pushing** — do not push broken code
- **Always `--force-with-lease`** when pushing rebased branches
- **Resolve review threads after pushing** — leaving threads unresolved is incomplete work
- **Remove `@me` filter** — use `--limit 200` to catch all open PRs, not just yours

---

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

1. Download CI logs: `.\scripts\ci-failure-log.ps1 -PRNumber $pr.number`
2. Read `scratch/pr-$($pr.number)-ci.txt` to find the specific error
3. Enter the worktree (Step 2)
4. **Load `skills/debug-ci-failure/SKILL.md`** — it contains the full diagnostic playbook
5. Apply the fix based on error category:
   - **Formatting**: `pnpm exec nx format:write`
   - **Lint**: `pnpm exec nx affected -t lint --fix` + manual fixes
   - **Type errors**: fix the specific file/line
   - **Test failures**: investigate root cause, fix implementation
   - **Build failures**: fix missing imports/modules
6. Validate: `make pc`
7. Commit and push

### Pending CI

PRs in `$scan.ciPending` are NOT skipped — continue with other work and circle back. If pending CI is the only remaining work, wait ~3 minutes and re-scan.

---

## Label Clean PRs for Merge

After all fixes (or as a standalone operation), add `merge-when-ready` to every clean PR:

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

## Troubleshooting

| Problem                                      | Fix                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Rebase aborts repeatedly on same commit      | `git rebase --skip` if commit already applied; load `skills/rebase-conflicts/SKILL.md` |
| Copilot keeps re-reviewing with same comment | After 2 cycles on the same thread, resolve it and move on                              |
| CI failure is flaky (passes on re-run)       | Re-trigger: `gh run rerun $runId --failed` — do not change code                        |
| Too many PRs to process in one session       | Prioritize: conflicts → CI → reviews                                                   |
| `make pc` fails after rebase stabilization   | Load `skills/rebase-conflicts/SKILL.md` for post-rebase steps                          |
