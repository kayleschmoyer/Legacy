# Fixtures and Snapshots Guide

## 📋 Overview

This guide explains how to use JSON fixtures and Jest snapshots for robust, maintainable testing in the DB Lambda project.

## 🎯 Quick Start

### Using Fixtures in Tests

```typescript
import { fixtures, getPlayer, getLeague } from './__fixtures__';

describe('My Test Suite', () => {
  it('should work with fixture data', () => {
    const player = getPlayer(0); // Returns Mike Trout
    expect(player.firstName).toBe('Mike');
    expect(player.lastName).toBe('Trout');
  });
});
```

### Using Snapshots

```typescript
it('should match snapshot for GraphQL response', () => {
  const result = getPlayerStats(playerId);
  expect(result).toMatchSnapshot();
});
```

## 📂 Fixture Files Available

| File               | Description       | Sample Data                            |
| ------------------ | ----------------- | -------------------------------------- |
| `players.json`     | Baseball players  | Mike Trout, Aaron Judge, Shohei Ohtani |
| `users.json`       | User accounts     | Test user, admin, league owner         |
| `leagues.json`     | Fantasy leagues   | Alpha League, Beta League              |
| `teams.json`       | Fantasy teams     | Alpha, Beta, Gamma, Delta teams        |
| `matchups.json`    | Matchup data      | Week 1 completed, Week 2 scheduled     |
| `careerStats.json` | Career statistics | Batting stats, pitching stats          |

## 🔧 Integration Test Pattern

### Before (Manual Data Creation)

```typescript
it('should create a league', () => {
  const db = createTestDatabase();

  // Manual data creation - tedious and error-prone
  const insertLeague = db.prepare(
    'INSERT INTO leagues (name, owner, max_roster_size, invite_code) VALUES (?, ?, ?, ?)',
  );

  insertLeague.run('Test League', 1, 25, 'ABC123');

  const result = getLeagueById(db, 1);
  expect(result?.name).toBe('Test League');
  expect(result?.maxRosterSize).toBe(25);
});
```

### After (Using Fixtures)

```typescript
import { fixtures, getLeague } from '../__fixtures__';

it('should create a league', () => {
  const db = createTestDatabase();
  const league = getLeague(0); // Test League Alpha with all fields

  const insertLeague = db.prepare(
    'INSERT INTO leagues (id, name, owner, max_roster_size, invite_code, min_games_per_season, games_per_matchup) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  insertLeague.run(
    league.id,
    league.name,
    league.owner,
    league.maxRosterSize,
    league.inviteCode,
    league.minGamesPerSeason,
    league.gamesPerMatchup,
  );

  const result = getLeagueById(db, league.id);
  expect(result).toMatchSnapshot(); // Captures full structure
});
```

## 📸 Snapshot Testing Benefits

### 1. Regression Detection

```typescript
it('should return consistent GraphQL schema', () => {
  const schema = getGraphQLSchema();
  expect(schema).toMatchSnapshot();
});
```

If someone accidentally changes the schema, the test fails and shows the diff.

### 2. Complex Object Testing

```typescript
it('should return properly formatted player with stats', () => {
  const player = getPlayer(0);
  const result = getPlayerWithCareerStats(player.id);

  // Instead of 20+ expect statements, one snapshot captures it all
  expect(result).toMatchSnapshot();
});
```

### 3. API Response Validation

```typescript
it('should return matchup with correct structure', () => {
  const matchup = getMatchup(0);
  const response = getMatchupById(matchup.id);

  expect(response).toMatchSnapshot({
    // Dynamic fields can be matchers
    startTime: expect.any(String),
    endTime: expect.any(String),
  });
});
```

## 🔄 Updating Snapshots

When you **intentionally** change output:

```bash
# Update all snapshots
pnpm exec nx run db:test --updateSnapshot

# Update specific test file
pnpm exec nx run db:test --testNamePattern="leagues" --updateSnapshot
```

**⚠️ Always review the diff** before updating snapshots!

## 🎨 Snapshot Best Practices

### ✅ DO

- **Use snapshots for complex objects** with many fields
- **Snapshot GraphQL responses** to catch schema changes
- **Review diffs carefully** before updating
- **Commit snapshots** to version control
- **Use property matchers** for dynamic values

### ❌ DON'T

- **Snapshot simple primitives** (use `toBe()` instead)
- **Snapshot dates/timestamps** without matchers
- **Update blindly** without reviewing changes
- **Mix too many concerns** in one snapshot

## 🧪 Example: Converting Existing Test

### Original Test (Manual Assertions)

```typescript
it('should get team by id', () => {
  const db = createTestDatabase();

  const insertLeague = db.prepare(
    'INSERT INTO leagues (id, name, owner) VALUES (?, ?, ?)',
  );
  insertLeague.run(1, 'Test League', 1);

  const insertTeam = db.prepare(
    'INSERT INTO teams (id, name, league_id) VALUES (?, ?, ?)',
  );
  insertTeam.run(1, 'Test Team', 1);

  const result = getTeamById(db, 1);

  expect(result).toBeDefined();
  expect(result?.id).toBe(1);
  expect(result?.name).toBe('Test Team');
  expect(result?.leagueId).toBe(1);
});
```

### Improved Test (Fixtures + Snapshot)

```typescript
import { getLeague, getTeam } from '../__fixtures__';

it('should get team by id', () => {
  const db = createTestDatabase();
  const league = getLeague(0);
  const team = getTeam(0);

  // Seed database
  const insertLeague = db.prepare(
    'INSERT INTO leagues (id, name, owner) VALUES (?, ?, ?)',
  );
  insertLeague.run(league.id, league.name, league.owner);

  const insertTeam = db.prepare(
    'INSERT INTO teams (id, name, league_id) VALUES (?, ?, ?)',
  );
  insertTeam.run(team.id, team.name, team.leagueId);

  const result = getTeamById(db, team.id);

  // Single snapshot captures entire structure
  expect(result).toMatchSnapshot();
});
```

**Snapshot file (`__snapshots__/teams.resolver.integration.spec.ts.snap`):**

```javascript
exports[`should get team by id 1`] = `
Object {
  "id": 1,
  "leagueId": 1,
  "name": "Test Team Alpha",
}
`;
```

## 🚀 Advanced Patterns

### Snapshot with Property Matchers

```typescript
it('should create matchup with timestamps', () => {
  const result = createMatchup(data);

  expect(result).toMatchSnapshot({
    // Match types, not exact values
    startTime: expect.any(String),
    endTime: expect.any(String),
    id: expect.any(Number),
  });
});
```

### Inline Snapshots

```typescript
it('should format player name', () => {
  const player = getPlayer(0);
  const result = formatPlayerName(player);

  expect(result).toMatchInlineSnapshot(`"Mike Trout"`);
});
```

### Multiple Snapshots in One Test

```typescript
it('should handle different user types', () => {
  const testUser = getUser(0);
  const adminUser = getUser(1);

  expect(testUser).toMatchSnapshot('test-user');
  expect(adminUser).toMatchSnapshot('admin-user');
});
```

## 📊 Test Coverage Improvement

With fixtures and snapshots, your test coverage improves:

- **Before**: Testing 3-4 fields manually
- **After**: Snapshot captures **all** fields automatically

If you add a new field to the schema, the snapshot test will:

1. Fail (showing the new field)
2. Prompt you to review
3. Update with `--updateSnapshot`
4. Ensure the field is present in future tests

## 🔍 Finding What to Snapshot

Good candidates for snapshots:

1. **GraphQL resolver responses**
2. **Database query results with many fields**
3. **Complex calculated data** (statistics, projections)
4. **API response formats**
5. **Configuration objects**
6. **Error messages and structures**

## 📚 Resources

- [Jest Snapshot Documentation](https://jestjs.io/docs/snapshot-testing)
- [Fixtures Pattern](https://martinfowler.com/bliki/ObjectMother.html)
- Project fixtures: `lambdas/db/src/__fixtures__/`

## ✅ Migration Checklist

To migrate existing tests to use fixtures and snapshots:

- [x] Create `__fixtures__/` directory
- [x] Add JSON fixture files (players, users, leagues, teams, matchups, stats)
- [x] Create `index.ts` fixture loader with helpers
- [ ] Update integration tests to use fixtures
- [ ] Add snapshots for GraphQL responses
- [ ] Add snapshots for complex query results
- [ ] Document patterns in test files
- [ ] Add snapshots to `.gitignore` exceptions (should be committed)
- [ ] Update CI to include snapshot tests

---

**Remember**: Fixtures provide the **data**, snapshots verify the **structure**. Together, they create robust, maintainable tests! 🎉
