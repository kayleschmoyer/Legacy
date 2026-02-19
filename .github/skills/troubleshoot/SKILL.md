---
name: troubleshoot
description: 'Quick-reference fixes for common dev environment issues: module not found errors, database connectivity, port conflicts, Nx cache corruption, and AWS auth failures.'
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
3. For other errors: see [fix-types.md](fix-types.md)

### Linting Errors

1. `pnpm exec nx affected -t lint --fix` — auto-fixes ~80%
2. For remaining errors: see [fix-lint.md](fix-lint.md)

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
# View CI logs
gh run list --branch <branch> --limit 5
gh run view <run-id> --log-failed

# Re-run failed jobs
gh run rerun <run-id> --failed
```

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

| Problem                | Fix                                |
| ---------------------- | ---------------------------------- |
| `acli not found`       | Refresh PATH (see above)           |
| Module not found       | `pnpm run build:libs`              |
| Type errors            | See [fix-types.md](fix-types.md)   |
| DB connection fails    | `pnpm run sync-env`                |
| Port in use            | `pnpm dlx kill-port 3000`          |
| Nx cache issues        | `pnpm exec nx reset`               |
| AWS CLI encoding error | `$env:PYTHONIOENCODING = "utf-8"`  |
| Terraform state locked | `node scripts/terraform-unlock.js` |

## Related Skills

- [fix-types.md](fix-types.md) — TypeScript error fixes
- [fix-lint.md](fix-lint.md) — ESLint error fixes
- [nx-reset.md](nx-reset.md) — Nx cache reset
- [sync-env.md](sync-env.md) — Environment sync
- [aws-sso-login.md](aws-sso-login.md) — AWS authentication
