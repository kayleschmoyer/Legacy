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
pnpm exec nx affected -t test
```

## Alternative Commands

### Test specific project
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
- **Unit tests**: Individual function/component tests
- **Integration tests**: Multiple components working together
- **E2E tests**: Full application flows (separate command)

## Integration with Workflow

### Pre-commit Sequence
```powershell
pnpm exec nx affected -t typecheck   # Step 1
pnpm exec nx affected -t lint --fix  # Step 2
pnpm exec nx affected -t test        # Step 3 ← This command
pnpm exec nx affected -t build       # Step 4
```

### Full Pre-commit (Makefile)
```powershell
make pre-commit  # Runs all 4 validation steps
```

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
- [Type Checking](typecheck.md)
- [Linting](lint.md)
- [Building](build.md)
