# Draft Status E2E Tests

This directory contains E2E tests for the draft functionality that validate the fix for the database persistence issue.

## 🎯 What These Tests Validate

### **Core Bug Fix**

The main issue was that the `startDraft` mutation would return "queued" status, but on page refresh, the status would revert to "not-started". This was caused by a transaction boundary issue where:

1. Database update succeeded and committed
2. SQS call happened after transaction closed
3. If SQS failed, database was already committed (no rollback possible)
4. Mutation returned "queued" but database showed "not-started" on refresh

### **Test Coverage**

#### **UI Tests (`draft-functionality.spec.ts`)**

- ✅ Display draft button and status correctly
- ✅ Update draft status when button is clicked
- ✅ **Maintain draft status after page refresh (key persistence test)**
- ✅ Handle rapid interactions gracefully
- ✅ Display appropriate error messages
- ✅ Maintain accessibility standards

#### **GraphQL Integration Tests (`draft-graphql-integration.spec.ts`)**

- ✅ Make correct GraphQL queries and handle responses
- ✅ Send startDraft mutation with proper variables
- ✅ Handle GraphQL errors gracefully in UI
- ✅ Update Apollo Client cache correctly after mutation

## 🚀 Running the Tests

### **Prerequisites**

1. **Install Playwright browsers:**

   ```bash
   cd apps/web-e2e
   pnpm exec playwright install
   ```

2. **Start the web application:**

   ```bash
   # In one terminal - start GraphQL API
   cd lambdas/db
   pnpm run dev

   # In another terminal - start web app
   cd apps/web
   pnpm run dev
   ```

3. **Ensure test data exists:**
   - League with ID 1 should exist in the database
   - League should be in "not-started" draft status initially

## Running Tests

To run the E2E tests:

```bash
# Run all tests
pnpm exec playwright test

# Run tests in headed mode (see browser)
pnpm exec playwright test --headed

# Run specific test file
pnpm exec playwright test draft-functionality.spec.ts

# Run tests and generate HTML report
pnpm exec playwright test --reporter=html
```

## ✅ Authentication Bypass Setup

The tests are configured with an authentication bypass fixture that:

- **Automatically authenticates tests** using a mock JWT token
- **Mocks GraphQL responses** for league data and draft operations
- **Bypasses OAuth login flow** completely for faster test execution
- **Works across all test files** that import from `../fixtures/auth`

### Usage in Tests

```typescript
import { test, expect } from '../fixtures/auth';

test('your test name', async ({ page }) => {
  // Authentication is automatically handled
  // Navigate directly to protected routes
  await page.goto('/baseball/league/1');

  // Your test assertions here
});
```

The authentication fixture is located in `src/fixtures/auth.ts` and provides:

- Mock JWT token with admin access level
- GraphQL response mocking for league operations
- Automatic localStorage setup for authentication state

### **Test Configuration**

The tests are configured to:

- Use `http://localhost:4200` as the base URL (web app)
- Target league ID 1 at `/baseball/league/1`
- Take screenshots for visual validation
- Test across multiple browsers (Chrome, Firefox, Safari)
- Include mobile viewport testing

## 📊 Test Results Interpretation

### **Success Criteria**

✅ **Persistence Test Passes** - The critical test that validates our fix:

```typescript
// This assertion was failing before the fix
expect(postRefreshStatus).toMatch(/queued|progress|completed/i);
```

✅ **GraphQL Integration** - Validates proper API communication:

```typescript
expect(startDraftResponse.data.startDraft.draftStatus).toBe('queued');
```

### **Expected Behavior After Fix**

1. Click "Start Draft" button
2. UI immediately shows "Draft Queued" or similar
3. **Page refresh maintains the queued status** ← Key test
4. No reversion to "not-started"
5. Consistent state across all queries

## 🔧 Troubleshooting

### **Test Failures**

**"Page timeout" errors:**

- Ensure web app is running on localhost:4200
- Check that GraphQL API is running on localhost:5000
- Verify league with ID 1 exists in database

**"Button not found" errors:**

- Check that the league page has draft functionality
- Verify user permissions (tests assume user can start drafts)
- Ensure league is in "not-started" state

**"Status assertion" failures:**

- This indicates the original bug is still present
- Check that our fix in `leagues.ts` is deployed
- Verify SQS configuration for local development

### **Environment Setup**

**Database Setup:**

```bash
# Ensure test league exists
cd apps/cli
pnpm run db:test-connection
# Create test league if needed
```

**GraphQL API:**

```bash
cd lambdas/db
pnpm run build
pnpm run dev
# Should show "Server ready at localhost:5000"
```

**Web App:**

```bash
cd apps/web
pnpm run dev
# Should show app running on localhost:4200
```

## 🎯 Integration with CI/CD

These tests should be run in CI to prevent regression:

```yaml
# Example GitHub Actions step
- name: Run Draft E2E Tests
  run: |
    # Start services
    pnpm run start:api &
    pnpm run start:web &

    # Wait for services
    pnpm exec wait-on http://localhost:5000/graphql
    pnpm exec wait-on http://localhost:4200

    # Run tests
    cd apps/web-e2e
    pnpm exec playwright test draft-functionality
    pnpm exec playwright test draft-graphql-integration
```

## 📈 Test Maintenance

**When to Update Tests:**

- UI changes to draft button/status display
- GraphQL schema changes for startDraft mutation
- New draft types or status values added
- Authentication/permission changes

**Adding New Test Cases:**

- Test different draft types (snake-draft, auction, etc.)
- Test with different user permission levels
- Test concurrent draft attempts
- Test draft cancellation functionality

## 🐛 Related Issues

This test suite addresses:

- **Database Transaction Boundary Issue** - Fixed with proper rollback handling
- **SQS Local Development** - Added fallback for missing SQS configuration
- **Apollo Client Cache Consistency** - Validated mutation response updates cache
- **User Experience** - Ensured UI reflects persistent state changes

The comprehensive E2E coverage ensures this critical user workflow remains stable across future changes.
