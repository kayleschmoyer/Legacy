---
name: lint
description: 'Run ESLint and Prettier across affected projects with auto-fixing. Use before committing, when resolving code quality issues, or when CI fails on the lint or format step.'
---

# Skill: Linting

## Overview

Run ESLint across affected projects with automatic fixing capabilities.

## When to Use

- Before committing changes
- After modifying code files
- When resolving code quality issues
- As the second step in pre-commit validation (after typecheck)

## Command

```powershell
make lint-fix
```

> **Always prefer `make lint-fix`** — it sets the `NODE_OPTIONS` windowsHide patch on Windows. The underlying command is `pnpm exec nx affected -t lint --fix`.

## Alternative Commands

### Lint without auto-fix (dry run)

```powershell
make lint
```

### Lint specific project

```powershell
pnpm exec nx run <project-name>:lint --fix
```

### Lint all projects

```powershell
pnpm exec nx run-many -t lint --fix
```

## Expected Output

- **Success**: No linting errors (or all auto-fixed)
- **Warning**: Fixable issues that were corrected
- **Failure**: Unfixable linting errors remain

## Common Issues

### Issue: "Rule X is not defined"

**Solution**: Check ESLint configuration and ensure plugins are installed

### Issue: Too many warnings

**Solution**: Address warnings incrementally; use `--quiet` to show only errors

### Issue: Conflicting rules

**Solution**: Review `.eslintrc.json` hierarchy and rule precedence

### Issue: Import order errors

**Solution**: Let auto-fix handle it, or manually organize imports per conventions

## Best Practices

1. **Always use --fix**: Auto-fix saves time and ensures consistency
2. **Run after typecheck**: Type errors can cause false lint errors
3. **Don't suppress without reason**: Use `eslint-disable` sparingly with comments
4. **Follow project conventions**: See [ESLint Standards CSV](../eslint-standards.csv)

## Common Fixable Issues

- Import ordering
- Unused variables/imports
- Spacing and formatting
- Missing semicolons
- Quote style consistency

## Common Manual Fixes Required

- Complex logic simplification
- Accessibility issues
- Security vulnerabilities
- Complexity reduction
- Missing error handling

## Integration with Workflow

Linting is Step 2 of the pre-commit sequence (typecheck → lint → test → build). Run the full suite with `make pc`. See [makefile](../makefile/SKILL.md) for all targets.

## Exit Codes

- **0**: No linting errors
- **Non-zero**: Linting errors found (even after auto-fix)

## Performance Notes

- Moderately fast (slower than typecheck)
- Caches results for unchanged files
- Auto-fix adds minimal overhead

## Configuration Files

- `.eslintrc.json` - Root configuration
- `.eslintignore` - Files to exclude
- Project-specific overrides in individual project folders

## Related Skills

- [Type Checking](../typecheck/SKILL.md)
- [Testing](../test/SKILL.md)

## Formatting (Prettier)

### Format All Files

```powershell
pnpm exec nx format:write
```

This is the same command `make pc` runs internally.

### Check Formatting (Dry Run)

```powershell
pnpm exec nx format:check
```

### Format Specific Files

```powershell
pnpm exec prettier --write "apps/web/**/*.{ts,tsx}"
pnpm exec prettier --write path/to/file.ts
```

### Pre-push Hook

A pre-push Git hook runs `nx format:write` automatically before every push. If the working tree is clean, it auto-amends the last commit with formatting fixes and aborts the push — run `git push` again. If uncommitted changes exist, it blocks the push. To bypass in an emergency: `git push --no-verify`.

### Recommended Order

```powershell
pnpm exec nx format:write           # Format
pnpm exec nx affected -t typecheck   # Typecheck
pnpm exec nx affected -t lint --fix  # Lint
pnpm exec nx affected -t test        # Test
pnpm exec nx affected -t build       # Build
```
