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

### Starting the GraphQL Server

Some E2E tests (e.g., `tests/e2e/draft-status-update.spec.ts`) make direct GraphQL API calls and require a running server. The server runs at `http://localhost:5000/graphql` by default.

#### Quick Start

```bash
# Option 1: Start only the GraphQL server (fastest)
make dev-graphql

# Option 2: Start all dev services (GraphQL + OAuth proxy + other lambdas)
make dev

# Verify the server is running
curl -s -X POST http://localhost:5000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}' | head -c 50
# Expected: {"data":{"__typename":"Query"}}
```

#### Prerequisites

1. **Database must be running and migrated**:
   ```bash
   pnpm --prefix lib/db-client run db:status
   pnpm --prefix lib/db-client run db:up
   ```
2. **Environment variables**: Ensure `.env` is present in the repo root (copied from `.env.example` or from a worktree setup).
3. **JWT_SECRET**: Should be set in `.env` to match the running server's secret; otherwise tests will receive 401 errors. The E2E JWT helpers fall back to a built-in dev secret if `JWT_SECRET` is unset, which works when the server also uses the dev default.

#### Configuring the Endpoint

Tests default to `http://localhost:5000/graphql`. Override with:

```bash
GRAPHQL_ENDPOINT=http://localhost:5000/graphql pnpm exec playwright test tests/e2e/draft-status-update.spec.ts
```

### GraphQL Endpoint Availability

Tests that require the GraphQL server should validate availability before running. Use Playwright's built-in `test.skip(condition, reason)` for clear skip reporting:

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

2. **Use `test.skip(condition, reason)` as the primary skip pattern** (preferred over manual `if`/`return`):
   ```typescript
   test('my test', async () => {
     test.skip(
       !isGraphQLAvailable,
       'GraphQL server not available. Start with: make dev-graphql',
     );
     // ... test implementation
   });
   ```
   Add a `SKIP-REASON` / `TODO` comment above the `test.skip()` call only when the skip is tied to a Jira ticket or requires a specific follow-up action to re-enable.

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
  console.log(
    '⚠️  Skipping test - GraphQL server not available:',
    GRAPHQL_ENDPOINT,
  );
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
    SKIPPED=$(jq '[.suites[].specs[].tests[].results[] | select(.status == "skipped")] | length' test-results.json)
    if [ "$SKIPPED" -gt 0 ]; then
      echo "::warning::$SKIPPED test(s) were skipped — review skip reasons"
    fi
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

```bash
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

**Last Updated**: March 22, 2026
**Related Tickets**: LS-59 - Re-enable or document skipped tests, LS-64 - Document GraphQL server setup
