---
name: debug-ci-failure
description: 'Debug failed CI runs end-to-end: identify the failed stage, fetch logs, locate the root cause, reproduce locally, fix, and re-verify. Use when a GitHub Actions run fails on a PR or branch.'
---

# Skill: Debug a Failed GitHub Actions Run

## Overview

Step-by-step playbook for triaging and fixing a failed CI run in the Legacy Sports monorepo. The CI pipeline has six stages that run in order — a failure in any stage blocks later ones. This skill walks through identifying which stage failed, pulling the right logs, finding the root cause, and driving to a fix.

## When to Use

- A GitHub Actions CI run failed on your PR or branch
- `github_pr_batch_status` shows a failing status
- You need to understand **why** CI failed and how to fix it
- A merge-queue run was rejected

## CRITICAL: Evidence-First Debugging

**NEVER guess at the problem.** Extract the actual error text from CI logs before attempting any fix.

| ❌ Insufficient (don't proceed) | ✅ Sufficient (ready to fix)                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| "The lint step failed"          | `apps/web/src/App.tsx:17:3 error @typescript-eslint/no-floating-promises`    |
| "There are TypeScript errors"   | `lib/scoring/src/utils.ts(42,5): error TS2345: Argument of type 'string'...` |
| "Unit tests failed"             | `FAIL lib/utils/src/helpers.spec.ts — Expected: 42, Received: undefined`     |
| "The build failed"              | `(node:3665) Warning: Failed to load the ES module: jest.config.web.ts`      |

If a search pattern returns no results, widen your search or save the full logs. **Do not skip the evidence step.**

## CI Pipeline Stages (in order)

| Stage | Job              | What It Does                               |
| ----- | ---------------- | ------------------------------------------ |
| 1     | detect-changes   | Determines affected projects (~30 s)       |
| 2     | quality-gates    | Formatting → Lint → Typecheck → Unit tests |
| 2b    | build-validation | Web, mobile, and Lambda builds             |
| 3     | e2e              | End-to-end Playwright tests                |
| 4     | summarize        | Posts PR comment and badges (always runs)  |

Failures most commonly occur in **quality-gates** or **build-validation**.

## `ci_get_logs` Parameter Reference

| Parameter    | Type    | Description                                                  |
| ------------ | ------- | ------------------------------------------------------------ |
| `runId`      | number  | Run-level logs — fetches all jobs in the run                 |
| `jobId`      | number  | Single-job logs — use when you know exactly which job failed |
| `failedOnly` | boolean | `true` = only failed steps (fastest); `false` = all steps    |

Use `runId` first. Switch to `jobId` when you need to isolate output from a single job (e.g. `quality-gates`). Never pass both.

## Steps

> **Quick start (PR number known):** Steps 1 + 3 can be combined into a single script
> call that finds the failed run, downloads the logs, prints a summary, and saves
> everything to `scratch/pr-<N>-ci.txt` for further reading:
>
> ```powershell
> .\scripts\ci-failure-log.ps1 -PRNumber 1234
> # Then read the log file it reports:
> # scratch/pr-1234-ci.txt
> ```
>
> If you don't have a PR number (running from a branch directly), use the manual
> steps below.

### 1. Find the failed run

**MCP (preferred):**

```
# List recent runs on the current branch
ci_list_runs(branch: "BRANCH_NAME", limit: 5)

# Or check PR status (when you have a PR number)
github_pr_batch_status(prNumbers: [PR_NUMBER])
```

**Shell fallback:**

```powershell
# List recent runs on the current branch
gh run list --branch (git branch --show-current) --limit 5

# Or check PR checks directly
gh pr checks
```

Note the `RUN_ID` of the failed run for subsequent commands.

### 2. Read the PR comment summary first

The **summarize** job posts a PR comment with a status table. Check it before diving into raw logs — it often tells you exactly which sub-check failed.

```powershell
# Open the run in the browser to see the summary
gh run view RUN_ID --web
```

Look for the **Quality Gates Results** table:

```
| Check           | Result    |
|-----------------|-----------|
| Code Formatting | ✅ Passed |
| ESLint          | ❌ Failed |  ← start here
| TypeScript      | ✅ Passed |
| Unit Tests      | ✅ Passed |
```

### 3. Fetch failed logs and extract the actual error

Use the helper script when you have a PR number (preferred — auto-saves to scratch/):

```powershell
.\scripts\ci-failure-log.ps1 -PRNumber 1234
# Prints a summary of failing steps and saves full log to scratch/pr-1234-ci.txt
```

**MCP (preferred) — fetch by run ID:**

```
# Show only logs from failed steps (fastest)
ci_get_logs(runId: RUN_ID, failedOnly: true)

# If failedOnly returns empty or too short, fetch all logs
ci_get_logs(runId: RUN_ID, failedOnly: false)
```

**Shell fallback:**

```powershell
# Show only logs from failed steps (fastest)
gh run view RUN_ID --log-failed

# Save to a file for easier searching
gh run view RUN_ID --log-failed > scratch/pr-<N>-ci.txt

# If --log-failed is empty or too short, fetch all logs
gh run view RUN_ID --log > ci-full.txt
```

**Your goal in this step is to find the exact error line(s).** Do not proceed until you can cite the specific error message, file path, line number, or error code from the logs.

### 4. Identify the root cause

**Most CI failures come from one of six categories.** Search in this order — earlier items are root causes that cascade into later symptoms.

> **IMPORTANT:** Each sub-step below has a search command AND an "Evidence you need" block. Run the search, then confirm you can see the specific error before jumping to the fix.

#### 4a. Node / module-loading warnings (root cause)

**MCP (preferred):**

```
ci_search_logs(runId: RUN_ID, pattern: "(node:\\d+) Warning|Failed to load|Cannot find module", context: 5)
```

**Shell fallback:**

```powershell
gh run view RUN_ID --log-failed | Select-String "\(node:\d+\) Warning|Failed to load|Cannot find module" -Context 5
```

**Evidence you need:** The exact warning line with the module path or file that failed to load.

```
# Example evidence (this is what you're looking for):
(node:3665) Warning: Failed to load the ES module: /home/runner/work/.../jest.config.web.ts
Cannot find module '@legacy-sports/shared-types' from 'lib/scoring/src/index.ts'
```

These usually mean a config file (`jest.config`, `tsconfig`, `package.json`) is misconfigured.

#### 4b. Formatting failure

**MCP (preferred):**

```
ci_search_logs(runId: RUN_ID, pattern: "format:check|Formatting.*failed", context: 3)
```

**Shell fallback:**

```powershell
gh run view RUN_ID --log-failed | Select-String "format:check|Formatting.*failed" -Context 3
```

**Evidence you need:** The list of unformatted files from the log output.

```
# Example evidence:
❌ Code formatting issues detected
The following files are not formatted:
  apps/web/src/App.tsx
  lib/utils/src/helpers.ts
```

If no file list appears, widen the search:

**MCP:** `ci_search_logs(runId: RUN_ID, pattern: "format", context: 10)`

**Shell:** `Select-String "format" -Context 10`

**Fix locally:**

```powershell
pnpm exec nx format:write
```

#### 4c. Lint errors

**MCP (preferred):**

```
# Find the error summary
ci_search_logs(runId: RUN_ID, pattern: "error  |✖ \\d+ problems", context: 3)

# Get the SPECIFIC errors with file, line, and rule name
ci_search_logs(runId: RUN_ID, pattern: "\\d+:\\d+\\s+error", context: 1)
```

**Shell fallback:**

```powershell
# Find the error summary
gh run view RUN_ID --log-failed | Select-String "error  |✖ \d+ problems" -Context 3

# Get the SPECIFIC errors with file, line, and rule name
gh run view RUN_ID --log-failed | Select-String "\d+:\d+\s+error" -Context 1
```

**Evidence you need:** The file path, line number, column, and ESLint rule name.

```
# Example evidence:
apps/web/src/App.tsx
  17:3  error  Promises must be awaited, end with a call to .catch, or...  @typescript-eslint/no-floating-promises
  42:1  error  'unusedVar' is assigned a value but never used               @typescript-eslint/no-unused-vars

✖ 2 problems (2 errors, 0 warnings)
```

**Fix locally:**

```powershell
pnpm exec nx affected -t lint --fix
```

Then manually resolve any errors that auto-fix cannot handle. See `.agents/skills/repo-tooling/SKILL.md` for guidance on specific lint rules.

#### 4d. TypeScript type errors

**MCP (preferred):**

```
# Find the error code and message
ci_search_logs(runId: RUN_ID, pattern: "error TS\\d+", context: 3)

# Get file path and line number
ci_search_logs(runId: RUN_ID, pattern: "\\.ts\\(\\d+,\\d+\\): error", context: 1)
```

**Shell fallback:**

```powershell
# Find the error code and message
gh run view RUN_ID --log-failed | Select-String "error TS\d+" -Context 3

# Get file path and line number
gh run view RUN_ID --log-failed | Select-String "\.ts\(\d+,\d+\): error" -Context 1
```

**Evidence you need:** The file path, line number, TS error code, and the full error message.

```
# Example evidence:
lib/scoring/src/utils.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
lib/shared-types/src/index.ts(15,10): error TS2305: Module '"./types"' has no exported member 'GameResult'.
```

**Fix locally:**

```powershell
pnpm exec nx affected -t typecheck
```

See `.agents/skills/repo-tooling/SKILL.md` for common patterns.

#### 4e. Unit test failures

**MCP (preferred):**

```
# Step 1: FIRST check for Node warnings above the failure (root cause)
ci_search_logs(runId: RUN_ID, pattern: "(node:\\d+) Warning|Failed to load", context: 5)

# Step 2: Find which test suites failed
ci_search_logs(runId: RUN_ID, pattern: "FAIL.*spec\\.ts|Failed tasks:", context: 5)

# Step 3: Get the actual assertion or runtime error
ci_search_logs(runId: RUN_ID, pattern: "Expected:|Received:|Error:|thrown:", context: 5)

# Step 4: If the above is unclear, get the full test output
ci_search_logs(runId: RUN_ID, pattern: "FAIL", context: 20)
```

**Shell fallback:**

```powershell
# Step 1: FIRST check for Node warnings above the failure (root cause)
gh run view RUN_ID --log-failed | Select-String "\(node:\d+\) Warning|Failed to load" -Context 5

# Step 2: Find which test suites failed
gh run view RUN_ID --log-failed | Select-String "FAIL.*spec\.ts|Failed tasks:" -Context 5

# Step 3: Get the actual assertion or runtime error
gh run view RUN_ID --log-failed | Select-String "Expected:|Received:|Error:|thrown:" -Context 5

# Step 4: If the above is unclear, get the full test output
gh run view RUN_ID --log-failed | Select-String -Context 20,5 "FAIL"
```

**Evidence you need:** EITHER a Node warning (= config problem, not a test bug) OR the specific test name + assertion error.

```
# Example evidence — config was the root cause (NOT a test bug):
(node:3665) Warning: Failed to load the ES module: jest.config.web.ts
FAIL shared-components:web lib/shared-components/src/features/players/PlayerStatsDataGrid.test.tsx
→ Fix the config, not the test.

# Example evidence — actual test failure:
FAIL lib/scoring/src/calculateScore.spec.ts
  ● calculateScore › should return 0 for empty roster
    expect(received).toBe(expected)
    Expected: 0
    Received: undefined
→ Fix the implementation in calculateScore.ts.
```

**IMPORTANT:** If tests fail, always check for Node warnings (step 1) _above_ the failure — the test may have failed because its config could not load. If you find a warning, fix the config issue, not the test.

**Fix locally:**

```powershell
pnpm exec nx affected -t test
```

#### 4f. Build failures

**MCP (preferred):**

```
# Find which project(s) failed
ci_search_logs(runId: RUN_ID, pattern: "Running target.*failed|Failed tasks:", context: 10)

# Get the specific build error
ci_search_logs(runId: RUN_ID, pattern: "ERROR|Error:|Module not found|Cannot find|BUILD FAILED", context: 5)
```

**Shell fallback:**

```powershell
# Find which project(s) failed
gh run view RUN_ID --log-failed | Select-String "Running target.*failed|Failed tasks:" -Context 10

# Get the specific build error
gh run view RUN_ID --log-failed | Select-String "ERROR|Error:|Module not found|Cannot find|BUILD FAILED" -Context 5
```

**Evidence you need:** The project name that failed AND the specific error (missing module, type error in build, bundle failure, etc.).

```
# Example evidence:
NX   Running target build for 3 projects failed
Failed tasks:
- web:build

Error: Module not found: Can't resolve '@legacy-sports/scoring' in '/home/runner/.../apps/web/src'
→ Missing dependency or incorrect import path.

# Example evidence — Lambda build:
❌ db Lambda build failed
Error: Cannot find module './resolvers/gameResolver'
→ Missing file or incorrect relative import.
```

**Fix locally:**

```powershell
pnpm exec nx affected -t build
```

### 5. Create a worktree before touching any files

> DO NOT edit files in `D:\code\legacy-sports` (the main repo). Investigation (reading logs, running read-only AWS/git commands) is fine from anywhere, but the moment you are ready to apply a fix you must be in a proper worktree.

If you do not already have an open branch for this fix:

```
# 1. Create a Jira ticket
jira_create_ticket(summary: "Fix: <one-line description>", type: "Bug", sprint: "current")

# 2. Create a worktree (MCP)
make_worktree_create(ticket: "LS-####", description: "short-description")

# 3. Set up the worktree
make_wt_setup(worktreePath: "<path from make_worktree_create output>")

# 4. All subsequent file edits and commands happen inside the worktree path
```

**Shell fallback:**

```powershell
# 1. Create a Jira ticket
$key = (acli jira workitem create --summary "Fix: <one-line description>" --project LS --type Bug --json | ConvertFrom-Json).key
acli jira workitem transition --key $key --status "In Progress"

# 2. Create a worktree (from the main repo)
cd D:\code\legacy-sports
twig worktree create "$key/short-description"
$wt = "<path from twig worktree list>"

# 3. Set up the worktree
make wt-setup WT=$wt   # or: make -C $wt install; Copy-Item ...\.env $wt\.env

# 4. All subsequent file edits and commands happen inside $wt
```

If you accidentally edited a file in the main repo before creating a worktree:

```powershell
# Stash the change, get into a worktree, then re-apply
cd D:\code\legacy-sports
git stash
# ... create worktree as above ...
cd $wt
git stash pop   # or manually re-apply the diff
```

### 6. Reproduce locally with `make pre-commit`

**Before running anything locally, confirm you have the evidence:** you should be able to state the specific error (file, line, error code/message) you found in step 4. If you cannot, go back to step 3 and fetch more logs.

After identifying the exact error, run the full local validation to confirm your fix:

```powershell
make pre-commit
```

This runs the same checks as CI in order: typecheck → lint → test → build. All must pass.

For faster iteration, run only the failing target:

```powershell
# Single target
pnpm exec nx affected -t lint
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t test
pnpm exec nx affected -t build

# Single project
pnpm exec nx test shared-components
pnpm exec nx lint web
```

### 6. Rebase on the parent branch, then push and verify

Before pushing the fix, always rebase onto the parent branch so the new CI run is based on the latest tip. Skipping this wastes a CI run if the parent has moved ahead.

**Preferred (MCP):** Use `worktree_rebase` — it fetches, rebases onto the configured parent, and sets `GIT_EDITOR=true` automatically to prevent editor blocking.

**Shell fallback — use `twig rebase`** with `GIT_EDITOR=true` to prevent the editor from blocking:

```bash
# Always fetch first so twig sees the latest remote state
git fetch origin

# Rebase onto the configured parent (main or a stacked branch)
GIT_EDITOR=true twig rebase

# If there are conflicts, resolve them, then:
#   git add <resolved-files>
#   GIT_EDITOR=true git rebase --continue
```

If `twig rebase` is unavailable or the parent is confirmed to be `main`, fall back to an explicit rebase:

```bash
git fetch origin main
GIT_EDITOR=true git rebase origin/main
```

Then push (force-with-lease is required after a rebase):

```powershell
git add -A ; git commit -m "fix(scope): resolve CI failure"
```

> **CRITICAL: Run `make pc` before pushing.** After fixing a CI failure, always run `make pc` to verify the fix before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time. Minimum alternative: `make format && make lint-fix && make typecheck`.

```powershell
# Run all pre-commit checks locally to confirm the fix
make pc
```

Then push the validated fix:

```powershell
git push origin HEAD --force-with-lease
```

### 7. If the failure is flaky / transient

Some CI failures are not caused by your code:

- **GitHub Actions infrastructure** — runner timeouts, service outages
- **Network issues** — npm registry failures, GitHub API rate limits

In these cases, rerun the failed jobs:

**MCP (preferred):**

```
ci_rerun(runId: RUN_ID, onlyFailedJobs: true)
```

**Shell fallback:**

```powershell
gh run rerun RUN_ID --failed
```

If flakiness persists, check [GitHub Status](https://www.githubstatus.com/) and the `#engineering` Slack channel.

### When search patterns return no results

If the search commands in step 4 don't match anything, **do not guess**. Escalate your search:

**MCP (preferred):**

```
# 1. Fetch all logs (not just failed) and search
ci_get_logs(runId: RUN_ID, failedOnly: false)

# 2. Search for GitHub Actions error annotations
ci_search_logs(runId: RUN_ID, pattern: "##\\[error\\]", context: 5)

# 3. Search for any non-zero exit code
ci_search_logs(runId: RUN_ID, pattern: "exit code [1-9]", context: 10)

# 4. Search for generic Nx failure markers
ci_search_logs(runId: RUN_ID, pattern: "❌|Failed tasks:|NX.*failed", context: 10)
```

**Shell fallback:**

```powershell
# 1. Save full logs (not just failed) and open in VS Code
gh run view RUN_ID --log > ci-full.txt
code ci-full.txt
# Use Ctrl+F to search for: error, fail, Error, FAIL, ❌, ##[error]

# 2. Search for the GitHub Actions error annotation format
gh run view RUN_ID --log | Select-String "##\[error\]" -Context 5

# 3. Search for any non-zero exit code
gh run view RUN_ID --log | Select-String "exit code [1-9]" -Context 10

# 4. Search for the generic Nx failure marker
gh run view RUN_ID --log | Select-String "❌|Failed tasks:|NX.*failed" -Context 10

# 5. View in browser where collapsible sections make it easier to navigate
gh run view RUN_ID --web
```

If you still cannot find a specific error, enable debug mode (below) and rerun.

## Enable Debug Mode

For extra-verbose CI logs, add the `ci-debug` label to your PR:

**MCP (preferred):**

```
github_manage_labels(prNumber: PR_NUMBER, add: ["ci-debug"])
```

**Shell fallback:**

```powershell
gh pr edit --add-label ci-debug
```

This turns on `NX_VERBOSE_LOGGING` and extended error context in all CI jobs.

## Quick Diagnostic Script

**MCP (preferred) — find and classify the failure type:**

```
# 1. Find the latest failed run for the branch
ci_list_runs(branch: "BRANCH_NAME", limit: 1)

# 2. Search for each failure category (use runId from step 1)
ci_search_logs(runId: RUN_ID, pattern: "Nx CLI not available|node_modules.*not found|workspace.*invalid")
ci_search_logs(runId: RUN_ID, pattern: "Failed to load|Cannot find module|(node:\\d+) Warning")
ci_search_logs(runId: RUN_ID, pattern: "format:check.*failed|Formatting.*failed|formatting issues detected")
ci_search_logs(runId: RUN_ID, pattern: "error  .*@typescript-eslint|✖ \\d+ problems|ESLint.*failed")
ci_search_logs(runId: RUN_ID, pattern: "error TS\\d+")
ci_search_logs(runId: RUN_ID, pattern: "FAIL.*spec\\.ts|Test Suites:.*failed")
ci_search_logs(runId: RUN_ID, pattern: "Running target.*failed|Failed tasks:|build failed")
```

**Shell fallback — PowerShell:**

```powershell
$runId = (gh run list --branch (git branch --show-current) --limit 1 --json databaseId --jq '.[0].databaseId')
$patterns = @(
  "Failed to load|Cannot find module",
  "\(node:\d+\) Warning",
  "format:check.*failed|Formatting.*failed",
  "error  .*@typescript-eslint|✖ \d+ problems",
  "error TS\d+",
  "FAIL.*spec\.ts",
  "Running target.*failed|Failed tasks:"
)
$logs = gh run view $runId --log-failed
foreach ($p in $patterns) {
  $hits = $logs | Select-String $p
  if ($hits) { Write-Host "MATCH [$p] — $($hits.Count) hit(s)" }
}
```

## Troubleshooting

- **No run found**: `ci_list_runs` returns empty — run may be in-progress or the branch name is wrong.
- **Logs empty**: `ci_get_logs(failedOnly: true)` returned nothing — try `failedOnly: false`. Shell: `gh run view RUN_ID --log`.
- **detect-changes failure**: usually infrastructure — rerun with `ci_rerun(runId: RUN_ID, onlyFailedJobs: true)`.
- **Merge-queue rejection**: find the merge-queue run with `ci_list_runs(workflow: "merge-queue.yml", limit: 5)`, then debug normally.

> **Advanced troubleshooting** (concurrency cancellations, skills lint, E2E failures, setup detection, Terraform locks, merge queue, build artifacts): see [ci-troubleshooting-advanced.md](ci-troubleshooting-advanced.md)

> **Pipeline architecture** (two-layer design diagram, env vars, timeouts, deployment debugging): see [ci-pipeline-architecture.md](ci-pipeline-architecture.md)

## Related Skills

`fix-lint` · `fix-types` · `test` · `build` · `deploy-lambda`
