---
name: pnpm-lockfile-update
description: 'Update the pnpm lockfile (pnpm-lock.yaml) to sync with package.json changes, resolve dependency conflicts, or refresh versions after adding packages.'
---

# Skill: Updating pnpm Lockfile

## Overview

Update the pnpm lockfile (`pnpm-lock.yaml`) to sync with package.json changes, resolve dependency conflicts, or refresh dependency versions.

## When to Use

- After adding or removing dependencies in package.json
- When resolving dependency version conflicts
- After pulling changes that modified package.json
- When seeing "lockfile is out of date" warnings
- To refresh outdated dependencies
- When troubleshooting dependency-related issues

## Command

```powershell
pnpm install
```

## Alternative Commands

### Update all dependencies to latest versions

```powershell
# Update dependencies within semver ranges
pnpm update

# Update all dependencies to latest (including breaking changes)
pnpm update --latest
```

### Update specific package

```powershell
# Update a single package
pnpm update <package-name>

# Update package to specific version
pnpm add <package-name>@<version>
```

### Recreate lockfile from scratch

```powershell
# Delete lockfile and reinstall
Remove-Item pnpm-lock.yaml
pnpm install
```

### Install with frozen lockfile (CI mode)

```powershell
# Fail if lockfile doesn't match package.json
pnpm install --frozen-lockfile
```

## Expected Output

- **Success**: Updated pnpm-lock.yaml with new dependency resolutions
- **Console**: List of added, updated, or removed packages
- **Warnings**: Deprecated packages or peer dependency issues
- **Errors**: Version conflicts or network issues

## Common Issues

### Issue: "Lockfile is out of date"

**Solution**: Run `pnpm install` to update lockfile

### Issue: Dependency version conflicts

**Solution**:

```powershell
# Clear pnpm cache
pnpm store prune

# Remove node_modules and reinstall
Remove-Item -Recurse -Force node_modules
pnpm install
```

### Issue: Peer dependency warnings

**Solution**:

- Review warnings to ensure compatibility
- Use `--strict-peer-dependencies` flag to enforce peer deps
- Update packages to compatible versions

### Issue: Lockfile merge conflicts

**Solution**:

```powershell
# Accept their version and regenerate
git checkout --theirs pnpm-lock.yaml
pnpm install

# Or accept yours and regenerate
git checkout --ours pnpm-lock.yaml
pnpm install
```

### Issue: Network or registry errors

**Solution**:

```powershell
# Retry with verbose logging
pnpm install --loglevel debug

# Clear cache and retry
pnpm store prune
pnpm install
```

## Best Practices

1. **Always commit lockfile changes** - Ensures reproducible installs
2. **Run install after package.json changes** - Keep lockfile in sync
3. **Don't manually edit lockfile** - Let pnpm manage it automatically
4. **Use --frozen-lockfile in CI** - Prevent unexpected updates in pipelines
5. **Review lockfile diffs** - Check for unexpected version changes before committing

## Integration with Workflow

### Daily Development

```powershell
# Start of day - pull changes
git pull
pnpm install  # Update if package.json changed

# After adding a dependency
pnpm add <package-name>  # Automatically updates lockfile

# Before committing
git add pnpm-lock.yaml
git commit -m "chore(deps): update dependencies"
```

### After Package.json Changes

```powershell
# 1. Update lockfile
pnpm install

# 2. Verify changes
git diff pnpm-lock.yaml

# 3. Test build
pnpm run build:libs

# 4. Commit together
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add new dependency"
```

### Resolving Merge Conflicts

```powershell
# 1. Accept one version
git checkout --theirs pnpm-lock.yaml

# 2. Regenerate lockfile
pnpm install

# 3. Verify everything works
pnpm run validate

# 4. Complete merge
git add pnpm-lock.yaml
git commit
```

## Exit Codes

- **0**: Lockfile updated successfully
- **Non-zero**: Installation errors or conflicts

## Performance Notes

- Typically completes in 10-60 seconds
- Uses pnpm's content-addressable store for efficiency
- Faster than npm/yarn due to hard linking
- Network-bound for new packages

## Workspace Commands

### Update root workspace

```powershell
pnpm install
```

### Update specific workspace package

```powershell
pnpm --filter <workspace-name> install
```

### Update all workspaces

```powershell
pnpm install -r
```

## Verification Commands

### Check lockfile integrity

```powershell
pnpm install --frozen-lockfile
```

### Audit dependencies

```powershell
pnpm audit
```

### Check for outdated packages

```powershell
pnpm outdated
```

### Validate workspace dependencies

```powershell
pnpm run validate:workspace-deps
```

## Troubleshooting Checklist

- [ ] pnpm version correct (9.12.1+)
- [ ] package.json has valid JSON
- [ ] Network connectivity available
- [ ] Registry accessible (registry.npmjs.org)
- [ ] No file permission issues
- [ ] Sufficient disk space
- [ ] No corrupt cache

## Related Skills

- [Dev Web Server](dev-web.md) - Requires updated dependencies
- [Dev DB Lambda](dev-db-lambda.md) - May need dependency updates
- [Building](build.md) - Depends on correct dependencies
- [Testing](test.md) - Tests may fail with wrong versions

## Common Scenarios

### Adding a New Dependency

```powershell
# Add and update lockfile automatically
pnpm add <package-name>

# Verify it works
pnpm exec nx affected -t build
```

### Updating All Dependencies

```powershell
# Update within semver ranges
pnpm update

# Update to latest (check for breaking changes)
pnpm update --latest

# Review changes
git diff pnpm-lock.yaml
```

### After Pulling Changes

```powershell
# Check if package.json changed
git diff HEAD@{1} package.json

# If yes, update lockfile
pnpm install

# Rebuild if needed
pnpm run build:libs
```

### Fixing Corrupted Lockfile

```powershell
# Nuclear option - full clean
Remove-Item -Recurse -Force node_modules
Remove-Item pnpm-lock.yaml
pnpm install

# Verify workspace
pnpm run validate
```

## Best Practices Summary

✅ **Do:**

- Commit lockfile changes with package.json
- Run `pnpm install` after pulling changes
- Use `--frozen-lockfile` in CI environments
- Review lockfile diffs before committing
- Keep pnpm version consistent across team

❌ **Don't:**

- Manually edit pnpm-lock.yaml
- Ignore lockfile in version control
- Mix package managers (npm/yarn/pnpm)
- Skip lockfile updates after dependency changes
- Commit package.json without updated lockfile
