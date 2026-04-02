---
name: troubleshoot
description: 'Fix common dev environment and production problems: module-not-found errors, DB connectivity, port conflicts, Nx cache corruption, EPERM file locks, AWS auth failures, Terraform state locks, and Rollbar noise. Use when the dev environment breaks, CI shows environment-related errors, or production error reporting is degraded.'
---

# Skill: Troubleshooting

## Overview

Quick-reference fixes for common development environment issues in the Legacy Sports monorepo.

## Common Fixes by Symptom

### Module Not Found

```powershell
# Build library dependencies first
pnpm run build:libs
```

### DB Connection Fails / Credentials Stale

```powershell
pnpm run sync-env
```

### Port Already in Use

```powershell
pnpm dlx kill-port 3000
pnpm dlx kill-port 4000
```

### Nx Cache Issues (Unexpected Build Results)

```powershell
pnpm exec nx reset
```

### AWS CLI Encoding Errors (Unicode/emoji)

```powershell
$env:PYTHONIOENCODING = "utf-8"
$env:AWS_PAGER = ""
```

### `acli` or `twig` Not Found

```powershell
# Refresh PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### EPERM / Native Addon File Lock (`bufferutil.node`)

Symptom: `ERR_PNPM_EPERM ... unlink ... node_modules\bufferutil\...\bufferutil.node` during `make install` or `make clean`.

A background node process (usually the VS Code Playwright extension's `test-server` or a manually started dev server) is holding a native `.node` addon open.

```powershell
# Identify the lock-holding process (preview without killing)
make kill-stale DRYRUN=1

# Kill stale node processes holding native addon locks
make kill-stale

# Then retry
make clean install
```

If `make kill-stale` reports no processes but the error persists, a non-node process may hold the lock. Use Process Explorer or `handle.exe` from Sysinternals to find it.

### Terraform State Locked

```powershell
node scripts/terraform-unlock.js
```

### Complete Reset (Nuclear Option)

```powershell
Remove-Item -Recurse -Force node_modules
pnpm install
pnpm run build:libs
```

---

## By Error Type

### TypeScript Errors

1. Run `pnpm run build:libs` — resolves most "module not found" type errors
2. If generated types are stale: `pnpm exec nx run <project>:codegen`
3. For other errors: see [fix-types.md](../../repo-tooling/SKILL.md)

### Linting Errors

1. `pnpm exec nx affected -t lint --fix` — auto-fixes ~80%
2. For remaining errors: see [fix-lint.md](../../repo-tooling/SKILL.md)

### Test Failures

1. Read the failure message carefully
2. Snapshot mismatch: `pnpm exec nx test <project> --updateSnapshot`
3. DB connection issue: `pnpm run sync-env`
4. If implementation changed intentionally, update the test

### Build Failures

1. Ensure dependencies installed: `pnpm install`
2. Build libs first: `pnpm run build:libs`
3. Check for circular dependencies: `pnpm exec nx graph`

### Database Issues

```powershell
# Test connection
pnpm run db:test

# Sync credentials
pnpm run sync-env

# Check credentials
pnpm run db:credentials
```

### CI Failures

```powershell
# Always verify locally first (preferred over waiting on GitHub CI)
make pc
```

If a remote-only failure occurs, view CI logs:

**MCP (preferred):**

```
# List recent runs on the branch
ci_list_runs(branch: "BRANCH_NAME", limit: 5)

# Fetch failed logs
ci_get_logs(runId: RUN_ID, failedOnly: true)

# Re-run failed jobs (only for flaky / transient failures)
ci_rerun(runId: RUN_ID, onlyFailedJobs: true)
```

**Shell fallback:**

```powershell
gh run list --branch <branch> --limit 5
gh run view <run-id> --log-failed

# Re-run failed jobs (only for flaky / transient failures)
gh run rerun <run-id> --failed
```

### Production Client Errors (Rollbar)

When investigating browser console errors from production:

1. **Check Rollbar rate limits first** — `maxItems` (50/session) and `itemsPerMinute` (25) in `lib/rollbar/src/lib/rollbar.web.ts`. Noisy browser warnings from third-party scripts (e.g. Google Identity Services COOP warnings) can exhaust these limits and **silently drop real errors**.
2. **Check `checkIgnore` filter** — if a new class of browser noise appears, add it to the `checkIgnore` callback in `rollbar.web.ts`. Existing filters: AbortError, Failed to fetch, WebSocket error/closed, ResizeObserver loop. (COOP/COEP warnings are **not** filtered today — if they become noisy, add a filter.)
3. **Rollbar 429 = symptom, not cause** — a `POST api.rollbar.com 429` means the Rollbar API is rejecting requests due to server-side rate limiting (account plan limits). This is distinct from the client-side `maxItems`/`itemsPerMinute` caps. Find what's flooding Rollbar before assuming a transient service issue.
4. **Third-party script errors are not actionable** — errors from Google's GIS `client` script, browser extensions, or ad blockers should be filtered, not fixed. Verify the error originates from our code before investigating.

### Git / Branch Issues

```powershell
# Check current state
git status
git branch

# View branch tree
twig tree

# Rebase dependent branches
make rebase-tree
```

---

## Quick Issue → Fix Lookup

| Problem                | Fix                                             |
| ---------------------- | ----------------------------------------------- |
| `acli not found`       | Refresh PATH (see above)                        |
| Module not found       | `pnpm run build:libs`                           |
| Type errors            | See [fix-types.md](../../repo-tooling/SKILL.md) |
| DB connection fails    | `pnpm run sync-env`                             |
| Port in use            | `pnpm dlx kill-port 3000`                       |
| Nx cache issues        | `pnpm exec nx reset`                            |
| AWS CLI encoding error | `$env:PYTHONIOENCODING = "utf-8"`               |
| Terraform state locked | `node scripts/terraform-unlock.js`              |
| Rollbar 429 / errors   | Check `checkIgnore` in `rollbar.web.ts`         |

## Related Skills

- [fix-types](../../repo-tooling/SKILL.md) — TypeScript error fixes
- [fix-lint](../../repo-tooling/SKILL.md) — ESLint error fixes
- [sync-env](../../sync-env/SKILL.md) — Environment sync
- [aws-sso-login](../../aws-sso-login/SKILL.md) — AWS authentication

## Nx Cache Reset (Detailed)

When `make reset` isn't enough:

### Level 1: Cache Only (Fastest)

```powershell
make reset                   # Clears .nx/cache/ and stops daemon
# or: pnpm exec nx reset
```

### Level 2: Full Clean (Slower)

```powershell
make clean:all               # Cache + node_modules
pnpm install
pnpm run build:libs
```

### Level 3: Nuclear (Slowest)

```powershell
Remove-Item -Recurse -Force node_modules, .nx, dist, coverage
pnpm install
pnpm run build:libs
pnpm run validate
```

### Daemon Won't Stop

```powershell
pnpm exec nx daemon --stop
Start-Sleep -Seconds 2
pnpm exec nx reset
```

**Don't overuse cache clearing!** Nx cache makes builds much faster. Only reset when actually needed.
