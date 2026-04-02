---
name: github-actions-logs
description: 'Parse GitHub Actions workflow logs to diagnose CI failures and extract actionable error information. Use when investigating why a CI run failed, understanding which step broke, or debugging job execution order.'
---

# Skill: Reading GitHub Actions Logs

## Overview

Parse GitHub Actions logs to diagnose CI failures. The core workflow is: find the failed task → extract the exact error → fix the root cause (not the symptom).

## When to Use

- Investigating CI/CD pipeline failures
- Extracting specific error messages from long logs
- Debugging job execution order and dependencies

## Gotchas

- **Symptoms ≠ root cause**: A `FAIL` line in tests is a symptom. The real error (module loading, config issue, Node warning) appears 10–20 lines BEFORE the failure. Always read upward.
- **`failedOnly: true` can be empty**: Some failures happen in setup steps that don't register as "failed". Fall back to `failedOnly: false` if the result is empty.
- **Exit code 130**: Means the process was interrupted (timeout or manual cancellation), not a code error.

## `ci_get_logs` Parameter Reference

| Parameter    | Type    | Description                                                  |
| ------------ | ------- | ------------------------------------------------------------ |
| `runId`      | number  | Run-level logs — fetches output from all jobs in the run     |
| `jobId`      | number  | Single-job logs — use when you know exactly which job failed |
| `failedOnly` | boolean | `true` = only failed steps (fastest); `false` = all steps    |

**`runId` vs `jobId`**: Use `runId` as the default. Switch to `jobId` to isolate output from a specific job (e.g. just `quality-gates`) and reduce noise. Never pass both.

## Step 1: Find the Failed Run

**MCP (preferred):**

```
# List recent runs on current branch
ci_list_runs(branch: "BRANCH_NAME", limit: 5)

# Or check PR status (when you have a PR number)
github_pr_batch_status(prNumbers: [PR_NUMBER])
```

**Shell fallback:**

```powershell
# List recent runs on current branch
gh run list --branch $(git branch --show-current) --limit 5

# View failed logs (start here)
gh run view RUN_ID --log-failed
```

## Step 2: Extract the Exact Error

**NEVER guess.** Find the specific file, line number, error code, or message before fixing anything.

| Failure Type | Evidence required                              | Example                                                          |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------- |
| Lint         | File, line, column, rule name                  | `src/App.tsx:17:3 error @typescript-eslint/no-floating-promises` |
| TypeScript   | File, line, TS error code, message             | `utils.ts(42,5): error TS2345: Argument of type 'string'...`     |
| Unit test    | Test name + assertion OR Node warning above it | `Expected: 42, Received: undefined`                              |
| Build        | Project name + module/import error             | `Module not found: Can't resolve '@legacy-sports/scoring'`       |
| Format       | List of unformatted files                      | `apps/web/src/App.tsx` in format output                          |
| E2E          | Server error OR Playwright assertion           | `Development server process died`                                |
| Setup        | Specific Nx/node_modules error                 | `Nx CLI not available through any method`                        |

**MCP (preferred):**

```
# Find the failed task
ci_search_logs(runId: RUN_ID, pattern: "Failed tasks:")

# Get 20 lines of context around the failure
ci_search_logs(runId: RUN_ID, pattern: "❌ > nx run", context: 20)

# Search for warnings/errors that preceded the failure
ci_search_logs(runId: RUN_ID, pattern: "Warning:|Error:|Failed to load")
```

**Shell fallback:**

```powershell
# Find the failed task
gh run view RUN_ID --log-failed | Select-String "Failed tasks:"

# Get 20 lines of context around the failure
gh run view RUN_ID --log-failed | Select-String -Context 20 "❌ > nx run"

# Search for warnings/errors that preceded the failure
gh run view RUN_ID --log-failed | Select-String "Warning:|Error:|Failed to load"
```

## Step 3: Escalate if No Results

If searching returns nothing, widen the search in this order:

**MCP (preferred):**

```
# 1. GitHub Actions error annotations
ci_search_logs(runId: RUN_ID, pattern: "##\\[error\\]", context: 5)

# 2. Non-zero exit codes
ci_search_logs(runId: RUN_ID, pattern: "exit code [1-9]", context: 10)

# 3. Fetch full logs (not just failed)
ci_get_logs(runId: RUN_ID, failedOnly: false)
```

**Shell fallback:**

```powershell
# 1. GitHub Actions error annotations
gh run view RUN_ID --log | Select-String "##\[error\]" -Context 5

# 2. Non-zero exit codes
gh run view RUN_ID --log | Select-String "exit code [1-9]" -Context 10

# 3. Save full logs and search manually
gh run view RUN_ID --log > scratch/ci-logs.txt

# 4. Open in browser (collapsible sections are easier to navigate)
gh run view RUN_ID --web
```

## Step 4: Fix and Validate

Fix the root cause locally, then verify:

```powershell
make pc           # Run full pre-commit validation
git push          # Push fix
gh run view --web # Monitor the new run
```

Repeat until CI passes. Do NOT push without `make pc` passing first.

## Quick Reference

| Task               | MCP tool (preferred)                                        | Shell fallback                                                      |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| View failed logs   | `ci_get_logs(runId: RUN_ID, failedOnly: true)`              | `gh run view RUN_ID --log-failed`                                   |
| View all logs      | `ci_get_logs(runId: RUN_ID, failedOnly: false)`             | `gh run view RUN_ID --log`                                          |
| List recent runs   | `ci_list_runs(branch: "BRANCH", limit: 5)`                  | `gh run list --branch BRANCH --limit 5`                             |
| Get job-level logs | `ci_get_logs(jobId: JOB_ID)`                                | `gh run view JOB_ID` (job-level)                                    |
| Find root cause    | `ci_search_logs(runId: RUN_ID, pattern: "❌", context: 20)` | `gh run view RUN_ID --log-failed \| Select-String -Context 20 "❌"` |
| Find Node warnings | `ci_search_logs(runId: RUN_ID, pattern: "(node:.*Warning")` | `gh run view RUN_ID --log \| Select-String "(node:.*Warning"`       |
| Find type errors   | `ci_search_logs(runId: RUN_ID, pattern: "error TS")`        | `gh run view RUN_ID --log \| Select-String "error TS"`              |
| Find failed tasks  | `ci_search_logs(runId: RUN_ID, pattern: "Failed tasks")`    | `gh run view RUN_ID --log \| Select-String "Failed tasks"`          |
| Rerun failed jobs  | `ci_rerun(runId: RUN_ID, onlyFailedJobs: true)`             | `gh run rerun RUN_ID --failed`                                      |
| Check PR status    | `github_pr_batch_status(prNumbers: [PR_NUMBER])`            | `gh pr checks`                                                      |

### Workflow-Specific Runs

| Workflow        | MCP tool (preferred)                                             | Shell fallback                                                |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| CI pipeline     | `ci_list_runs(workflow: "ci-orchestrator.yml", limit: 5)`        | `gh run list --workflow ci-orchestrator.yml --limit 5`        |
| Web deploy      | `ci_list_runs(workflow: "deploy-web.yml", limit: 5)`             | `gh run list --workflow deploy-web.yml --limit 5`             |
| Lambda upload   | `ci_list_runs(workflow: "upload-lambdas.yml", limit: 5)`         | `gh run list --workflow upload-lambdas.yml --limit 5`         |
| Terraform apply | `ci_list_runs(workflow: "lambda-terraform-apply.yml", limit: 5)` | `gh run list --workflow lambda-terraform-apply.yml --limit 5` |
| Merge queue     | `ci_list_runs(workflow: "merge-queue.yml", limit: 5)`            | `gh run list --workflow merge-queue.yml --limit 5`            |

## Troubleshooting

| Issue                       | Fix                                                                 |
| --------------------------- | ------------------------------------------------------------------- |
| `ci_get_logs` returns empty | Use `failedOnly: false` — failure may be in a non-failing step      |
| Can't find specific error   | Use `ci_search_logs` with a broader pattern, or fetch full logs     |
| Too many logs to read       | Use `ci_search_logs(runId: RUN_ID, pattern: "project-name.*error")` |
| Need to compare runs        | Call `ci_get_logs` for each runId and compare the returned text     |
