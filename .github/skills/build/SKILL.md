---
name: build
description: 'Build affected projects in the Nx monorepo, compiling TypeScript and bundling assets; use before deploying or verifying build output.'
---

# Skill: Building

## Overview

Build affected projects in the Nx monorepo, compiling TypeScript and bundling assets.

## When to Use

- Before committing changes (final validation step)
- Before deploying code
- After making structural changes
- As the fourth step in pre-commit validation (after typecheck, lint, and test)

## Command

```powershell
make build
```

> **Always prefer `make build`** — it sets the `NODE_OPTIONS` windowsHide patch on Windows. The underlying command is `pnpm exec nx affected -t build`.

## Alternative Commands

### Build specific project

```powershell
pnpm exec nx run <project-name>:build
```

### Build with production optimization

```powershell
pnpm exec nx run <project-name>:build --configuration=production
```

### Build all projects

```powershell
pnpm exec nx run-many -t build
```

### Build with dependency graph

```powershell
pnpm exec nx build <project-name> --with-deps
```

## Expected Output

- **Success**: Compiled output in `dist/` directory
- **Failure**: Build errors with file locations

## Common Issues

### Issue: Module not found errors

**Solution**: Ensure all dependencies are listed in package.json

### Issue: Type errors during build

**Solution**: Run typecheck first and fix all type errors

### Issue: Build output is stale

**Solution**: Clear cache with `pnpm exec nx reset`

### Issue: Out of memory errors

**Solution**: Increase Node memory with `NODE_OPTIONS=--max-old-space-size=8192`

### Issue: Build succeeds but runtime errors

**Solution**: Check import paths and ensure dynamic imports are handled

## Best Practices

1. **Run last** in validation sequence (after typecheck, lint, test)
2. **Use affected**: Only build changed projects
3. **Check output**: Verify dist/ folder contains expected files
4. **Production builds**: Use proper configuration for deployments
5. **Clean builds**: Reset cache if unexpected issues occur

## Build Targets by Project Type

### Web (Next.js)

```powershell
pnpm exec nx run web:build
# Output: apps/web/.next/
```

### Mobile (React Native)

```powershell
pnpm exec nx run app:build
# Note: Use platform-specific builds for deployment
```

### Lambdas

```powershell
pnpm exec nx run <lambda-name>:build
# Output: dist/lambdas/<lambda-name>/
```

### Libraries

```powershell
pnpm exec nx run <lib-name>:build
# Output: dist/lib/<lib-name>/
```

## Integration with Workflow

### Pre-commit Sequence

```powershell
pnpm exec nx affected -t typecheck   # Step 1
pnpm exec nx affected -t lint --fix  # Step 2
pnpm exec nx affected -t test        # Step 3
pnpm exec nx affected -t build       # Step 4 ← This command
```

### Full Pre-commit (Makefile)

```powershell
make pre-commit  # Runs all 4 validation steps
```

## Exit Codes

- **0**: Build successful
- **Non-zero**: Build errors occurred

## Performance Notes

- Slowest validation step (along with tests)
- Leverages Nx build cache extensively
- Parallel builds across independent projects
- Incremental builds for libraries

## Build Output Locations

```
dist/
├── apps/
│   ├── web/           # Next.js build
│   ├── app/           # React Native build
│   └── cli/           # CLI build
├── lambdas/
│   ├── db/            # DB Lambda
│   ├── oauth-proxy/   # OAuth Lambda
│   └── ...
└── lib/
    ├── shared-types/  # Shared types library
    └── ...
```

## Cache Management

### Clear all cache

```powershell
pnpm exec nx reset
```

### Clear specific project cache

```powershell
Remove-Item -Recurse -Force dist/<project-path>
```

## Build Configurations

### Development (default)

- Source maps enabled
- No minification
- Fast builds

### Production

- Optimized bundles
- Minification enabled
- Tree shaking
- Source maps optional

## Common Build Commands

### Build with verbose output

```powershell
pnpm exec nx affected -t build --verbose
```

### Build without cache

```powershell
pnpm exec nx affected -t build --skip-nx-cache
```

### Dry run (see what would build)

```powershell
pnpm exec nx affected -t build --dry-run
```

## Related Skills

- [Type Checking](typecheck.md)
- [Linting](lint.md)
- [Testing](test.md)
