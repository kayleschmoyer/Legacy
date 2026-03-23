---
name: test
description: 'Run Jest tests across affected Nx projects; use before committing changes, after implementing new features, or to verify that bug fixes are correct.'
---

# Skill: Testing

## Overview

Run Jest tests across affected projects in the Nx monorepo.

## When to Use

- Before committing changes
- After implementing new features
- After fixing bugs
- As the third step in pre-commit validation (after typecheck and lint)

## Command

```powershell
make test
```

> **Always prefer `make test`** — it sets the `NODE_OPTIONS` windowsHide patch on Windows. The underlying command is `pnpm exec nx affected -t test`.

## Alternative Commands

### Test specific project

Prefer the `nx_run` MCP tool (`nx_run(project: "<project-name>", target: "test")`) over shell commands. Fall back to shell only when MCP is unavailable:

```powershell
pnpm exec nx run <project-name>:test
```

### Test with coverage

```powershell
pnpm exec nx affected -t test --coverage
```

### Test in watch mode

```powershell
pnpm exec nx run <project-name>:test --watch
```

### Run specific test file

```powershell
pnpm exec nx run <project-name>:test --testFile="path/to/test.spec.ts"
```

### Test all projects

```powershell
pnpm exec nx run-many -t test
```

## Expected Output

- **Success**: All tests passed
- **Failure**: Test failures with details
- **Coverage**: Code coverage report (if --coverage flag used)

## Common Issues

### Issue: Tests fail due to missing mocks

**Solution**: Ensure all external dependencies are properly mocked

### Issue: Snapshot mismatches

**Solution**: Review changes and update snapshots if intentional with `--updateSnapshot`

### Issue: Async timeout errors

**Solution**: Increase timeout or ensure async operations complete properly

### Issue: Database connection errors in tests

**Solution**: Use test database or mocks, not real connections

### Issue: Tests pass locally but fail in CI

**Solution**: Check for environment-specific dependencies or timing issues

## Best Practices

1. **Run after lint**: Ensure code quality before testing
2. **Write tests for new code**: Don't skip test coverage
3. **Use affected**: Only run tests for changed code
4. **Keep tests fast**: Mock slow operations
5. **Follow testing patterns**: See [Testing Strategy CSV](../testing-strategy.csv)

## Test Types in Project

- **Unit tests** (`*.spec.ts`): Individual function/component tests — fast, no external dependencies
- **Integration tests** (`*.integration.spec.ts`): Tests with real DB setup/teardown — use this suffix for resolver tests that connect to a real database
- **E2E tests** (Playwright): Full application flows (separate command — see [E2E Testing](e2e-testing.md) and [Integration Testing](integration-testing.md))

### File Naming Convention

| Test Type                           | File Pattern                            | Example                                |
| ----------------------------------- | --------------------------------------- | -------------------------------------- |
| Unit test                           | `*.spec.ts`                             | `scoring.spec.ts`                      |
| Integration test (Jest + DB)        | `*.integration.spec.ts`                 | `leagues.resolver.integration.spec.ts` |
| Mocked E2E (Playwright)             | `*.spec.ts` in `src/tests/`             | `league-overview.spec.ts`              |
| Full-stack integration (Playwright) | `*.spec.ts` in `src/integration/tests/` | `live-draft-ui.spec.ts`                |

The `*.integration.spec.ts` suffix is used for Jest resolver tests that start a real database, not for Playwright integration tests (which are separated by directory).

## Integration with Workflow

Testing is Step 3 of the pre-commit sequence (typecheck → lint → test → build). Run the full suite with `make pc`. See [makefile](../../makefile/SKILL.md) for all targets.

## Exit Codes

- **0**: All tests passed
- **Non-zero**: Test failures occurred

## Performance Notes

- Slowest of the validation steps
- Parallel execution across projects
- Caches results for unchanged files
- Can be optimized with focused test files

## Test Configuration

- `jest.config.ts` - Root configuration
- `jest.preset.js` - Shared presets
- Project-specific configs in individual project folders

## Common Test Commands

### Update snapshots

```powershell
pnpm exec nx run <project-name>:test --updateSnapshot
```

### Run tests matching pattern

```powershell
pnpm exec nx run <project-name>:test --testNamePattern="should handle error"
```

### Debug tests

```powershell
pnpm exec nx run <project-name>:test --runInBand --no-cache
```

## Related Skills

- [Type Checking](../../typecheck/SKILL.md)
- [Linting](../../lint/SKILL.md)
- [Building](../../build/SKILL.md)
