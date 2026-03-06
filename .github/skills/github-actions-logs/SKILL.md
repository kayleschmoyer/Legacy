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

# Lambda upload runs
gh run list --workflow upload-gql.yml --limit 5
gh run list --workflow upload-draft-processor.yml --limit 5
gh run list --workflow upload-game-selection.yml --limit 5
gh run list --workflow upload-oauth-proxy.yml --limit 5
gh run list --workflow upload-stats-lambda.yml --limit 5
gh run list --workflow upload-websocket.yml --limit 5

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

# Step 5: Extract the EXACT error (file, line, message)
# Pick the right command based on what step 2 found:
gh run view $runId --log-failed | Select-String "\d+:\d+\s+error" -Context 1        # lint
gh run view $runId --log-failed | Select-String "\.ts\(\d+,\d+\): error" -Context 1  # typecheck
gh run view $runId --log-failed | Select-String "Expected:|Received:" -Context 3      # test
gh run view $runId --log-failed | Select-String "Module not found|Cannot find" -Context 3  # build

# Step 6: If nothing matched, use the annotation format
gh run view $runId --log | Select-String "##\[error\]" -Context 5

# Step 7: Classify the failure type
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
    # Print the first 3 matches so you can see the actual errors
    $matches | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" }
  }
}

# ⚠️ DO NOT attempt a fix until you can state the exact error.
# If all searches return nothing, save to file and read manually:
# gh run view $runId --log > ci-full.txt ; code ci-full.txt
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

## Workflow Architecture Map

Understanding which workflow generates which logs is critical for targeted debugging.

```
ci-orchestrator.yml  ← entry point for PRs / pushes / merge_group
├── ci-pipeline.yml  ← reusable workflow (main CI)
│   ├── detect-dte            (Job: detect-dte)
│   ├── detect-changes        (Job: detect-changes)
│   ├── agents [1..3]         (Job: agents)
│   ├── quality-gates         (Job: quality-gates)
│   ├── build-validation      (Job: build-validation)
│   ├── e2e                   (Job: e2e)
│   └── summarize             (Job: summarize)
├── security-scanning.yml     (conditional)
└── test-android-compatibility.yml (conditional)

deploy-web.yml       ← triggered on push to main (web paths)
├── setup
├── build-and-deploy
└── create-release

upload-*.yml         ← triggered on push to main (lambda paths)
└── upload           ← build + package + S3 upload

lambda-terraform-apply.yml  ← triggered by upload workflow completion
└── deploy           ← terraform init → plan → apply

merge-queue.yml      ← triggered by CI orchestrator completion + label events
└── process-queue    ← validate + squash-merge PRs

merge-queue-management.yml  ← triggered by label/review events
└── manage           ← UX comments on PR
```

### Identifying Which Workflow Failed

```powershell
# Most recent failed run across all workflows
gh run list --status failure --limit 5

# Check which workflow the run belongs to
gh run view RUN_ID --json workflowName --jq '.workflowName'

# List jobs within the run
gh run view RUN_ID --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'
```

## Composite Action Error Signatures

Each composite action in `.github/actions/` produces distinctive error patterns. Use these signatures to quickly locate the failing action.

### Setup Action (`.github/actions/setup`)

```powershell
# Dependency installation failures
gh run view RUN_ID --log-failed | Select-String "pnpm-lock.*not found|node_modules.*not found after installation" -Context 3

# Nx workspace detection failures (tries 5 methods)
gh run view RUN_ID --log-failed | Select-String "Nx CLI not available|Nx not accessible|nx binary.*not functional" -Context 5

# Cache corruption recovery
gh run view RUN_ID --log-failed | Select-String "workspace.*not accessible after cleanup|recovery attempt" -Context 5
```

### Detect Changes Action (`.github/actions/detect-changes`)

```powershell
# Base ref resolution failures (falls back through multiple strategies)
gh run view RUN_ID --log | Select-String "Warning.*BASE_REF.*not found|using empty tree as fallback" -Context 3

# Check what changes were detected
gh run view RUN_ID --log | Select-String "affected-components|requires-full-build" -Context 2
```

### Quality Gates Action (`.github/actions/quality-gates`)

```powershell
# Pre-flight check failures (before quality checks even start)
gh run view RUN_ID --log-failed | Select-String "Dependencies not installed|Nx not found|Not in Nx workspace" -Context 3

# Individual gate failures
gh run view RUN_ID --log-failed | Select-String "formatting issues detected|ESLint.*failed|typecheck.*failed" -Context 5

# DTE quota exceeded mid-run (falls back to local)
gh run view RUN_ID --log | Select-String "quota|limit|exceeded|insufficient|disabled|401|minimum.*agent" -Context 5

# Which projects failed which gate
gh run view RUN_ID --log | Select-String "failed-projects" -Context 2
```

### Build Validation Action (`.github/actions/build-validation`)

```powershell
# Per-component build failures
gh run view RUN_ID --log-failed | Select-String "Web.*build failed|Lambda.*build failed|Mobile.*failed" -Context 10

# Build output verification failures
gh run view RUN_ID --log-failed | Select-String "Build output directory not found|artifacts missing" -Context 3

# DTE fallback during build (disables cloud, retries locally)
gh run view RUN_ID --log | Select-String "NX_NO_CLOUD|skip-nx-cache" -Context 3
```

### E2E Testing Action (`.github/actions/e2e-testing`)

```powershell
# Dev server lifecycle issues
gh run view RUN_ID --log-failed | Select-String "server.*died|server failed to start|server.*crashed" -Context 10

# Artifact download issues (continue-on-error means silent failures)
gh run view RUN_ID --log | Select-String "download-artifact|Unable to find.*artifact|Artifact not found" -Context 3

# Playwright browser issues
gh run view RUN_ID --log-failed | Select-String "browser installation failed|chromium.*error" -Context 5

# E2E result classification
gh run view RUN_ID --log | Select-String "result=server-failure|result=build-failure|result=failure" -Context 2
```

### Terraform / Lambda Deployment Actions

```powershell
# Terraform state lock conflicts
gh run view RUN_ID --log-failed | Select-String "state lock|Lock Info|force-unlock" -Context 10

# SSM parameter failures (version tracking)
gh run view RUN_ID --log-failed | Select-String "SSM.*parameter|ParameterNotFound" -Context 3

# S3 upload failures
gh run view RUN_ID --log-failed | Select-String "S3.*upload|S3.*error|PutObject" -Context 5

# Terraform plan/apply failures
gh run view RUN_ID --log-failed | Select-String "terraform.*failed|Error:.*terraform" -Context 10
```

## Deployment Pipeline Log Patterns

### Web Deployment (deploy-web.yml)

```powershell
# Find the deploy run
$runId = (gh run list --workflow deploy-web.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# Build failures (Vite/Nx)
gh run view $runId --log-failed | Select-String "BUILD FAILED|Module not found|vite.*error" -Context 5

# Missing environment variables
gh run view $runId --log-failed | Select-String "VITE_.*undefined|VITE_.*missing" -Context 3

# Sentry sourcemap upload failures
gh run view $runId --log-failed | Select-String "sentry.*error|sourcemap.*failed" -Context 5

# GitHub Pages deployment failures
gh run view $runId --log-failed | Select-String "Pages.*error|deploy.*failed|CNAME" -Context 5

# DTE fallback during web build
gh run view $runId --log | Select-String "DTE.*fail|NX_CLOUD_NO_TIMEOUTS|NX_NO_CLOUD" -Context 3
```

### Lambda Upload (upload-\*.yml)

```powershell
# Find lambda upload runs
$runId = (gh run list --workflow upload-gql.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# Build failures
gh run view $runId --log-failed | Select-String "Lambda build failed|build failed" -Context 10

# Packaging failures (missing dist output)
gh run view $runId --log-failed | Select-String "artifacts missing|dist.*not found" -Context 5

# AWS credential issues
gh run view $runId --log-failed | Select-String "credentials|AssumeRole|AccessDenied" -Context 5

# S3 upload issues
gh run view $runId --log-failed | Select-String "S3.*error|upload.*failed" -Context 5
```

### Lambda Terraform Apply (lambda-terraform-apply.yml)

```powershell
# Find terraform runs (triggered by upload workflow completion)
$runId = (gh run list --workflow lambda-terraform-apply.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# Batching: check if this run was cancelled by a newer one (expected behavior)
gh run view $runId --json conclusion --jq '.conclusion'

# Secret validation failures
gh run view $runId --log-failed | Select-String "required secret.*not configured|missing.*secret" -Context 3

# State lock issues
gh run view $runId --log-failed | Select-String "state lock|DynamoDB|Lock Info" -Context 10

# Plan/apply errors
gh run view $runId --log-failed | Select-String "Error:.*terraform|terraform.*failed" -Context 10

# Deployment verification
gh run view $runId --log | Select-String "Lambda.*function|deployment.*verified|ListFunctions" -Context 3
```

## Concurrency and Cancellation Patterns

The CI system uses concurrency groups to manage parallel runs:

| Workflow               | Concurrency Key                   | Cancel In-Progress             |
| ---------------------- | --------------------------------- | ------------------------------ |
| ci-orchestrator        | `orchestrator-{PR# or ref}`       | **Yes** — new push cancels old |
| deploy-web             | `{workflow}-{ref}`                | **Yes**                        |
| lambda-terraform-apply | `terraform-lambda-infrastructure` | **Yes** — batches deployments  |
| merge-queue            | `merge-queue`                     | **No** — serialized processing |

### Identifying Cancellation vs Failure

```powershell
# Check if the run was cancelled (not failed)
gh run view RUN_ID --json conclusion --jq '.conclusion'
# "cancelled" = intentionally stopped by concurrency
# "failure" = actual error

# Find what cancelled it (look for a newer run on same ref)
gh run list --branch (git branch --show-current) --limit 5 --json databaseId,conclusion,createdAt --jq '.[] | "\(.databaseId) \(.conclusion) \(.createdAt)"'
```

## Comprehensive One-Liner Diagnostics

```powershell
# === Quick: classify all failure types ===
$runId = (gh run list --branch (git branch --show-current) --limit 1 --json databaseId --jq '.[0].databaseId')
$logs = gh run view $runId --log-failed

@{
  "🔧 Setup"        = "Nx CLI not available|node_modules.*not found|workspace.*invalid"
  "📦 Modules"      = "Failed to load|Cannot find module|\(node:\d+\) Warning"
  "🎨 Format"       = "format:check.*failed|Formatting.*failed|formatting issues"
  "🔍 Lint"         = "error  .*@typescript-eslint|✖ \d+ problems|ESLint.*failed"
  "📝 TypeScript"   = "error TS\d+"
  "🧪 Tests"        = "FAIL.*spec\.ts|Test Suites:.*failed"
  "🏗️ Build"         = "Running target.*failed|Failed tasks:|build failed"
  "🌐 E2E"          = "server.*fail|server.*died|playwright.*error"
  "☁️ DTE"           = "quota|DTE.*fail|Nx Cloud.*fail|401.*Cloud"
  "📚 Skills"       = "skill.*failed validation"
  "🔒 Terraform"    = "state lock|Lock Info|terraform.*failed"
  "⏹️ Cancelled"     = "operation was canceled|more recent commit"
  "🔐 Permissions"  = "not accessible by integration|403"
}.GetEnumerator() | ForEach-Object {
  $hits = $logs | Select-String $_.Value
  if ($hits) { Write-Host "$($_.Key) — $($hits.Count) hit(s)" -ForegroundColor Red }
}
```

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
| Find DTE issues        | `gh run view RUN_ID --log \| Select-String "quota\|DTE.*fail"`                |
| Find Terraform locks   | `gh run view RUN_ID --log \| Select-String "state lock"`                      |
| Find E2E server issues | `gh run view RUN_ID --log \| Select-String "server.*fail\|server.*died"`      |
| List CI pipeline runs  | `gh run list --workflow ci-orchestrator.yml --limit 5`                        |
| List deploy runs       | `gh run list --workflow deploy-web.yml --limit 5`                             |
| List lambda uploads    | `gh run list --workflow upload-gql.yml --limit 5`                             |
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
