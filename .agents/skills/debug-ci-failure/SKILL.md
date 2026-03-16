---
name: debug-ci-failure
description: 'End-to-end workflow for debugging failed GitHub Actions CI runs: identify the failed stage, fetch logs, locate the root cause, reproduce locally, fix, and re-verify. Use when a CI run fails on a PR or branch.'
---

# Skill: Debug a Failed GitHub Actions Run

## Overview

Step-by-step playbook for triaging and fixing a failed CI run in the Legacy Sports monorepo. The CI pipeline has six stages that run in order — a failure in any stage blocks later ones. This skill walks through identifying which stage failed, pulling the right logs, finding the root cause, and driving to a fix.

## When to Use

- A GitHub Actions CI run failed on your PR or branch
- `gh pr checks` shows a failing status
- You need to understand **why** CI failed and how to fix it
- A merge-queue run was rejected

## CRITICAL: Evidence-First Debugging

**NEVER guess at the problem.** Before attempting any fix, you MUST extract the actual error text from CI logs — the specific file, line number, error code, or message that identifies what went wrong.

**Insufficient evidence (DO NOT proceed with just this):**

- "The lint step failed" — _which rule? which file?_
- "There are TypeScript errors" — _which TS error code? which file/line?_
- "Unit tests failed" — _which test? what assertion? was it a config error upstream?_
- "The build failed" — _which project? what error message?_

**Sufficient evidence (you need this before fixing):**

- `lib/scoring/src/utils.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'`
- `apps/web/src/App.tsx:17:3 error @typescript-eslint/no-floating-promises: Promises must be awaited`
- `FAIL lib/utils/src/helpers.spec.ts — Expected: 42, Received: undefined`
- `(node:3665) Warning: Failed to load the ES module: jest.config.web.ts`

If a search pattern returns no results, widen your search or save the full logs and read them. **Do not skip the evidence step.**

## CI Pipeline Stages (in order)

| Stage | Job              | What It Does                               |
| ----- | ---------------- | ------------------------------------------ |
| 1     | detect-changes   | Determines affected projects (~30 s)       |
| 2     | quality-gates    | Formatting → Lint → Typecheck → Unit tests |
| 2b    | build-validation | Web, mobile, and Lambda builds             |
| 3     | e2e              | End-to-end Playwright tests                |
| 4     | summarize        | Posts PR comment and badges (always runs)  |

Failures most commonly occur in **quality-gates** or **build-validation**.

## Steps

### 1. Find the failed run

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

```powershell
# Show only logs from failed steps (fastest)
gh run view RUN_ID --log-failed

# Save to a file for easier searching
gh run view RUN_ID --log-failed > ci-failed.txt
code ci-failed.txt
```

If `--log-failed` is empty or too short, fetch all logs:

```powershell
gh run view RUN_ID --log > ci-full.txt
```

**Your goal in this step is to find the exact error line(s).** Do not proceed until you can cite the specific error message, file path, line number, or error code from the logs.

### 4. Identify the root cause

**Most CI failures come from one of six categories.** Search in this order — earlier items are root causes that cascade into later symptoms.

> **IMPORTANT:** Each sub-step below has a search command AND an "Evidence you need" block. Run the search, then confirm you can see the specific error before jumping to the fix.

#### 4a. Node / module-loading warnings (root cause)

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

If no file list appears, widen the search: `Select-String "format" -Context 10`

**Fix locally:**

```powershell
pnpm exec nx format:write
```

#### 4c. Lint errors

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

Then manually resolve any errors that auto-fix cannot handle. See `.agents/skills/fix-lint/SKILL.md` for guidance on specific lint rules.

#### 4d. TypeScript type errors

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

See `.agents/skills/fix-types/SKILL.md` for common patterns.

#### 4e. Unit test failures

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

> 🚨 **DO NOT edit files in `D:\code\legacy-sports` (the main repo).** Investigation (reading logs, running read-only AWS/git commands) is fine from anywhere, but the moment you are ready to apply a fix you must be in a proper worktree.

If you do not already have an open branch for this fix:

```powershell
# 1. Create a Jira ticket
$key = (acli jira workitem create --summary "Fix: <one-line description>" --project LS --type Bug --json | ConvertFrom-Json).key
acli jira workitem transition --key $key --status "In Progress"

# 2. Create a worktree (from the main repo)
cd D:\code\legacy-sports
twig worktree create "$key/short-description"
$wt = "<path from twig worktree list>"

# 3. Set up the worktree
make wt-setup WT=$wt   # or: cd $wt; make install; Copy-Item ...\.env .env

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

**Use `twig rebase`** — it reads the branch's configured parent from twig metadata and rebases correctly, whether the parent is `main` or another feature branch.

```powershell
# Always fetch first so twig sees the latest remote state
git fetch origin

# Rebase onto the configured parent (main or a stacked branch)
twig rebase

# If there are conflicts, resolve them, then:
#   git add <resolved-files>
#   $env:GIT_EDITOR = "true" ; git rebase --continue
```

If `twig rebase` is unavailable or the parent is confirmed to be `main`, fall back to an explicit rebase:

```powershell
git fetch origin main
git rebase origin/main
```

Then push (force-with-lease is required after a rebase):

```powershell
git add -A ; git commit -m "fix(scope): resolve CI failure"
git push origin HEAD --force-with-lease
```

Then verify the fix passes locally before waiting on GitHub CI:

```powershell
# Run all pre-commit checks locally to confirm the fix
make pc
```

### 7. If the failure is flaky / transient

Some CI failures are not caused by your code:

- **GitHub Actions infrastructure** — runner timeouts, service outages
- **Network issues** — npm registry failures, GitHub API rate limits

In these cases, rerun the failed jobs:

```powershell
gh run rerun RUN_ID --failed
```

If flakiness persists, check [GitHub Status](https://www.githubstatus.com/) and the `#engineering` Slack channel.

### When search patterns return no results

If the `Select-String` commands in step 4 don't match anything, **do not guess**. Escalate your search:

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

```powershell
gh pr edit --add-label ci-debug
```

This turns on `NX_VERBOSE_LOGGING` and extended error context in all CI jobs.

## Quick Diagnostic Script

Run this one-liner to classify the failure type automatically:

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

### `gh run view` returns no output

The run may still be in progress or the token lacks `actions:read` scope. Confirm with:

```powershell
gh run view RUN_ID
```

### Logs are truncated

GitHub truncates very long log lines. Save to file and search locally, or open in the browser:

```powershell
gh run view RUN_ID --web
```

### Failure in detect-changes

This early stage rarely fails. When it does, it is usually an infrastructure issue (runner allocation, checkout failure). Rerun the job:

```powershell
gh run rerun RUN_ID --failed
```

### Merge-queue rejection

The merge queue runs `ci-pipeline.yml` via `ci-orchestrator.yml`. Debug the same way — find the merge-queue run ID and follow this workflow.

```powershell
gh run list --workflow ci-orchestrator.yml --limit 5
```

> 📎 **Advanced troubleshooting** (items 8-15: concurrency cancellations, skills lint, E2E failures, setup detection, Terraform locks, merge queue, build artifacts): see [references/ci-troubleshooting-advanced.md](references/ci-troubleshooting-advanced.md)

> 📎 **Pipeline architecture** (two-layer design diagram, env vars, timeouts, deployment debugging, comprehensive diagnostic script): see [references/ci-pipeline-architecture.md](references/ci-pipeline-architecture.md)

## Related Skills

- `.agents/skills/github-actions-logs/SKILL.md` — Detailed log parsing patterns and PowerShell commands
- `.agents/skills/fix-lint/SKILL.md` — Resolving specific ESLint rule violations
- `.agents/skills/fix-types/SKILL.md` — Fixing TypeScript type errors
- `.agents/skills/test/SKILL.md` — Running and debugging unit tests locally
- `.agents/skills/build/SKILL.md` — Building affected projects
- `.agents/skills/troubleshoot/SKILL.md` — General dev-environment troubleshooting
- `.agents/skills/deploy-lambda/SKILL.md` — Lambda deployment workflow
