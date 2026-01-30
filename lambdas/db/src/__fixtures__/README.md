# Test Fixtures

This directory contains reusable test data for integration and unit tests.

## 📁 Structure

```
__fixtures__/
├── players.json         # Sample player data
├── users.json          # Sample user accounts
├── leagues.json        # Sample leagues
├── teams.json          # Sample teams
├── matchups.json       # Sample matchup data
├── careerStats.json    # Sample career statistics
├── index.ts            # Fixture loader and helpers
└── README.md           # This file
```

## 🎯 Usage

### Basic Import

```typescript
import { fixtures } from '../__fixtures__';

// Access fixture data
const player = fixtures.players[0]; // Mike Trout
const league = fixtures.leagues[0]; // Test League Alpha
```

### Using Helper Functions

```typescript
import { getPlayer, getLeague, findFixture } from '../__fixtures__';

// Get a specific player (returns fresh copy)
const player = getPlayer(0); // Mike Trout
player.firstName = 'Modified'; // Won't affect original fixture

// Find by predicate
const adminUser = findFixture('users', (u) => u.accessLevel === 'admin');
```

### In Integration Tests

```typescript
describe('Players Resolver - Integration Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();

    // Seed database with fixture data
    const insertPlayer = db.prepare(
      'INSERT INTO players (id, first_name, last_name, bref_id) VALUES (?, ?, ?, ?)',
    );

    fixtures.players.forEach((player) => {
      insertPlayer.run(
        player.id,
        player.firstName,
        player.lastName,
        player.brefId,
      );
    });
  });

  it('should retrieve player by ID', () => {
    const player = getPlayer(0); // Mike Trout
    const result = getPlayerById(db, player.id);

    expect(result).toMatchSnapshot(); // Snapshot the response
  });
});
```

## ✅ Benefits

1. **Consistency**: Same test data across all tests
2. **Maintainability**: Update once, affects all tests
3. **Readability**: Tests focus on behavior, not data setup
4. **Type Safety**: TypeScript-aware fixture helpers
5. **Immutability**: Helper functions return fresh copies

## 📸 With Snapshots

Fixtures work great with Jest snapshots:

```typescript
it('should return properly formatted player stats', () => {
  const player = getPlayer(0);
  const result = getPlayerCareerStats(player.id);

  // Captures entire response structure
  expect(result).toMatchSnapshot();
});
```

## 🔄 Updating Fixtures

When adding new fixture data:

1. Add JSON file to this directory
2. Import in `index.ts`
3. Add to `fixtures` object
4. Create type-safe getter helper (optional)
5. Document in this README

## 📝 Best Practices

- **Keep fixtures minimal**: Only include data needed for tests
- **Use realistic values**: Helps catch real-world issues
- **Don't share state**: Use helper functions to get fresh copies
- **Version control**: Commit fixture files to git
- **Update snapshots**: Run `--updateSnapshot` after intentional changes
