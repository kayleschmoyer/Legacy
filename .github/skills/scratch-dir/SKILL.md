---
name: scratch-dir
description: 'Use the scratch/ directory to store ad-hoc command output files (lint results, CI logs, Playwright output, debug dumps, SQL query results) without polluting git status. All files in scratch/ are gitignored except the .gitkeep placeholder. Load this skill when capturing command output to a file, piping results to a text file, or told to save output somewhere.'
---

# Skill: scratch/ Directory for Ad-hoc Output Files

## Overview

The repo has a `scratch/` directory at the root. Everything inside is gitignored (via `scratch/*` in `.gitignore`), so files saved there never appear as unstaged changes.

**Always redirect ad-hoc output files to `scratch/` instead of the repo root.**

## When to Use

- Piping command output to a file for inspection (`Tee-Object`, `Out-File`, `>`)
- Saving lint results, typecheck errors, or CI log dumps
- Capturing Playwright output, test results, or diff files
- Any temporary file you need during a debugging session

## Steps

### Redirect output to scratch/

Instead of writing to the repo root:

```powershell
# ❌ Don't do this — creates unstaged files at repo root
pnpm exec nx lint web 2>&1 | Tee-Object -FilePath "lint-output.txt"

# ✅ Do this instead
pnpm exec nx lint web 2>&1 | Tee-Object -FilePath "scratch/lint-output.txt"
```

### Common patterns

```powershell
# Jira attachment / screenshot download
acli jira workitem attachment list --key LS-1234 --json  # get attachment ID
# then download via REST API — see jira-ticket skill for full recipe
Invoke-WebRequest -Uri "https://bkrupa.atlassian.net/rest/api/3/attachment/content/<ID>" `
    -Headers @{ Authorization = "Basic $base64" } -OutFile "scratch/ls-1234-screenshot.png"

# Lint output
pnpm exec nx affected -t lint --skip-nx-cache 2>&1 | Tee-Object "scratch/lint.txt" | Select-String "error"

# TypeScript errors
pnpm exec nx affected -t typecheck --skip-nx-cache 2>&1 | Tee-Object "scratch/tc-errors.txt" | Select-String "error TS"

# CloudWatch / CI log dumps
Get-Content "scratch/ci-log.txt" | Select-Object -Last 100

# Playwright output
$env:E2E_AUTH_MODE = "ci"; pnpm exec nx e2e web-e2e 2>&1 | Tee-Object "scratch/pw-out.txt"
```

### Reading files back

```powershell
Get-Content "scratch/lint.txt" | Select-String "error" | Select-Object -First 50
```

## Notes

- `scratch/.gitkeep` is the only tracked file — it keeps the directory present in all worktrees after `make install`.
- Each worktree has its own `scratch/` directory, so files are isolated per branch.
- Files in `scratch/` are **not** cleaned up automatically — delete them when done.
