# Integration Testing with Testcontainers

This directory contains integration tests that run against a real PostgreSQL database using [Testcontainers](https://testcontainers.com/).

## Overview

**Integration tests** complement our unit tests by:

- ✅ Executing real SQL queries against PostgreSQL
- ✅ Validating database constraints, indexes, and triggers
- ✅ Testing transaction behavior and rollbacks
- ✅ Catching SQL syntax errors and Drizzle ORM issues
- ✅ Verifying cascade deletes and foreign key constraints

Unlike unit tests (which mock the database), integration tests provide **confidence that your code works with a real database**.

## Architecture

### Files

- **`integration-test-setup.ts`**: Database lifecycle management (start, stop, cleanup)
- **`integration-test-global-setup.ts`**: Global setup (starts PostgreSQL container once)
- **`integration-test-global-teardown.ts`**: Global teardown (stops container after all tests)
- **`jest.integration.config.ts`**: Jest configuration for integration tests
- **`*.integration.spec.ts`**: Integration test files

### How It Works

1. **Global Setup** (once before all tests):
   - Starts PostgreSQL 15 container via Testcontainers
   - Runs database migrations
   - Keeps container running for all tests

2. **Before Each Test**:
   - Cleans all data from tables (maintains schema)
   - Ensures test isolation

3. **Test Execution**:
   - Tests execute real SQL queries via Drizzle ORM
   - Database validates constraints, types, relationships
   - Tests can verify transactions, rollbacks, bulk operations

4. **After Each Test**:
   - Cleans all data (optional - for extra isolation)

5. **Global Teardown** (once after all tests):
   - Stops PostgreSQL container
   - Cleans up resources

## Running Integration Tests

### Prerequisites

- **Docker**: Must be installed and running
  - Windows: Docker Desktop
  - Mac: Docker Desktop or Colima
  - Linux: Docker Engine

### Commands

```bash
# Run integration tests
pnpm exec nx test:integration db

# Run integration tests in watch mode
pnpm exec nx test:integration:watch db

# Run both unit and integration tests
pnpm exec nx test db && pnpm exec nx test:integration db

# Run all tests with coverage
pnpm exec nx test db --coverage && pnpm exec nx test:integration db --coverage
```

### First Run

The first run will take longer (~30-60 seconds) because:

1. Docker pulls the PostgreSQL image (if not cached)
2. Container starts and initializes
3. Database migrations run

Subsequent runs are faster (~10-20 seconds) as the image is cached.

## Writing Integration Tests

### Basic Example

```typescript
import { eq } from 'drizzle-orm';
import { getTestDatabase, cleanupTestData } from '../integration-test-setup';
import { PublicSchema } from '@legacy-sports/db-client';

describe('My Integration Tests', () => {
  const db = getTestDatabase();

  beforeEach(async () => {
    await cleanupTestData(); // Clean slate for each test
  });

  it('should insert and query from real database', async () => {
    // Insert using Drizzle ORM
    const [inserted] = await db
      .insert(PublicSchema.leagues)
      .values({
        name: 'Test League',
        owner: 123,
        maxRosterSize: 25,
      })
      .returning();

    // Query using Drizzle ORM
    const [queried] = await db
      .select()
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, inserted.id));

    // Assert
    expect(queried).toMatchObject({
      name: 'Test League',
      owner: 123,
    });

    // Use snapshots for complex responses
    expect(queried).toMatchSnapshot({
      id: expect.any(Number),
      inviteCode: expect.any(String), // Random values
    });
  });
});
```

### Testing Database Constraints

```typescript
it('should enforce unique constraint on invite code', async () => {
  // Insert first league
  await db.insert(PublicSchema.leagues).values({
    name: 'League 1',
    owner: 123,
    inviteCode: 'TEST1234',
  });

  // Try duplicate invite code
  await expect(async () => {
    await db.insert(PublicSchema.leagues).values({
      name: 'League 2',
      owner: 456,
      inviteCode: 'TEST1234', // Duplicate!
    });
  }).rejects.toThrow(/duplicate key value violates unique constraint/);
});
```

### Testing Transactions

```typescript
import { getTestClient } from '../integration-test-setup';

it('should support transactions', async () => {
  const client = getTestClient();

  await client.query('BEGIN');

  try {
    await client.query('INSERT INTO leagues (name, owner) VALUES ($1, $2)', [
      'League',
      123,
    ]);
    await client.query('INSERT INTO teams (name, league_id) VALUES ($1, $2)', [
      'Team',
      1,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  // Verify both inserted
  const leagues = await db.select().from(PublicSchema.leagues);
  expect(leagues).toHaveLength(1);
});
```

### Testing Cascade Deletes

```typescript
it('should cascade delete teams when league deleted', async () => {
  // Insert league and team
  const [league] = await db
    .insert(PublicSchema.leagues)
    .values({ name: 'League', owner: 123 })
    .returning();

  await db
    .insert(PublicSchema.teams)
    .values({ name: 'Team', leagueId: league.id });

  // Delete league
  await db
    .delete(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, league.id));

  // Verify cascade delete
  const teams = await db.select().from(PublicSchema.teams);
  expect(teams).toHaveLength(0);
});
```

## Best Practices

### ✅ DO

- Use `cleanupTestData()` in `beforeEach` for test isolation
- Use snapshots for complex nested responses
- Test database constraints (unique, foreign keys, not null)
- Test transaction behavior and rollbacks
- Test cascade deletes
- Test bulk operations and performance

### ❌ DON'T

- Don't rely on test execution order (use `beforeEach` cleanup)
- Don't test every edge case here (use unit tests for that)
- Don't make assertions on random values (use `expect.any(Number)`)
- Don't skip cleanup (causes test pollution)

## Performance

Integration tests are slower than unit tests:

- **Unit tests**: ~0.5-2 seconds total (mocked database)
- **Integration tests**: ~10-20 seconds total (real database + container startup)

**Run integration tests separately** to keep unit test feedback fast:

```bash
# Fast feedback (unit tests only)
pnpm exec nx test db

# Comprehensive validation (add integration tests)
pnpm exec nx test:integration db
```

## CI/CD Integration

### GitHub Actions Example

```yaml
jobs:
  integration-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: pnpm install

      - name: Run integration tests
        run: pnpm exec nx test:integration db
        timeout-minutes: 10
```

Note: GitHub Actions runners have Docker pre-installed, so Testcontainers works out of the box.

## Troubleshooting

### "Docker daemon not available"

**Problem**: Testcontainers can't connect to Docker.

**Solution**:

- Verify Docker is running: `docker ps`
- On Windows: Start Docker Desktop
- On Mac: Start Docker Desktop or Colima
- On Linux: Start Docker daemon: `sudo systemctl start docker`

### "Port already in use"

**Problem**: PostgreSQL container can't bind to port 5432.

**Solution**:

- Stop local PostgreSQL: `sudo systemctl stop postgresql`
- Or let Testcontainers use a random port (default behavior)

### "Timeout waiting for container"

**Problem**: Container takes too long to start.

**Solution**:

- Increase timeout in `jest.integration.config.ts`: `testTimeout: 120000`
- Check Docker resource limits (CPU, memory)
- Pull image manually: `docker pull postgres:15-alpine`

### "Migration failed"

**Problem**: Database migrations fail during setup.

**Solution**:

- Check migration files in `./migrations` directory
- Verify migrations are compatible with PostgreSQL 15
- Check migration order and dependencies
- Review error message for SQL syntax issues

### Tests are slow

**Problem**: Integration tests take a long time.

**Solution**:

- Use `--maxWorkers=1` (already configured - avoids database conflicts)
- Reduce test data volume
- Use bulk inserts instead of individual inserts
- Consider running integration tests only on CI (not locally every time)

## Comparison: Unit vs Integration Tests

| Feature              | Unit Tests             | Integration Tests      |
| -------------------- | ---------------------- | ---------------------- |
| **Speed**            | ⚡ Very fast (~0.5-2s) | 🐢 Slower (~10-20s)    |
| **Database**         | Mock (`jest.fn()`)     | Real PostgreSQL        |
| **SQL Execution**    | ❌ No                  | ✅ Yes                 |
| **Constraints**      | ❌ Not tested          | ✅ Tested              |
| **Transactions**     | ❌ Not tested          | ✅ Tested              |
| **Isolation**        | ✅ Perfect             | ✅ Good (with cleanup) |
| **Setup Complexity** | ✅ Simple              | ⚠️ Requires Docker     |
| **When to Run**      | ✅ Always              | ⚡ CI or before commit |

## Recommended Strategy

**Use both types of tests:**

1. **Unit tests** (`*.spec.ts`):
   - Fast feedback during development
   - Test business logic
   - Test edge cases and error handling
   - Mock database for speed

2. **Integration tests** (`*.integration.spec.ts`):
   - Validate database behavior
   - Test SQL correctness
   - Test constraints and relationships
   - Run before commits or in CI

**Example workflow:**

```bash
# During development (fast)
pnpm exec nx test db --watch

# Before committing (comprehensive)
pnpm exec nx test db && pnpm exec nx test:integration db

# In CI (both)
pnpm exec nx run-many -t test,test:integration
```

## Example: leagues.resolver.integration.spec.ts

See `src/schema/leagues.resolver.integration.spec.ts` for a comprehensive example covering:

- ✅ Basic CRUD operations with real database
- ✅ Constraint testing (unique invite codes)
- ✅ Cascade deletes with foreign keys
- ✅ Transaction support and rollbacks
- ✅ Bulk insert performance testing
- ✅ Snapshot testing for complex responses

## Resources

- [Testcontainers Documentation](https://testcontainers.com/)
- [Testcontainers Node.js](https://node.testcontainers.org/)
- [Jest Integration Testing](https://jestjs.io/docs/getting-started)
- [Drizzle ORM](https://orm.drizzle.team/)

---

**Questions?** Check the example test file or existing integration tests for patterns.
