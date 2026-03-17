---
name: typecheck
description: 'Run TypeScript type checking across affected Nx projects without emitting output; use before committing or to validate type correctness across the monorepo.'
---

# Skill: Type Checking

## Overview

Run TypeScript type checking across affected projects in the Nx monorepo.

## When to Use

- Before committing changes
- After modifying TypeScript files
- When resolving type errors
- As the first step in pre-commit validation

## Command

```powershell
make typecheck
```

> **Always prefer `make typecheck`** — it sets the `NODE_OPTIONS` windowsHide patch on Windows. The underlying command is `pnpm exec nx affected -t typecheck`.

## Alternative Commands

### Check specific project

```powershell
pnpm exec nx run <project-name>:typecheck
```

### Check all projects (not recommended for large repos)

```powershell
pnpm exec nx run-many -t typecheck
```

## Expected Output

- **Success**: No type errors found
- **Failure**: List of type errors with file locations and error messages

## Common Issues

### Issue: "Cannot find module" errors

**Solution**: Run `pnpm install` to ensure dependencies are installed

### Issue: Generated types out of sync

**Solution**: Run GraphQL codegen or other code generation tools first

### Issue: Circular dependency type errors

**Solution**: Check import structure and break circular dependencies

## Best Practices

1. **Always run first** in validation sequence (typecheck → lint → test → build)
2. **Use affected**: Only checks modified projects and their dependencies
3. **Fix before proceeding**: Don't skip type errors
4. **Never suppress with @ts-ignore**: Fix the root cause instead

## Integration with Workflow

Typecheck is Step 1 of the pre-commit sequence (typecheck → lint → test → build). Run the full suite with `make pc`. See [makefile](../makefile/SKILL.md) for all targets.

## Exit Codes

- **0**: All type checks passed
- **Non-zero**: Type errors found

## Performance Notes

- Typically fastest validation step
- Caches results for unchanged files
- Scales with number of affected files

## Related Skills

- [Linting](../lint/SKILL.md)
- [Testing](../test/SKILL.md)
- [Building](../build/SKILL.md)
