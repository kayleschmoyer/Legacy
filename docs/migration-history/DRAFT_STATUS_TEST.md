# Draft Status Update Test

This test verifies that starting a draft correctly updates the league draft status from `not-started` to `queued` and that the change persists across GraphQL queries.

## 🎯 What This Test Validates

The test confirms that the `startDraft` mutation:
1. ✅ Updates the league's `draftStatus` from `not-started` to `queued`
2. ✅ Returns the correct status in the mutation response
3. ✅ Persists the status change in the database
4. ✅ Maintains consistent status across multiple queries
5. ✅ Handles different draft types (`random-draft`, `snake-draft`, `auction`)
6. ✅ Validates user permissions for draft operations
7. ✅ Properly rejects invalid draft types

## 🚀 Running the Test

### Prerequisites
1. **GraphQL Server**: The test requires the GraphQL server to be running
   ```bash
   cd lambdas/db
   npm run dev
   # Server should start on http://localhost:3001/graphql
   ```

2. **Database Connection**: Ensure your database is accessible (the server will handle this)

3. **CLI JWT Generation**: The test uses the CLI `generate-jwt` command for authentication

### Execute the Test

**Option 1: Using npm script (Recommended)**
```bash
npm run test:draft-status
```

**Option 2: Direct execution**
```bash
npx tsx --tsconfig tsconfig.base.json test-draft-status.ts
```

**Option 3: Custom GraphQL endpoint**
```bash
GRAPHQL_ENDPOINT=http://your-server:port/graphql npm run test:draft-status
```

## 📋 Test Output Example

```
🚀 DRAFT STATUS UPDATE TEST
===========================

🔌 Testing connection to http://localhost:3001/graphql...
✅ GraphQL server is available

🔐 Setting up authentication...
🔑 Generating JWT for admin@test.com...
   ✅ Generated JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
🔑 Generating JWT for user@test.com...
   ✅ Generated JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...

🏗️  Setting up test data...
🏟️  Creating test league...
✅ Created league: ID=42, Name="Draft Test League 1728234567890", Status=not-started
👥 Adding user 1 to league 42...
✅ User 1 added to league 42

📋 Verifying initial state...
🔍 Fetching league 42...
📊 League details: ID=42, Status=not-started
✅ Initial draft status confirmed: not-started

🎯 Testing draft start...
🎯 Starting random-draft draft for league 42...
📊 Draft started: ID=42, Status=queued
✅ Draft mutation returned correct status: queued

🔍 Testing draft status persistence...
🔍 Fetching league 42...
📊 League details: ID=42, Status=queued
✅ Draft status correctly persisted: queued

🔄 Testing multiple consecutive queries...
   ✅ Query 1/3: Draft status still queued
   ✅ Query 2/3: Draft status still queued
   ✅ Query 3/3: Draft status still queued

📋 Testing draft type validation...
   🎯 Testing draft type: snake-draft
   ✅ snake-draft accepted and processed

🎉 ALL TESTS PASSED!
✅ Draft status update functionality is working correctly
📊 Test league IDs created: 42, 43
```

## 🔍 What Gets Tested

### 1. **Authentication Flow**
- Uses CLI-generated JWTs for both admin and regular users
- Verifies JWT generation works correctly
- Tests both admin and user permissions for draft operations

### 2. **Draft Status Persistence**
- Creates a test league with `not-started` status
- Executes `startDraft` mutation
- Verifies mutation response shows `queued` status
- **Critical Test**: Queries league again to confirm persistence
- Performs multiple queries to ensure consistency

### 3. **Draft Type Validation**
- Tests valid draft types: `random-draft`, `snake-draft`, `auction`
- Verifies invalid draft types are rejected
- Confirms each type is processed correctly

### 4. **Permission Testing**
- Tests admin users can start drafts (as league owners)
- Verifies regular users can start drafts (when added as league members)
- Confirms proper error handling for unauthorized access

## 🚨 Troubleshooting

### Server Not Available
```
❌ GraphQL server is not available: fetch failed
⚠️  Server not available - test cannot run
💡 To run this test:
   1. Start the GraphQL server: cd lambdas/db && npm run dev
   2. Run this test again
```

**Solution**: Start the GraphQL server as shown

### JWT Generation Failed
```
❌ Failed to generate JWT for admin@test.com: Error: Failed to extract JWT from CLI output
```

**Solutions**:
1. Ensure CLI is working: `npx tsx --tsconfig tsconfig.base.json apps/cli/src/main.ts generate-jwt --email test@example.com`
2. Check database connection (CLI falls back to mock users if DB unavailable)
3. Verify Node.js and tsx are installed

### GraphQL Errors
```
❌ GraphQL error: Authentication required to start draft
```

**Solutions**:
1. Check JWT generation is working
2. Verify the JWT is being sent in Authorization header
3. Confirm the GraphQL server recognizes the JWT format

### Database Connection Issues
```
❌ TEST FAILED!
Error: User does not have access to this league
```

**Solutions**:
1. Ensure database is running and accessible
2. Check if test user was added to the league successfully
3. Verify league creation worked correctly

## 📊 Success Criteria

The test passes when:
- ✅ GraphQL server is accessible
- ✅ JWT generation works for both admin and user
- ✅ Test league is created successfully
- ✅ Initial draft status is `not-started`
- ✅ `startDraft` mutation returns `queued` status
- ✅ Draft status persists when queried again
- ✅ Multiple consecutive queries show consistent status
- ✅ Different draft types are accepted
- ✅ Invalid draft types are rejected

## 🔧 Integration with CI/CD

This test can be integrated into your CI/CD pipeline:

```yaml
# Example GitHub Actions step
- name: Test Draft Status Update
  run: |
    # Start GraphQL server in background
    cd lambdas/db && npm run dev &
    sleep 10  # Wait for server to start
    
    # Run the test
    npm run test:draft-status
    
    # Clean up
    pkill -f "npm run dev"
```

## 📚 Related Files

- **Test Implementation**: `test-draft-status.ts`
- **GraphQL Schema**: `lambdas/db/src/schema/leagues.ts` (startDraft mutation)
- **JWT Generation**: `apps/cli/src/commands/generateJwt.ts`
- **E2E Test Alternative**: `tests/e2e/draft-status-update.spec.ts` (Playwright version)
- **Existing E2E Test**: `lambdas/db/src/leagues-draft-e2e.test.ts`

This test provides confidence that the draft status update functionality works correctly and helps catch regressions in the draft system.
