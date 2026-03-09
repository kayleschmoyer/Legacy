---
name: lint
description: 'Run ESLint across affected Nx projects with automatic fixing; use before committing, after code changes, or as part of pre-commit validation.'
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

### Pre-commit Sequence

```powershell
pnpm exec nx affected -t typecheck   # Step 1
pnpm exec nx affected -t lint --fix  # Step 2 ← This command
pnpm exec nx affected -t test        # Step 3
pnpm exec nx affected -t build       # Step 4
```

### Quick Check (Makefile)

```powershell
make quick-check  # Runs typecheck + lint
```

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

- [Type Checking](typecheck.md)
- [Testing](test.md)
- [Formatting](format.md)
