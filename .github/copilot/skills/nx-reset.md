# Skill: Nx Cache Reset

## Overview
Clear Nx build cache and daemon to resolve build issues and stale cache problems.

## When to Use
- Experiencing unexpected build failures
- Stale generated files causing errors
- After major dependency updates
- Build output doesn't reflect recent changes
- "Module not found" errors that shouldn't exist
- Nx daemon causing issues

## Command

```powershell
# Clear Nx cache (recommended)
make reset
```

## Alternative Commands

### Manual Nx Reset

```powershell
# Clear Nx cache manually
pnpm exec nx reset

# Or using package.json script
pnpm run clean:nx
```

### Nuclear Option (Full Clean)

```powershell
# Clean everything (cache + node_modules)
make clean:all

# Or step by step
pnpm exec nx reset
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
pnpm install
```

### Stop Nx Daemon

```powershell
# Stop Nx daemon explicitly
pnpm exec nx daemon --stop

# Or let it timeout
# The Makefile handles this with timeout
```

## Expected Output
- **Success**: Cache directory cleared
- **Console**: "Successfully reset the Nx workspace"
- **Daemon**: Nx daemon stopped (if running)

## Common Issues

### Issue: Cache directory locked
**Symptom**: Cannot delete cache files, access denied
**Solution**: Stop Nx daemon first
```powershell
# Stop daemon
pnpm exec nx daemon --stop

# Wait a moment
Start-Sleep -Seconds 2

# Try reset again
pnpm exec nx reset
```

### Issue: Build still failing after reset
**Symptom**: Cache cleared but issues persist
**Solution**: Full clean and rebuild
```powershell
# Nuclear option
make clean:all

# Then rebuild from scratch
pnpm install
pnpm run build:libs
```

### Issue: Nx daemon won't stop
**Symptom**: Daemon process won't terminate
**Solution**: Force kill the process
```powershell
# Find and kill Nx daemon
Get-Process -Name "node" | Where-Object {$_.CommandLine -like "*nx*daemon*"} | Stop-Process -Force
```

### Issue: Permission errors during clean
**Symptom**: Access denied on cache files
**Solution**: Close VS Code and other tools, run as admin if needed
```powershell
# Close VS Code, terminals, etc.
# Then try again
pnpm exec nx reset
```

## Best Practices
1. **Try reset first** before full clean (much faster)
2. **Stop daemon** if having permission issues
3. **Close editors** before cleaning to avoid locks
4. **Rebuild libs** after full clean
5. **Use sparingly** - only when actually needed

## When to Use Each Clean Level

### Level 1: Nx Cache Reset (Fastest)
```powershell
# Use when:
# - Build output seems stale
# - Nx showing wrong affected projects
# - Cache corruption suspected
make reset
```

### Level 2: Full Clean (Slower)
```powershell
# Use when:
# - Dependency issues
# - Module resolution problems
# - Major package updates
make clean:all
pnpm install
pnpm run build:libs
```

### Level 3: Nuclear (Slowest)
```powershell
# Use when:
# - Everything is broken
# - Switching branches with major changes
# - After major refactoring
Remove-Item -Recurse -Force node_modules, .nx, dist, coverage
pnpm install
pnpm run build:libs
pnpm run validate
```

## Integration with Workflow

### After Major Changes
```powershell
# 1. Reset cache
make reset

# 2. Rebuild libraries
pnpm run build:libs

# 3. Verify everything works
pnpm run validate
```

### Troubleshooting Build Issues
```powershell
# 1. Try reset first
make reset

# 2. If still failing, check dependencies
pnpm install

# 3. If still failing, full clean
make clean:all
pnpm install
pnpm run build:libs
```

### After Pulling Large Changes
```powershell
# 1. Pull changes
git pull

# 2. Reset cache (optional but recommended)
make reset

# 3. Install new dependencies
pnpm install

# 4. Rebuild libraries
pnpm run build:libs
```

## What Gets Cleared

### Nx Reset Clears
- Nx build cache (`.nx/cache/`)
- Nx daemon state
- Project build outputs (sometimes)

### Does NOT Clear
- `node_modules/`
- `package-lock.json`
- Source files
- Git history

## Performance Notes
- **Reset time**: 1-5 seconds
- **Full clean**: 2-5 minutes (including reinstall)
- **Rebuild after clean**: 5-15 minutes depending on changes

## Cache Location

```
.nx/
├── cache/           # Build cache (cleared by reset)
├── workspace-data/  # Project graph cache (cleared)
└── daemon/          # Daemon state (cleared)
```

## Automation

The Makefile includes smart cleaning:

```makefile
# Stops daemon with timeout
# Clears cache
# Handles errors gracefully
make reset
```

## Related Skills
- [Building](build.md) - Rebuilding after cache clear
- [Type Checking](typecheck.md) - Validating after rebuild
- [Affected Check](affected-check.md) - Verifying affected projects

## Related Documentation
- [Build System](../../../docs/architecture/build-system.md)
- [Troubleshooting](../../../docs/guides/troubleshooting.md)
- [Nx Documentation](https://nx.dev/nx-api/nx/documents/reset)

## Exit Codes
- **0**: Cache cleared successfully
- **Non-zero**: Error occurred (check error message)

## Warning

⚠️ **Don't overuse cache clearing!** Nx cache makes builds much faster. Only reset when you actually have cache-related issues.
