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

### 🚨 Critical: Finding Root Causes

**Most failures show symptoms (test failures) but the ROOT CAUSE appears earlier in the log.**

Always look for:

1. **Warnings BEFORE the failure** - Node.js warnings, module loading errors
2. **Configuration errors** - jest.config, tsconfig, package.json issues
3. **Dependency problems** - Outdated packages, missing modules
4. **Exit codes** - Process crashes that cascade to test failures

**Example workflow:**

```powershell
# Find the failed task
gh run view RUN_ID --log-failed | Select-String "Failed tasks:"

# Get context BEFORE and AFTER the failure (20 lines each)
gh run view RUN_ID --log-failed | Select-String -Context 20 "❌ > nx run"

# Look for warnings in the context
gh run view RUN_ID --log-failed | Select-String "Warning:|Error:|Failed to load"
```

### 1. Module Loading Errors (Root Cause)

**Pattern:**

```
(node:3665) Warning: Failed to load the ES module: /path/to/jest.config.web.ts
Make sure to set "type": "module" in the nearest package.json
```

**How to find:**

```powershell
# Find module loading failures
gh run view RUN_ID --log-failed | Select-String "Failed to load.*module"

# Find ES module errors
gh run view RUN_ID --log-failed | Select-String "ES module" -Context 3

# Find jest config issues
gh run view RUN_ID --log-failed | Select-String "jest.config" -Context 5

# Find node warnings (often the root cause)
gh run view RUN_ID --log-failed | Select-String "\(node:\d+\) Warning" -Context 10
```

**Why this matters:** Module loading errors cause test runners to fail, which then shows as "FAIL" in logs. The test failure is the symptom, not the cause.

### 2. Test Failures (Often a Symptom)

**Pattern:**

```
FAIL   project-name  path/to/test.spec.ts
  ● Test Suite Name › Test Name
    Error: expect(received).toBe(expected)
```

**How to find:**

```powershell
# Search logs for test failures
gh run view RUN_ID --log | Select-String "FAIL.*spec\.ts"

# Get CONTEXT before the failure (may show root cause)
gh run view RUN_ID --log | Select-String -Context 20,5 "FAIL.*shared-components"

# Extract test error context
gh run view RUN_ID --log | Select-String -Context 5 "Error: expect"
```

**⚠️ Important:** If you see a test failure, ALWAYS look at the 10-20 lines BEFORE it for warnings or configuration errors.

### 3. Configuration Errors (Root Cause)

**Pattern:**

```
Error: Cannot find module '@project/package'
package.json is missing "type": "module"
tsconfig.json: Cannot find name 'X'
```

**How to find:**

```powershell
# Find configuration file errors
gh run view RUN_ID --log-failed | Select-String "package\.json|tsconfig|jest\.config" -Context 5

# Find missing module errors
gh run view RUN_ID --log-failed | Select-String "Cannot find module" -Context 3

# Find type: module issues
gh run view RUN_ID --log-failed | Select-String "type.*module" -Context 5
```

### 4. Outdated Dependencies (Root Cause)

**Pattern:**

```
[baseline-browser-mapping] The data in this module is over two months old.
To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
```

**How to find:**

```powershell
# Find outdated package warnings
gh run view RUN_ID --log-failed | Select-String "over.*months old|please update|npm i.*latest"

# Find all npm/pnpm warnings
gh run view RUN_ID --log-failed | Select-String "\[.*\].*update|deprecated" -Context 3
```

### 5. Type Errors

**Pattern:**

```
error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
```

**How to find:**

```powershell
# Find TypeScript errors
gh run view RUN_ID --log | Select-String "error TS\d+"

# Get file and line number
gh run view RUN_ID --log | Select-String "\.ts\(\d+,\d+\): error"
```

### 6. Lint Failures

**Pattern:**

```
✖ 10 problems (5 errors, 5 warnings)
/path/to/file.ts
  123:4  error  'variable' is assigned a value but never used
```

**How to find:**

```powershell
# Find lint errors
gh run view RUN_ID --log | Select-String "error  "

# Find specific file with errors
gh run view RUN_ID --log | Select-String "db-client.*\.ts"
```

### 7. Build Failures

**Pattern:**

```
NX   Running target build for X projects failed
Failed tasks:
- project-name:build
```

**How to find:**

```powershell
# Find build failures
gh run view RUN_ID --log | Select-String "Failed tasks:"

# Find which projects failed
gh run view RUN_ID --log | Select-String -Context 10 "Running target .* failed"
```

### 8. React/Component Warnings

**Pattern:**

```
console.error
  React does not recognize the `propName` prop on a DOM element
```

**How to find:**

```powershell
# Find React warnings
gh run view RUN_ID --log | Select-String "React does not recognize"

# Find component issues
gh run view RUN_ID --log | Select-String "console\.(error|warn)"
```

### 9. Process Exit Errors

**Pattern:**

```
##[error]Process completed with exit code 130.
```

**How to find:**

```powershell
# Find exit code errors
gh run view RUN_ID --log | Select-String "exit code \d+"

# Context around the error
gh run view RUN_ID --log | Select-String -Context 20 "exit code"
```

## Advanced Log Analysis

### Extract Test Summary

```powershell
# Find test results
gh run view RUN_ID --log | Select-String "Test Suites:.*total"
gh run view RUN_ID --log | Select-String "Tests:.*total"
gh run view RUN_ID --log | Select-String "Snapshots:.*total"

# Example output:
# Test Suites: 5 passed, 5 total
# Tests:       26 passed, 26 total
```

### Extract Failed Steps

```powershell
# Get all failed step names
gh run view RUN_ID --log | Select-String "Failed tasks:" -Context 5

# Example from logs:
# Failed tasks:
# - shared-components:test:web
```

### Extract Performance Metrics

```powershell
# Find duration information
gh run view RUN_ID --log | Select-String "Duration:.*s"
gh run view RUN_ID --log | Select-String "Time:.*s$"

# Find Nx task execution times
gh run view RUN_ID --log | Select-String "Nx.*completed in.*s"
```

### Extract Build Warnings

```powershell
# Find non-null assertion warnings
gh run view RUN_ID --log | Select-String "warning.*Forbidden non-null assertion"

# Find specific warning counts
gh run view RUN_ID --log | Select-String "✖ \d+ problems"
```

## Filtering and Parsing

### Save Logs to File

```powershell
# Save full logs
gh run view RUN_ID --log > ci-logs.txt

# Save only failed logs
gh run view RUN_ID --log-failed > failed-logs.txt

# Save specific job logs
gh run view RUN_ID --job JOB_ID --log > job-logs.txt
```

### Parse with PowerShell

```powershell
# Count occurrences of a pattern
(gh run view RUN_ID --log | Select-String "error").Count

# Extract unique error messages
gh run view RUN_ID --log | Select-String "error TS\d+:" |
  Select-Object -Unique

# Get files with lint errors
gh run view RUN_ID --log | Select-String "\.ts$" -Context 0,3 |
  Where-Object { $_.Line -match "error" }
```

### Group Related Errors

```powershell
# Group errors by file
$logs = gh run view RUN_ID --log
$errors = $logs | Select-String "error"
$errors | Group-Object { $_.Line -replace '.*?([^/]+\.ts).*', '$1' }
```

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

### Common Troubleshooting Workflow

```powershell
# Step 1: Identify the failed run
$runId = (gh run list --branch $(git branch --show-current) --limit 1 --json databaseId --jq '.[0].databaseId')

# Step 2: Find the failed task(s)
gh run view $runId --log-failed | Select-String "Failed tasks:"

# Step 3: Find the ROOT CAUSE - Get context BEFORE the failure
gh run view $runId --log-failed | Select-String -Context 20,5 "❌ > nx run"

# Step 4: Look for warnings that caused the failure
gh run view $runId --log-failed | Select-String "Warning:|Failed to load|Cannot find"

# Step 5: Check if it's a known issue type
$errorTypes = @(
  "Failed to load",     # Module loading errors (ROOT CAUSE)
  "Cannot find module", # Missing dependencies (ROOT CAUSE)
  "\(node:\d+\) Warning", # Node.js warnings (ROOT CAUSE)
  "over.*months old",   # Outdated packages (ROOT CAUSE)
  "error TS",           # TypeScript errors
  "FAIL.*spec",         # Test failures (SYMPTOM)
  "React does not",     # React warnings
  "exit code",          # Process crashes
  "Failed tasks"        # Nx task failures
)

foreach ($pattern in $errorTypes) {
  $matches = gh run view $runId --log-failed | Select-String $pattern
  if ($matches) {
    Write-Host "Found: $pattern - Count: $($matches.Count)"
  }
}
```

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

1. **🚨 FIND THE ROOT CAUSE**: Test failures are symptoms - look for warnings/errors BEFORE the failure
2. **Start with failed logs**: Use `--log-failed` first
3. **Get context**: Always use `-Context 20` to see what happened before the error
4. **Look for Node warnings**: `(node:XXXX) Warning` often indicates the root problem
5. **Check configuration**: Module loading, package.json, jest.config errors are common culprits
6. **Work backwards**: Start from the ❌ failed step and read upward
7. **Search strategically**: Use key patterns (Failed to load, Warning, Cannot find)
8. **Save for analysis**: Save logs to file for complex debugging
9. **Check timestamps**: Helps identify timeouts or hanging processes
10. **Compare runs**: Compare current logs with previous successful runs

## Integration with Workflow

### After Creating PR

```powershell
# 1. Wait for CI to complete
gh pr checks

# 2. If failed, view logs
gh run view --log-failed

# 3. Fix issues based on logs
# ... make changes ...

# 4. Push and re-check
git push
gh pr checks
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
- [Create PR](create-pr.md) - PR creation after CI passes
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

## Quick Reference Table

| Task                | Command                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| View failed logs    | `gh run view RUN_ID --log-failed`                                         |
| View all logs       | `gh run view RUN_ID --log`                                                |
| List recent runs    | `gh run list --branch BRANCH --limit 5`                                   |
| Open in browser     | `gh run view RUN_ID --web`                                                |
| **Find root cause** | `gh run view RUN_ID --log-failed \| Select-String -Context 20 "❌"`       |
| Find module errors  | `gh run view RUN_ID --log \| Select-String "Failed to load"`              |
| Find Node warnings  | `gh run view RUN_ID --log \| Select-String "\(node:.*Warning"`            |
| Find config issues  | `gh run view RUN_ID --log \| Select-String "jest\.config\|package\.json"` |
| Find test failures  | `gh run view RUN_ID --log \| Select-String "FAIL"`                        |
| Find type errors    | `gh run view RUN_ID --log \| Select-String "error TS"`                    |
| Find failed tasks   | `gh run view RUN_ID --log \| Select-String "Failed tasks"`                |
| Save logs to file   | `gh run view RUN_ID --log > logs.txt`                                     |
| Check PR status     | `gh pr checks`                                                            |
| Rerun failed jobs   | `gh run rerun RUN_ID --failed`                                            |

---

**💡 Pro Tip**: When analyzing logs, test failures (FAIL) are often symptoms. Always look 10-20 lines BEFORE the failure for Node.js warnings, module loading errors, or configuration issues. These are your root causes.

**🎯 Real Example:**

```powershell
# Don't just look at this:
FAIL shared-components:web lib/shared-components/src/features/players/PlayerStatsDataGrid.test.tsx

# Look at what came BEFORE it (the actual problem):
(node:3665) Warning: Failed to load the ES module: jest.config.web.ts
Make sure to set "type": "module" in the nearest package.json
```

The test failed because jest couldn't load its config, not because the test code was wrong.
