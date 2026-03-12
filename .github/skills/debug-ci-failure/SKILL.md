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

Then manually resolve any errors that auto-fix cannot handle. See `skills/fix-lint/SKILL.md` for guidance on specific lint rules.

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

See `skills/fix-types/SKILL.md` for common patterns.

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

### 8. Concurrency cancellations (not a real failure)

If you push a new commit while CI is running, the orchestrator's `cancel-in-progress: true` kills the previous run. This appears as a failure but is expected behavior.

**Pattern in logs:**

```
The run was canceled because a more recent commit was pushed to the branch.
```

Or:

```
##[error]The operation was canceled.
```

**How to identify:**

```powershell
gh run view RUN_ID | Select-String "cancel|The operation was canceled"
```

**No fix needed** — the newer run supersedes it.

### 9. Agent skills lint failure

The `quality-gates` job runs `node scripts/lint-skills.js` before the main quality checks. This validates all skill files under `.github/skills/` using the `agentskills` CLI.

**Pattern in logs:**

```
✖ skill-name
N skill(s) failed validation, M passed.
```

**How to find:**

```powershell
gh run view RUN_ID --log-failed | Select-String "skill.*failed validation|✖"
```

**Fix locally:**

```powershell
# Validate all skills
node scripts/lint-skills.js

# Validate a single skill
uvx --from skills-ref agentskills validate .github/skills/SKILL_NAME
```

### 10. E2E test failures

E2E failures have unique root causes beyond unit test failures — the dev server may crash or fail to start.

**Pattern in logs:**

```
❌ Development server failed to start within 60 seconds
❌ Development server process died unexpectedly
```

**How to find:**

```powershell
# Server-level failures
gh run view RUN_ID --log-failed | Select-String "server.*fail|server.*died|server.*crash" -Context 5

# Playwright test failures
gh run view RUN_ID --log-failed | Select-String "FAIL.*e2e|playwright.*error" -Context 5
```

**Fix locally:**

```powershell
# Start the dev server first
pnpm exec nx serve web

# Run E2E tests in another terminal
pnpm exec nx e2e web-e2e
```

### 11. Setup / workspace detection failures

The `setup` composite action validates the Nx workspace after installing dependencies. Failures here block every downstream job.

**Pattern in logs:**

```
❌ Nx CLI not available through any method
❌ node_modules directory not found after installation
❌ Nx workspace configuration invalid after recovery attempt
⚠️ nx binary exists but not functional or timed out
```

**How to find:**

```powershell
gh run view RUN_ID --log-failed | Select-String "Nx CLI not available|node_modules.*not found|workspace.*invalid|nx binary.*not functional" -Context 5
```

**Resolution:** Usually a transient runner issue or cache corruption. Rerun the job:

```powershell
gh run rerun RUN_ID --failed
```

If it persists, clear the Nx cache locally and push an empty commit to bust the CI cache:

```powershell
pnpm exec nx reset
git commit --allow-empty -m "chore: bust CI cache"
git push origin HEAD
```

### 13. Terraform state lock conflicts

Lambda deployments use Terraform with DynamoDB state locking. Stale locks can block deployments indefinitely.

**Pattern in logs:**

```
Error acquiring the state lock
Lock Info:
  ID:
  Path:    terraform-state-locks
  Operation: OperationTypePlan
```

**How to find:**

```powershell
# Find the deployment run
gh run list --workflow lambda-terraform-apply.yml --limit 5

# Check for lock errors
gh run view RUN_ID --log-failed | Select-String "state lock|Lock Info" -Context 10
```

**Resolution:** The CI pipeline auto-cleans locks older than 30 minutes. For manual intervention:

```powershell
# Find the lock ID from the logs, then force-unlock
# (requires AWS credentials and Terraform CLI)
cd terraform/lambda
terraform force-unlock LOCK_ID
```

### 14. Merge queue failures

The merge queue re-evaluates PRs after CI completes. Special failure modes exist here.

**Pattern in logs:**

```
# Permission error
HttpError: Resource not accessible by integration

# Checks not yet registered
No check runs found for the latest commit

# Already at head
Branch is already up to date
```

**How to find:**

```powershell
# Find merge queue runs
gh run list --workflow merge-queue.yml --limit 5

# Check for specific errors
gh run view RUN_ID --log-failed | Select-String "HttpError|not accessible|No check runs" -Context 5
```

**Resolution:**

- **Permission errors:** Ensure the GitHub App (`MERGE_QUEUE_APP_ID`) has sufficient permissions
- **Checks not registered:** The merge queue waits — no action needed, it re-evaluates on next trigger
- **Stuck PRs:** Remove and re-add the `merge-when-ready` label to re-trigger

```powershell
gh pr edit PR_NUMBER --remove-label merge-when-ready
gh pr edit PR_NUMBER --add-label merge-when-ready
```

### 15. Build artifact download failures in E2E

The E2E job downloads web build artifacts from the `build-validation` stage. If the artifact is missing, the download silently fails (`continue-on-error: true`), and E2E may run against stale content.

**How to identify:**

```powershell
gh run view RUN_ID --log | Select-String "download-artifact|Unable to find.*artifact|Artifact not found" -Context 3
```

**Resolution:** If E2E fails with seemingly correct test code, check whether the artifact was actually downloaded. If not, the web build may have failed silently in `build-validation`. Investigate that job first.

## Pipeline Architecture Reference

Understanding the CI architecture helps with debugging. The pipeline uses a two-layer design:

```
ci-orchestrator.yml  (triggered by PR / push / merge_group / schedule)
├── determine-scope        ← decides which sub-workflows to run
├── ci-pipeline.yml        ← main quality + build pipeline (reusable workflow)
│   ├── detect-changes     ← dorny/paths-filter + git diff
│   ├── quality-gates      ← format → lint → typecheck → test
│   ├── build-validation   ← web / mobile / lambda builds
│   ├── e2e                ← Playwright tests
│   └── summarize          ← PR comment + badges
└── security-scanning.yml  ← conditional
```

**Key environment variables in CI:**

| Variable             | Value                       | Purpose                      |
| -------------------- | --------------------------- | ---------------------------- |
| `NX_DAEMON`          | `false`                     | Disables persisted Nx daemon |
| `NX_SKIP_NX_CACHE`   | `false`                     | Cache enabled                |
| `NX_CACHE_DIRECTORY` | `.nx-cache`                 | Local cache path             |
| `NODE_OPTIONS`       | `--max_old_space_size=4096` | 4GB heap limit               |
| `NX_NO_CLOUD`        | `true`                      | Disables Nx Cloud            |
| `NX_VERBOSE_LOGGING` | `true` (debug mode)         | Extra logging                |

**Timeouts per job:**

| Job              | Timeout |
| ---------------- | ------- |
| detect-changes   | 5 min   |
| quality-gates    | 30 min  |
| build-validation | 30 min  |
| e2e              | 30 min  |
| summarize        | 10 min  |

## Deployment Pipeline Debugging

Deployment failures don't show in normal CI checks but block production releases. Three deployment pipelines exist:

### Web deployment (`deploy-web.yml`)

Triggers on push to `main` (paths: `apps/web/**`, `lib/shared-components/**`). Deploys to GitHub Pages.

```powershell
# Find deploy runs
gh run list --workflow deploy-web.yml --limit 5

# Check for failures
gh run view RUN_ID --log-failed | Select-String "build failed|deploy.*failed|Pages.*error" -Context 5
```

Common issues: missing `VITE_*` secrets, Sentry sourcemap upload failure, Pages deployment timeout.

### Lambda deployment (`upload-lambdas.yml` → `lambda-terraform-apply.yml`)

The consolidated upload workflow builds affected lambdas via matrix, packages and uploads to S3. Then `lambda-terraform-apply.yml` runs Terraform to update the Lambda function code.

```powershell
# Find upload runs
gh run list --workflow upload-lambdas.yml --limit 5

# Find terraform apply runs
gh run list --workflow lambda-terraform-apply.yml --limit 5
```

**Batching behavior:** If multiple lambdas push simultaneously, the Terraform apply job uses `cancel-in-progress: true` to batch — the first Terraform run gets cancelled and the second picks up all changes. This is expected, not a failure.

## Comprehensive Diagnostic Script

Enhanced version of the quick diagnostic — classifies all failure types:

```powershell
$runId = (gh run list --branch (git branch --show-current) --limit 1 --json databaseId --jq '.[0].databaseId')
$logs = gh run view $runId --log-failed

$categories = @{
  "🔧 Setup/Workspace"     = "Nx CLI not available|node_modules.*not found|workspace.*invalid|pnpm-lock.*not found"
  "📦 Module Loading"       = "Failed to load|Cannot find module|\(node:\d+\) Warning"
  "🎨 Formatting"           = "format:check.*failed|Formatting.*failed|formatting issues detected"
  "🔍 Lint"                 = "error  .*@typescript-eslint|✖ \d+ problems|ESLint.*failed"
  "📝 TypeScript"           = "error TS\d+"
  "🧪 Unit Tests"           = "FAIL.*spec\.ts|Test Suites:.*failed"
  "🏗️ Build"                = "Running target.*failed|Failed tasks:|build failed"
  "🌐 E2E"                  = "server.*fail|server.*died|playwright.*error"
  "📚 Skills Lint"          = "skill.*failed validation|✖.*skill"
  "🔒 Terraform Lock"       = "state lock|Lock Info"
  "⏹️ Cancelled"            = "operation was canceled|more recent commit"
  "🔐 Permissions"          = "not accessible by integration|403|Permission denied"
}

foreach ($name in $categories.Keys) {
  $hits = $logs | Select-String $categories[$name]
  if ($hits) {
    Write-Host "$name — $($hits.Count) hit(s)" -ForegroundColor Red
    $hits | Select-Object -First 2 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
  }
}
```

## Related Skills

- `skills/github-actions-logs/SKILL.md` — Detailed log parsing patterns and PowerShell commands
- `skills/fix-lint/SKILL.md` — Resolving specific ESLint rule violations
- `skills/fix-types/SKILL.md` — Fixing TypeScript type errors
- `skills/test/SKILL.md` — Running and debugging unit tests locally
- `skills/build/SKILL.md` — Building affected projects
- `skills/troubleshoot/SKILL.md` — General dev-environment troubleshooting
- `skills/deploy-lambda/SKILL.md` — Lambda deployment workflow
