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
- **`--log-failed` can be empty**: Some failures happen in setup steps that don't register as "failed". Fall back to `--log` if `--log-failed` returns nothing.
- **Exit code 130**: Means the process was interrupted (timeout or manual cancellation), not a code error.

## Step 1: Find the Failed Run

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

```powershell
# Find the failed task
gh run view RUN_ID --log-failed | Select-String "Failed tasks:"

# Get 20 lines of context around the failure
gh run view RUN_ID --log-failed | Select-String -Context 20 "❌ > nx run"

# Search for warnings/errors that preceded the failure
gh run view RUN_ID --log-failed | Select-String "Warning:|Error:|Failed to load"
```

## Step 3: Escalate if No Results

If `Select-String` returns nothing, widen the search in this order:

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

| Task               | Command                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| View failed logs   | `gh run view RUN_ID --log-failed`                                             |
| View all logs      | `gh run view RUN_ID --log`                                                    |
| List recent runs   | `gh run list --branch BRANCH --limit 5`                                       |
| Open in browser    | `gh run view RUN_ID --web`                                                    |
| Find root cause    | `gh run view RUN_ID --log-failed \| Select-String -Context 20 "❌"`           |
| Find Node warnings | `gh run view RUN_ID --log \| Select-String "\(node:.*Warning"`                |
| Find type errors   | `gh run view RUN_ID --log \| Select-String "error TS"`                        |
| Find failed tasks  | `gh run view RUN_ID --log \| Select-String "Failed tasks"`                    |
| List jobs in run   | `gh run view RUN_ID --json jobs --jq '.jobs[] \| "\(.name): \(.conclusion)"'` |
| Rerun failed jobs  | `gh run rerun RUN_ID --failed`                                                |
| Check PR status    | `gh pr checks`                                                                |

### Workflow-Specific Runs

| Workflow        | Command                                                       |
| --------------- | ------------------------------------------------------------- |
| CI pipeline     | `gh run list --workflow ci-orchestrator.yml --limit 5`        |
| Web deploy      | `gh run list --workflow deploy-web.yml --limit 5`             |
| Lambda upload   | `gh run list --workflow upload-lambdas.yml --limit 5`         |
| Terraform apply | `gh run list --workflow lambda-terraform-apply.yml --limit 5` |
| Merge queue     | `gh run list --workflow merge-queue.yml --limit 5`            |

## Troubleshooting

| Issue                     | Fix                                                            |
| ------------------------- | -------------------------------------------------------------- |
| `--log-failed` is empty   | Use `--log` instead — failure may be in a non-failing step     |
| Can't find specific error | Save to file: `gh run view RUN_ID --log > scratch/ci-logs.txt` |
| Too many logs to read     | Focus: `Select-String "project-name.*error"` or `"error TS2"`  |
| Need to compare runs      | `code --diff run1.txt run2.txt`                                |

> 📎 **Detailed error pattern search commands**: see [references/error-patterns.md](references/error-patterns.md)
> 📎 **Log analysis and parsing scripts**: see [references/log-analysis-commands.md](references/log-analysis-commands.md)
> 📎 **CI workflow architecture and composite actions**: see [references/ci-workflow-patterns.md](references/ci-workflow-patterns.md)
> 📎 **Auto-classification diagnostic scripts**: see [references/diagnostic-scripts.md](references/diagnostic-scripts.md)
