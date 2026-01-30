# Task: Troubleshooting

## Quick Fixes

### Module Not Found

```powershell
pnpm run build:libs
```

### Environment Issues

```powershell
pnpm run sync-env
```

### Port Conflicts

```powershell
pnpm dlx kill-port 3000
pnpm dlx kill-port 4000
```

### Nx Cache Issues

```powershell
pnpm exec nx reset
```

### Complete Reset (Nuclear Option)

```powershell
rm -rf node_modules
pnpm install
pnpm run build:libs
```

## By Error Type

### TypeScript Errors

1. Check error message carefully
2. Run `pnpm run build:libs` (most common fix)
3. If generated types: Run codegen
4. If still failing: See `fix-types.md`

### Linting Errors

1. Run `pnpm exec nx affected -t lint --fix`
2. Review remaining errors
3. Fix manually (see `fix-lint.md`)

### Test Failures

1. Read test failure message
2. If snapshots: `pnpm exec nx test <project> --updateSnapshot`
3. If DB connection: `pnpm run sync-env`
4. Update tests if implementation changed intentionally

### Build Failures

1. Ensure dependencies installed: `pnpm install`
2. Build libs first: `pnpm run build:libs`
3. Check for circular dependencies: `pnpm exec nx graph`

### Git/Branch Issues

```powershell
# Refresh PATH for acli/twig
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# View branch tree
twig tree

# Fix branch issues
git status
git branch
```

## Database Issues

```powershell
# Test connection
pnpm run db:test

# Sync credentials
pnpm run sync-env

# Check credentials
pnpm run db:credentials
```

## CI Failures

```powershell
# View CI logs
gh run list --branch <branch> --limit 5
gh run view <run-id> --log-failed

# Re-run failed jobs
gh run rerun <run-id> --failed
```

## When All Else Fails

1. Check `docs/guides/troubleshooting.md` for detailed solutions
2. Search error message in existing issues
3. Create minimal reproduction case
4. Document: OS, Node version, error message, steps to reproduce
