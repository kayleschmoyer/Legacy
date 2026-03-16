# Log Analysis & Filtering Commands

PowerShell commands for extracting test summaries, performance metrics, and grouping errors.

## Extract Test Summary

```powershell
# Find test results
gh run view RUN_ID --log | Select-String "Test Suites:.*total"
gh run view RUN_ID --log | Select-String "Tests:.*total"
gh run view RUN_ID --log | Select-String "Snapshots:.*total"

# Example output:
# Test Suites: 5 passed, 5 total
# Tests:       26 passed, 26 total
```

## Extract Failed Steps

```powershell
# Get all failed step names
gh run view RUN_ID --log | Select-String "Failed tasks:" -Context 5

# Example from logs:
# Failed tasks:
# - shared-components:test:web
```

## Extract Performance Metrics

```powershell
# Find duration information
gh run view RUN_ID --log | Select-String "Duration:.*s"
gh run view RUN_ID --log | Select-String "Time:.*s$"

# Find Nx task execution times
gh run view RUN_ID --log | Select-String "Nx.*completed in.*s"
```

## Extract Build Warnings

```powershell
# Find non-null assertion warnings
gh run view RUN_ID --log | Select-String "warning.*Forbidden non-null assertion"

# Find specific warning counts
gh run view RUN_ID --log | Select-String "✖ \d+ problems"
```

## Save Logs to File

```powershell
# Save full logs
gh run view RUN_ID --log > ci-logs.txt

# Save only failed logs
gh run view RUN_ID --log-failed > failed-logs.txt

# Save specific job logs
gh run view RUN_ID --job JOB_ID --log > job-logs.txt
```

## Parse with PowerShell

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

## Group Related Errors

```powershell
# Group errors by file
$logs = gh run view RUN_ID --log
$errors = $logs | Select-String "error"
$errors | Group-Object { $_.Line -replace '.*?([^/]+\.ts).*', '$1' }
```
