# Integration Testing with SQLite In-Memory

This directory contains integration tests that run against a real SQLite in-memory database - **no Docker required!**

## Overview

**Integration tests** complement our unit tests by:

- ✅ Executing real SQL queries against SQLite
- ✅ Validating database constraints, indexes, and foreign keys
- ✅ Testing transaction behavior and rollbacks
- ✅ Catching SQL syntax errors and Drizzle ORM issues
- ✅ Verifying cascade deletes and foreign key constraints
- ✅ **Running in milliseconds** (no container startup time)
- ✅ **Working on any machine** (no Docker installation needed)

Unlike unit tests (which mock the database), integration tests provide **confidence that your code works with a real database**.

## Why SQLite In-Memory?

### Advantages

✅ **No Docker Required** - Works on any development machine without Docker Desktop  
✅ **Blazing Fast** - Database created in milliseconds (vs 10-15 seconds for containers)  
✅ **Zero Configuration** - No connection strings, ports, or environment variables  
✅ **Perfect Isolation** - Each test run gets a completely fresh database  
✅ **CI/CD Friendly** - Runs anywhere without Docker-in-Docker complexity  
✅ **Resource Efficient** - No memory-hungry containers or network overhead

### Trade-offs

⚠️ **Different SQL Engine** - SQLite syntax differs slightly from PostgreSQL:

- No `TRUNCATE` (use `DELETE` instead)
- No arrays or JSONB (use TEXT/JSON)
- Some PostgreSQL-specific functions not available

⚠️ **Production Match** - Production uses PostgreSQL, not SQLite  
 → Drizzle ORM abstracts most differences  
 → Critical queries should still be tested in staging with real PostgreSQL

## Architecture

### Files

- **`integration-test-setup.ts`**: Database lifecycle management (create, cleanup, teardown)
- **`integration-test-global-setup.ts`**: Global setup (creates in-memory database once)
- **`integration-test-global-teardown.ts`**: Global teardown (closes database after all tests)
- **`jest.integration.config.ts`**: Jest configuration for integration tests (10s timeout)
- **`*.integration.spec.ts`**: Integration test files

### How It Works

1. **Global Setup** (once before all tests):
   - Creates SQLite in-memory database (`:memory:`)
   - Enables foreign key constraints
   - Runs database migrations
   - Keeps database in memory for all tests

2. **Before Each Test**:
   - Cleans all data from tables (maintains schema)
   - Resets auto-increment counters
   - Ensures test isolation

3. **Test Execution**:
   - Tests execute real SQL queries via Drizzle ORM
   - Database validates constraints, types, relationships
   - Tests can verify transactions, rollbacks, bulk operations

4. **After Each Test**:
   - Cleans all data (optional - for extra isolation)

5. **Global Teardown** (once after all tests):
   - Closes database connection
   - Releases memory

## Running Integration Tests

### Prerequisites

**None!** Just run `pnpm install` and you're ready to go.

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

### Performance

- **First Run**: ~2-3 seconds (migrations + tests)
- **Subsequent Runs**: ~1-2 seconds
- **Much faster than Docker**: No container startup, image pulling, or networking

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
    const [league] = await db
      .insert(PublicSchema.leagues)
      .values({
        name: 'Test League',
        owner: 123,
      })
      .returning();

    // Query back
    const found = await db.query.leagues.findFirst({
      where: eq(PublicSchema.leagues.id, league.id),
    });

    expect(found).toBeDefined();
    expect(found?.name).toBe('Test League');
  });

  it('should enforce foreign key constraints', async () => {
    // This should fail because league_id doesn't exist
    await expect(
      db.insert(PublicSchema.teams).values({
        name: 'Test Team',
        leagueId: 99999, // Non-existent league
      }),
    ).rejects.toThrow(); // SQLite will throw FOREIGN KEY constraint error
  });
});
```

### Using Raw SQL (When Needed)

For low-level queries, use the raw SQLite client:

```typescript
import { getTestClient } from '../integration-test-setup';

describe('Raw SQL Tests', () => {
  it('should execute raw SQL', () => {
    const client = getTestClient();

    // SQLite uses ? for parameters (not $1, $2 like PostgreSQL)
    const stmt = client.prepare(
      'INSERT INTO leagues (name, owner) VALUES (?, ?)',
    );
    const result = stmt.run('Raw League', 456);

    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBeGreaterThan(0);
  });

  it('should handle transactions', () => {
    const client = getTestClient();

    // SQLite transaction syntax
    client.prepare('BEGIN').run();

    try {
      client
        .prepare('INSERT INTO leagues (name, owner) VALUES (?, ?)')
        .run('League 1', 100);
      client
        .prepare('INSERT INTO leagues (name, owner) VALUES (?, ?)')
        .run('League 2', 200);
      client.prepare('COMMIT').run();
    } catch (error) {
      client.prepare('ROLLBACK').run();
      throw error;
    }

    const count = client
      .prepare('SELECT COUNT(*) as count FROM leagues')
      .get() as { count: number };
    expect(count.count).toBe(2);
  });
});
```

## SQLite vs PostgreSQL Differences

### Parameterized Queries

```typescript
// PostgreSQL
client.query('SELECT * FROM leagues WHERE id = $1', [leagueId]);

// SQLite
client.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
```

### Transactions

```typescript
// PostgreSQL
await client.query('BEGIN');
await client.query('COMMIT');

// SQLite
client.prepare('BEGIN').run();
client.prepare('COMMIT').run();
```

### Table Cleanup

```typescript
// PostgreSQL
await client.query('TRUNCATE TABLE leagues CASCADE');

// SQLite
client.prepare('DELETE FROM leagues').run();
client.prepare('DELETE FROM sqlite_sequence').run(); // Reset auto-increment
```

### Type Differences

| Feature       | PostgreSQL       | SQLite                         |
| ------------- | ---------------- | ------------------------------ |
| **Arrays**    | ✅ `INTEGER[]`   | ❌ Use TEXT + JSON             |
| **JSONB**     | ✅ Native        | ⚠️ Use TEXT + `JSON_EXTRACT()` |
| **TRUNCATE**  | ✅ Fast truncate | ❌ Use DELETE                  |
| **RETURNING** | ✅ Full support  | ⚠️ Limited (single row)        |
| **Sequences** | ✅ Native        | ⚠️ `sqlite_sequence` table     |

**Most of these differences are handled by Drizzle ORM automatically!**

## Best Practices

### 1. Clean Data Between Tests

```typescript
beforeEach(async () => {
  await cleanupTestData(); // Ensures test isolation
});
```

### 2. Test Real Constraints

```typescript
it('should reject duplicate email addresses', async () => {
  await db.insert(PublicSchema.users).values({ email: 'test@example.com' });

  // Should fail on unique constraint
  await expect(
    db.insert(PublicSchema.users).values({ email: 'test@example.com' }),
  ).rejects.toThrow();
});
```

### 3. Test Foreign Key Cascades

```typescript
it('should cascade delete teams when league is deleted', async () => {
  const [league] = await db
    .insert(PublicSchema.leagues)
    .values({
      name: 'Test League',
      owner: 123,
    })
    .returning();

  await db.insert(PublicSchema.teams).values({
    name: 'Test Team',
    leagueId: league.id,
  });

  // Delete league (should cascade to teams)
  await db
    .delete(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, league.id));

  // Verify team was deleted
  const teams = await db.query.teams.findMany({
    where: eq(PublicSchema.teams.leagueId, league.id),
  });
  expect(teams).toHaveLength(0);
});
```

### 4. Test Transactions

```typescript
it('should rollback on error', async () => {
  const client = getTestClient();

  client.prepare('BEGIN').run();

  try {
    client
      .prepare('INSERT INTO leagues (name, owner) VALUES (?, ?)')
      .run('League 1', 100);

    // Simulate error
    throw new Error('Oops!');

    client.prepare('COMMIT').run();
  } catch (error) {
    client.prepare('ROLLBACK').run();
  }

  // Verify no data was inserted
  const count = client
    .prepare('SELECT COUNT(*) as count FROM leagues')
    .get() as { count: number };
  expect(count.count).toBe(0);
});
```

## Troubleshooting

### Tests Failing with "Database not initialized"

**Cause**: Global setup didn't run or failed

**Solution**:

1. Check that `jest.integration.config.ts` has `globalSetup` configured
2. Run tests with verbose mode: `pnpm exec nx test:integration db -- --verbose`
3. Check for migration errors in global setup output

### Foreign Key Constraint Failures

**Cause**: SQLite foreign keys disabled (default behavior)

**Solution**: We enable foreign keys in `integration-test-setup.ts`:

```typescript
sqliteDb.pragma('foreign_keys = ON');
```

Verify this is present in your setup file.

### "TRUNCATE not supported" Errors

**Cause**: SQLite doesn't support TRUNCATE

**Solution**: Use DELETE instead:

```typescript
// ❌ PostgreSQL only
await client.query('TRUNCATE TABLE leagues CASCADE');

// ✅ SQLite compatible
client.prepare('DELETE FROM leagues').run();
```

### Slow Test Performance

SQLite in-memory should be very fast. If tests are slow:

1. Check if you're running tests in parallel (should be serial: `maxWorkers: 1`)
2. Verify you're not creating new databases per test (should reuse global instance)
3. Check for network calls or external dependencies in tests

## Comparison: Unit vs Integration Tests

| Aspect           | Unit Tests                         | Integration Tests (SQLite)   |
| ---------------- | ---------------------------------- | ---------------------------- |
| **Speed**        | ⚡ Very Fast (~500ms for 33 tests) | ⚡ Fast (~2-3s for 10 tests) |
| **Setup**        | Simple (mocks)                     | Simple (in-memory DB)        |
| **Database**     | ❌ Mocked                          | ✅ Real SQL                  |
| **Constraints**  | ❌ Not validated                   | ✅ Validated                 |
| **Transactions** | ❌ Not tested                      | ✅ Tested                    |
| **Isolation**    | ✅ Perfect                         | ✅ Perfect                   |
| **Confidence**   | ⚠️ Medium                          | ✅ High                      |
| **Use Case**     | Business logic                     | Database integration         |

**Recommendation**: Use **both**!

- **Unit tests**: Fast feedback on business logic (mock database)
- **Integration tests**: Confidence in database interactions (real database)

## Migration from Testcontainers

If you previously used Testcontainers with PostgreSQL:

### What Changed

1. **No Docker** - Removed container orchestration
2. **Faster** - Milliseconds instead of 10-15 seconds
3. **SQLite Syntax** - Minor SQL differences (handled by Drizzle ORM)
4. **Simpler Setup** - No environment variables or connection strings

### Migration Steps

1. ✅ **Installed** `better-sqlite3` package
2. ✅ **Updated** `integration-test-setup.ts` (SQLite in-memory)
3. ✅ **Reduced** timeout in `jest.integration.config.ts` (10s)
4. ⚠️ **Review** raw SQL queries (PostgreSQL → SQLite syntax)
5. ✅ **Removed** Docker prerequisites

### SQL Syntax Changes

If you use raw SQL queries (not Drizzle ORM), update:

```typescript
// Before (PostgreSQL)
await client.query('SELECT * FROM leagues WHERE id = $1', [leagueId]);
await client.query('TRUNCATE TABLE leagues CASCADE');

// After (SQLite)
client.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
client.prepare('DELETE FROM leagues').run();
```

## Resources

- **Better SQLite3**: https://github.com/WiseLibs/better-sqlite3
- **Drizzle ORM**: https://orm.drizzle.team/
- **SQLite Documentation**: https://www.sqlite.org/docs.html
- **Jest Configuration**: https://jestjs.io/docs/configuration

## Summary

✅ **Integration tests with SQLite in-memory provide**:

- Real database validation
- No Docker dependency
- Blazing fast execution
- Perfect test isolation
- Simple CI/CD integration

✅ **Best for**:

- Database constraint validation
- Transaction testing
- Foreign key cascade testing
- Drizzle ORM integration validation

⚠️ **Remember**:

- SQLite is **not** PostgreSQL (minor syntax differences)
- Use Drizzle ORM to abstract database differences
- Test critical queries in staging with real PostgreSQL

---

**Next Steps**:

1. Run integration tests: `pnpm exec nx test:integration db`
2. Write integration tests for your resolvers
3. Combine with unit tests for comprehensive coverage
