# E2E Test Maintenance Guidelines

## Overview

This document provides guidelines for maintaining E2E (End-to-End) tests in the Legacy Sports codebase, including best practices for skipping tests, adding test metadata, and ensuring test reliability.

## Test Skip Policy

### When to Skip Tests

Tests should only be skipped in the following scenarios:

1. **Environment Dependencies Not Met**
   - GraphQL server not available
   - Database not accessible
   - Authentication services unavailable

2. **Test Data State Issues**
   - Required test data not in correct state
   - League already drafted (for draft start tests)
   - User lacks necessary permissions

3. **Known Blocking Issues**
   - Blocked by open bug ticket
   - Dependent feature not yet implemented
   - Infrastructure issue preventing test execution

### How to Skip Tests Properly

#### ✅ Good Skip Pattern

```typescript
test('should perform action', async ({ page }) => {
  // SKIP-REASON: LS-123 - GraphQL endpoint not configured in CI environment
  // TODO: Configure GRAPHQL_ENDPOINT in CI or add service setup to test suite
  if (!isServiceAvailable) {
    console.log('⚠️  Skipping test - service not available');
    test.skip();
    return;
  }
  
  // ... test implementation
});
```

#### ❌ Bad Skip Pattern

```typescript
test('should perform action', async ({ page }) => {
  // No reason given, no tracking
  if (!someCondition) {
    test.skip();
  }
  
  // ... test implementation
});
```

### Required Skip Metadata

Every `test.skip()` call must include:

1. **SKIP-REASON comment**: Explains why test is skipped
2. **Issue reference**: Link to Jira ticket (e.g., `LS-123`) if blocked by known issue
3. **TODO comment**: Action items to re-enable the test
4. **Console log**: User-friendly message explaining skip reason

**Template:**

```typescript
// SKIP-REASON: LS-XXX - Brief description of blocking issue
// TODO: Action needed to re-enable (e.g., "Configure test database", "Wait for LS-XXX merge")
if (skipCondition) {
  console.log('⚠️  Skipping test - user-friendly reason');
  test.skip();
  return;
}
```

## Test Environment Setup

### GraphQL Endpoint Availability

Many E2E tests require a running GraphQL server. Best practices:

1. **Check availability in `beforeAll`**:
   ```typescript
   let isGraphQLAvailable = false;

   test.beforeAll(async () => {
     try {
       const response = await fetch(GRAPHQL_ENDPOINT, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ query: '{ __typename }' }),
       });
       isGraphQLAvailable = response.ok;
     } catch (error) {
       console.log('⚠️  GraphQL server not available');
     }
   });
   ```

2. **Use shared availability flag**:
   ```typescript
   test('my test', async () => {
     if (!isGraphQLAvailable) {
       test.skip();
       return;
     }
     // ... test implementation
   });
   ```

### Test Data Management

For tests that require specific data states:

1. **Create fresh test data**: Use setup mutations to create leagues, users, etc.
2. **Reset state between tests**: Implement cleanup in `afterEach` or `afterAll`
3. **Document required state**: Add comments explaining what state test expects

**Example:**

```typescript
test.beforeEach(async () => {
  // Ensure test league is in 'not-started' status
  testLeagueId = await createFreshLeague();
});

test.afterEach(async () => {
  // Cleanup test data
  await deleteLeague(testLeagueId);
});
```

## Common Test Skip Scenarios

### 1. GraphQL Server Unavailable

**Issue**: Tests fail when GraphQL server isn't running

**Solution**:

```typescript
// SKIP-REASON: GraphQL server must be running for E2E tests
// TODO: Document GraphQL server startup in test README
if (!isGraphQLAvailable) {
  console.log('⚠️  Skipping test - GraphQL server not available:', GRAPHQL_ENDPOINT);
  test.skip();
  return;
}
```

### 2. UI State Not Ready

**Issue**: Button not visible or disabled due to league state

**Solution**:

```typescript
// SKIP-REASON: UI state - League already drafted or user lacks permissions
// TODO: Implement test fixture to reset league state before test
if (!(await button.isVisible()) || (await button.isDisabled())) {
  console.log('⚠️  Button not available - skipping test');
  test.skip();
  return;
}
```

### 3. Feature Not Yet Implemented

**Issue**: Test written for upcoming feature

**Solution**:

```typescript
// SKIP-REASON: LS-456 - Waiting for draft scheduling feature implementation
// TODO: Re-enable after LS-456 is merged
test.skip('should schedule draft for future date', async () => {
  // Test implementation ready for when feature lands
});
```

## CI Integration

### Test Skip Warnings

The CI pipeline should warn when tests are skipped:

1. **Count skipped tests**: Track number of skipped tests in each run
2. **Report trend**: Alert if skipped test count increases
3. **Review regularly**: Schedule monthly review of all skipped tests

### GitHub Actions Configuration

Add to your CI workflow:

```yaml
- name: Check for skipped tests
  run: |
    pnpm exec playwright test --reporter=json > test-results.json
    $skippedCount = (Get-Content test-results.json | ConvertFrom-Json).suites | 
      ForEach-Object { $_.specs } | 
      Where-Object { $_.tests.results.status -eq 'skipped' } | 
      Measure-Object | 
      Select-Object -ExpandProperty Count
    
    if ($skippedCount -gt 0) {
      Write-Warning "⚠️  $skippedCount test(s) were skipped - review skip reasons"
    }
```

## Test Maintenance Workflow

### Weekly Review

1. **Check skipped tests**: Review all `test.skip()` calls
2. **Verify skip reasons**: Ensure all have proper metadata
3. **Check blocking tickets**: Update status of referenced tickets
4. **Re-enable tests**: If blockers resolved, remove skip and verify test passes

### Monthly Audit

1. **Generate skip report**: List all skipped tests with reasons
2. **Prioritize enablement**: Identify tests that can be re-enabled
3. **Update documentation**: Ensure test setup docs are current
4. **Remove stale tests**: Delete tests for removed features

## Best Practices

### ✅ Do

- Add descriptive skip reasons with ticket references
- Use environment checks in `beforeAll` when possible
- Create fresh test data for each test run
- Document test environment requirements
- Review and update skipped tests regularly
- Use console.log for user-friendly skip messages

### ❌ Don't

- Skip tests without explanation
- Use `test.skip()` for broken tests without filing a ticket
- Leave tests skipped indefinitely without follow-up
- Skip tests to hide flaky behavior (fix the flakiness instead)
- Use generic skip reasons like "doesn't work"

## Finding Skipped Tests

Search for skipped tests in the codebase:

```powershell
# Find all test.skip() calls
grep -r "test.skip()" tests/ apps/

# Find skip reasons
grep -r "SKIP-REASON" tests/ apps/
```

## Related Documentation

- [E2E Testing Migration](./e2e-testing-migration.md) - E2E test setup
- [Jest Configuration](./jest-changed-files-config.md) - Unit test configuration
- [CI Troubleshooting](../ci-cd/ci-troubleshooting-guide.md) - CI issues

## Questions?

For questions about E2E test maintenance, check:
- [Troubleshooting Guide](../guides/troubleshooting.md)
- [Development Setup](../guides/development-setup.md)

---

**Last Updated**: January 21, 2026  
**Related Ticket**: LS-59 - Re-enable or document skipped tests
