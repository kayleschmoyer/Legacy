---
name: github-actions-logs
description: 'Parse and analyze GitHub Actions CI/CD workflow logs to diagnose failures, understand build progress, and extract actionable error information.'
---

# Skill: Reading GitHub Actions Logs

## Overview

Efficiently parse and analyze GitHub Actions logs to diagnose failures, understand build progress, and extract actionable information from complex CI/CD pipelines.

## When to Use

- Investigating CI/CD pipeline failures
- Understanding which step in the workflow failed
- Extracting specific error messages from long logs
- Monitoring test results and build times
- Debugging job execution order and dependencies

## Commands

### View Run Logs with GitHub CLI

```powershell
# View logs from a specific run (failed steps only)
gh run view RUN_ID --log-failed

# View logs from latest run on current branch
gh run view --log-failed

# View all logs from a run (includes successful steps)
gh run view RUN_ID --log

# View logs from specific job
gh run view RUN_ID --job JOB_ID --log

# List recent runs to find RUN_ID
gh run list --branch feature/your-branch --limit 5

# Get run status
gh run view RUN_ID
```

### View Logs by Workflow

```powershell
# CI pipeline runs
gh run list --workflow ci-orchestrator.yml --limit 5

# Web deployment runs
gh run list --workflow deploy-web.yml --limit 5

# Lambda upload runs (consolidated matrix workflow)
gh run list --workflow upload-lambdas.yml --limit 5

# Terraform apply runs
gh run list --workflow lambda-terraform-apply.yml --limit 5

# Merge queue runs
gh run list --workflow merge-queue.yml --limit 5

# Security scanning runs
gh run list --workflow security-scanning.yml --limit 5
```

### View Individual Job Logs

```powershell
# List all jobs in a run
gh run view RUN_ID --json jobs --jq '.jobs[] | "\(.id) \(.name) \(.conclusion)"'

# View a specific job's logs
gh run view RUN_ID --job JOB_ID --log
```

### View Logs in Browser

```powershell
# Open run in browser
gh run view RUN_ID --web

# Or construct URL manually
# https://github.com/OWNER/REPO/actions/runs/RUN_ID/job/JOB_ID
```

## Log Structure Understanding

### Nx Monorepo Logs

GitHub Actions logs for Nx workspaces have specific patterns:

```
🚀 CI Pipeline / Job Name STEP_NAME    TIMESTAMP Log message
```

**Common patterns:**

- `##[group]` - Start of a collapsible log section
- `##[endgroup]` - End of a collapsible log section
- `##[error]` - Error message (critical)
- `##[warning]` - Warning message
- `UNKNOWN STEP` - Steps that haven't been properly labeled
- `✅ > nx run project:target` - Successful Nx command
- `❌ > nx run project:target` - Failed Nx command

### Key Log Sections

1. **Setup Phase**
   - Checkout code
   - Setup Node.js
   - Install dependencies
   - Cache operations

2. **Quality Gates**
   - Formatting checks
   - Linting validation
   - Type checking
   - Unit tests

3. **Build Validation**
   - Web builds
   - Mobile builds
   - Lambda builds

4. **Results Collection**
   - Performance metrics
   - Test summaries
   - Coverage reports

## Common Error Patterns

### 🚨 Critical: Evidence-First Log Reading

**NEVER guess at the problem.** The purpose of reading logs is to extract the **exact error** — file path, line number, error code, or error message — before attempting any fix.

**Most failures show symptoms (test failures) but the ROOT CAUSE appears earlier in the log.** A test `FAIL` line is NOT sufficient evidence. You must find the actual error that caused it.

**What counts as sufficient evidence:**

| Failure Type | You need to find...                            | Example                                                                    |
| ------------ | ---------------------------------------------- | -------------------------------------------------------------------------- |
| Lint         | File, line, column, rule name                  | `src/App.tsx:17:3 error @typescript-eslint/no-floating-promises`           |
| TypeScript   | File, line, TS error code, message             | `utils.ts(42,5): error TS2345: Argument of type 'string'...`               |
| Unit test    | Test name + assertion OR Node warning above it | `Expected: 42, Received: undefined` or `Warning: Failed to load ES module` |
| Build        | Project name + module/import error             | `Module not found: Can't resolve '@legacy-sports/scoring'`                 |
| Format       | List of unformatted files                      | `apps/web/src/App.tsx` in format output                                    |
| E2E          | Server error OR Playwright assertion           | `Development server process died` or `expect(locator).toBeVisible()`       |
| Setup        | Specific Nx/node_modules error                 | `Nx CLI not available through any method`                                  |

**If your `Select-String` commands return nothing, do NOT proceed — widen the search:**

```powershell
# Fallback 1: Search for the GitHub Actions error annotation format
gh run view RUN_ID --log | Select-String "##\[error\]" -Context 5

# Fallback 2: Search for any non-zero exit code
gh run view RUN_ID --log | Select-String "exit code [1-9]" -Context 10

# Fallback 3: Save full logs and open in VS Code for manual reading
gh run view RUN_ID --log > ci-full.txt
code ci-full.txt

# Fallback 4: View in browser (collapsible sections are easier to navigate)
gh run view RUN_ID --web
```

Always look for:

1. **Warnings BEFORE the failure** - Node.js warnings, module loading errors
2. **Configuration errors** - jest.config, tsconfig, package.json issues
3. **Dependency problems** - Outdated packages, missing modules
4. **Exit codes** - Process crashes that cascade to test failures

**Example workflow for extracting evidence:**

```powershell
# Step 1: Find the failed task
gh run view RUN_ID --log-failed | Select-String "Failed tasks:"

# Step 2: Get 20 lines of context BEFORE and AFTER the failure
gh run view RUN_ID --log-failed | Select-String -Context 20 "❌ > nx run"

# Step 3: Extract the actual error from that context
gh run view RUN_ID --log-failed | Select-String "Warning:|Error:|Failed to load"

# Step 4: If still unclear, get the last 50 lines of the failed job
gh run view RUN_ID --log-failed | Select-Object -Last 50
```

> **Read [references/error-patterns.md](references/error-patterns.md)** for detailed search commands and evidence examples for each CI error type (module loading, test failures, config errors, outdated deps, type errors, lint, build, React warnings, exit codes).

> **Read [references/log-analysis-commands.md](references/log-analysis-commands.md)** for PowerShell commands to extract test summaries, performance metrics, save/parse logs, and group errors.

## Integration with Quick Reference

### After PR Push

```powershell
# 1. List recent runs
gh run list --branch feature/your-branch --limit 3

# 2. Check latest run status
gh run view --log-failed

# 3. If failed, extract specific errors
gh run view --log-failed | Select-String "error|FAIL|Failed tasks"

# 4. Open in browser for detailed view
gh run view --web
```

> **Read [references/diagnostic-scripts.md](references/diagnostic-scripts.md)** for ready-to-run diagnostic scripts that auto-classify failure types.

## Reading Specific Log Sections

### Quality Gates Section

```powershell
# Extract quality gates results
gh run view RUN_ID --log | Select-String -Context 0,10 "Quality Gates Results"

# Look for:
# | Check | Result | Status |
# | Code Formatting | ✅ Passed | ...
# | ESLint Validation | ✅ Passed | ...
# | TypeScript Check | ✅ Passed | ...
# | Unit Tests | ❌ Failed | ...
```

### Execution Plan Section

```powershell
# Find what was planned to run
gh run view RUN_ID --log | Select-String -Context 0,20 "execution_plan"

# Shows affected components and planned validations
```

### Performance Summary

```powershell
# Extract CI performance data
gh run view RUN_ID --log | Select-String -Context 0,5 "CI Performance Analysis"

# Shows:
# - Execution Mode (local/distributed)
# - Duration
# - Performance rating
```

## Exit Codes

- **0**: Command successful
- **Non-zero**: Error occurred (check output for details)
- **130**: Process interrupted (often timeout or manual cancellation)

## Common Issues

### Issue: Log output truncated

**Solution**: Use `--log` instead of `--log-failed` to see full output

```powershell
gh run view RUN_ID --log
```

### Issue: Can't find specific error

**Solution**: Save to file and use text editor search

```powershell
gh run view RUN_ID --log > full-logs.txt
# Open in VS Code and use Ctrl+F
code full-logs.txt
```

### Issue: Too many logs to read

**Solution**: Use targeted searches

```powershell
# Focus on specific project
gh run view RUN_ID --log | Select-String "shared-components.*error"

# Focus on specific error type
gh run view RUN_ID --log | Select-String "error TS2"
```

### Issue: Need to correlate multiple runs

**Solution**: Compare runs side by side

```powershell
# Get both logs
gh run view RUN_ID_1 --log > run1.txt
gh run view RUN_ID_2 --log > run2.txt

# Use diff tool
code --diff run1.txt run2.txt
```

## Best Practices

1. **🚨 EXTRACT THE EXACT ERROR**: Never guess. Find the specific file, line number, error code, or message before fixing anything
2. **🔍 FIND THE ROOT CAUSE**: Test failures are symptoms — look for warnings/errors BEFORE the failure
3. **Start with failed logs**: Use `--log-failed` first, but switch to `--log` if the output is empty or incomplete
4. **Get context**: Always use `-Context 20` to see what happened before the error
5. **Look for Node warnings**: `(node:XXXX) Warning` often indicates the root problem
6. **Check configuration**: Module loading, package.json, jest.config errors are common culprits
7. **Work backwards**: Start from the ❌ failed step and read upward
8. **Search strategically**: Use key patterns (Failed to load, Warning, Cannot find)
9. **Escalate your search**: If `Select-String` returns nothing, try `##[error]`, `exit code [1-9]`, or save to file and read manually
10. **Save for analysis**: Save logs to file for complex debugging
11. **Check timestamps**: Helps identify timeouts or hanging processes
12. **Compare runs**: Compare current logs with previous successful runs

## Integration with Workflow

### After Creating PR

```powershell
# 1. Run all pre-commit checks locally (don't wait on GitHub CI)
make pc

# 2. If make pc fails, fix issues locally
# ... make changes ...

# 3. If debugging a remote-only failure, view logs
gh run view --log-failed

# 4. Push fix and re-verify locally
git push
make pc
```

### During Development

```powershell
# Check if your branch has CI failures before creating PR
$runId = (gh run list --branch $(git branch --show-current) --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view $runId

# If failed, fix before creating PR
if ($LASTEXITCODE -ne 0) {
  gh run view $runId --log-failed
}
```

## Related Skills

- [Jira Ticket Management](jira-ticket.md) - Update tickets based on CI results
- [Create PR](create-pr.md) - PR creation after `make pc` passes locally
- [Testing](test.md) - Local testing to prevent CI failures
- [Type Checking](typecheck.md) - Fix type errors before CI
- [Linting](lint.md) - Fix lint errors before CI

## Related Documentation

- [CI System Documentation](../../docs/ci-cd/ci-system-documentation.md) - Complete CI/CD overview
- [CI Troubleshooting](../../docs/ci-cd/ci-troubleshooting-guide.md) - Detailed CI debugging
- [Common Pitfalls CSV](../../docs/agents/common-pitfalls.csv) - Common mistakes

## Root Cause Analysis Checklist

When investigating a failure, check in this order:

- [ ] **Step 1**: Find failed task with `gh run view RUN_ID --log-failed | Select-String "Failed tasks:"`
- [ ] **Step 2**: Get context before failure: `gh run view RUN_ID --log-failed | Select-String -Context 20 "❌ > nx run"`
- [ ] **Step 3**: Look for Node warnings: `Select-String "(node:.*Warning"`
- [ ] **Step 4**: Check module loading: `Select-String "Failed to load|Cannot find module"`
- [ ] **Step 5**: Check configuration: `Select-String "jest.config|package.json|tsconfig"`
- [ ] **Step 6**: Check outdated deps: `Select-String "over.*months old|update"`
- [ ] **Step 7**: Only if no warnings found, check the test failure itself

> **Read [references/ci-workflow-patterns.md](references/ci-workflow-patterns.md)** for the workflow architecture map, composite action error signatures (setup, detect-changes, quality-gates, build-validation, e2e-testing, terraform), deployment pipeline patterns, and concurrency/cancellation behaviors.

> **Read [references/diagnostic-scripts.md](references/diagnostic-scripts.md)** for the comprehensive one-liner that classifies all failure types at once.

## Quick Reference Table

| Task                   | Command                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| View failed logs       | `gh run view RUN_ID --log-failed`                                             |
| View all logs          | `gh run view RUN_ID --log`                                                    |
| List recent runs       | `gh run list --branch BRANCH --limit 5`                                       |
| Open in browser        | `gh run view RUN_ID --web`                                                    |
| **Find root cause**    | `gh run view RUN_ID --log-failed \| Select-String -Context 20 "❌"`           |
| Find module errors     | `gh run view RUN_ID --log \| Select-String "Failed to load"`                  |
| Find Node warnings     | `gh run view RUN_ID --log \| Select-String "\(node:.*Warning"`                |
| Find config issues     | `gh run view RUN_ID --log \| Select-String "jest\.config\|package\.json"`     |
| Find test failures     | `gh run view RUN_ID --log \| Select-String "FAIL"`                            |
| Find type errors       | `gh run view RUN_ID --log \| Select-String "error TS"`                        |
| Find failed tasks      | `gh run view RUN_ID --log \| Select-String "Failed tasks"`                    |
| Find setup errors      | `gh run view RUN_ID --log \| Select-String "Nx CLI not available"`            |
| Find Terraform locks   | `gh run view RUN_ID --log \| Select-String "state lock"`                      |
| Find E2E server issues | `gh run view RUN_ID --log \| Select-String "server.*fail\|server.*died"`      |
| List CI pipeline runs  | `gh run list --workflow ci-orchestrator.yml --limit 5`                        |
| List deploy runs       | `gh run list --workflow deploy-web.yml --limit 5`                             |
| List lambda uploads    | `gh run list --workflow upload-lambdas.yml --limit 5`                         |
| List terraform runs    | `gh run list --workflow lambda-terraform-apply.yml --limit 5`                 |
| List merge queue runs  | `gh run list --workflow merge-queue.yml --limit 5`                            |
| Check run conclusion   | `gh run view RUN_ID --json conclusion --jq '.conclusion'`                     |
| List jobs in run       | `gh run view RUN_ID --json jobs --jq '.jobs[] \| "\(.name): \(.conclusion)"'` |
| Save logs to file      | `gh run view RUN_ID --log > logs.txt`                                         |
| Check PR status        | `gh pr checks`                                                                |
| Rerun failed jobs      | `gh run rerun RUN_ID --failed`                                                |

---

**� Golden Rule: NEVER attempt a fix until you can cite the exact error from the logs.** Saying "lint failed" is not enough — you need `src/App.tsx:17:3 error @typescript-eslint/no-floating-promises`. Saying "tests failed" is not enough — you need the assertion error OR a Node warning that caused the test runner to crash.

**💡 Pro Tip**: When analyzing logs, test failures (FAIL) are often symptoms. Always look 10-20 lines BEFORE the failure for Node.js warnings, module loading errors, or configuration issues. These are your root causes.

**🎯 Real Example — symptom vs root cause:**

```powershell
# ❌ WRONG: Seeing this and trying to fix the test code
FAIL shared-components:web lib/shared-components/src/features/players/PlayerStatsDataGrid.test.tsx

# ✅ RIGHT: Reading 20 lines ABOVE the FAIL and finding this (the actual problem):
(node:3665) Warning: Failed to load the ES module: jest.config.web.ts
Make sure to set "type": "module" in the nearest package.json
```

The test failed because jest couldn't load its config, not because the test code was wrong. Fix the config issue first.

**🎯 Real Example — extracting actionable evidence:**

```powershell
# ❌ INSUFFICIENT: "TypeScript check failed"
# ✅ SUFFICIENT: You searched and found this exact line:
lib/scoring/src/calculateScore.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

# Now you know: open lib/scoring/src/calculateScore.ts, go to line 42, fix the type mismatch.
```
