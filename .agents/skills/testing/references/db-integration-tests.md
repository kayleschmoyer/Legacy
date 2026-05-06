# DB Integration Tests — Patterns and Rules

DB integration tests (`*.db.spec.ts`) run Jest against a **real PostgreSQL database** — either local Docker or the dev RDS via SSM tunnel. The DB may contain real production data (players, real leagues owned by real users). All patterns below exist to keep tests isolated from that data.

## Fixture Model

### Pre-seeded Users (IDs 1–3)

Three test users are upserted once at setup time by `ensureTestFixtures()` in `integration-test-setup.ts` and are **never deleted**:

| ID  | Email                    | Username    | Role  |
| --- | ------------------------ | ----------- | ----- |
| 1   | test.user@example.com    | testuser    | none  |
| 2   | admin@example.com        | admin       | admin |
| 3   | league.owner@example.com | leagueowner | none  |

Use these as league owners, team members, etc. **Do not re-insert them** in spec files — they already exist.

### Real Players via `getTestPlayers()`

Player rows are real data already in the DB. Never insert test players. Use `getTestPlayers()` (exported from `integration-test-setup.ts`) to get a slice of real player rows:

```typescript
import { getTestPlayers } from '../../integration-test-setup';

const [p0, p1, p2] = getTestPlayers(); // first 3 players
const players = getTestPlayers().slice(0, 8); // 8 players for 4-team draft
```

`getTestPlayers()` requires at least 8 players in the DB (checked at setup; throws if fewer). It returns the same rows every run within a session — deterministic.

### Cleanup Invariant

`cleanupTestData()` deletes:

- `DELETE FROM leagues WHERE owner IN (1, 2, 3)` — cascade-deletes teams, drafts, matchups, draft_picks, matchup_players, league_members, draft_teams, team_members
- `DELETE FROM leagues WHERE owner BETWEEN 100 AND 119` — bulk-test league cleanup
- `DELETE FROM app_internal.users WHERE id BETWEEN 100 AND 119` — bulk-test user cleanup

It **never truncates** and never touches:

- Real players (`players` table)
- Real leagues owned by real users
- Pre-seeded users 1–3

Calls `cleanupTestData()` in both `beforeEach` and `afterEach`.

## Critical Rules

### 1. Never use hardcoded fixture IDs for league inserts

League fixture IDs (1, 2, etc. from `__fixtures__/leagues.json`) collide with real leagues in the DB that are owned by real users. `cleanupTestData()` only deletes leagues owned by users 1–3; it cannot delete a real league with the same ID.

**Wrong:**

```typescript
const league = getLeague(0);
await db.insert(leagues).values({ id: league.id, name: league.name, owner: user.id, ... });
```

**Correct:** omit `id`, use `.returning()` to get the DB-assigned ID:

```typescript
const leagueFixture = getLeague(0);
const [league] = await db
  .insert(leagues)
  .values({
    name: leagueFixture.name,
    owner: user.id,
    inviteCode: leagueFixture.inviteCode,
  })
  .returning();
// use league.id (DB-generated) for all subsequent operations
```

Team fixture IDs (1–4) appear safe because real teams have IDs in the thousands, but the same defensive pattern is recommended for any entity that could conflict.

### 2. Scope all queries to the test entity

Queries without a WHERE clause scoped to the test's own data will pick up rows from real leagues and match the wrong count.

**Wrong:**

```typescript
const scheduled = await db
  .select()
  .from(matchups)
  .where(eq(matchups.status, 'scheduled'));
expect(scheduled).toHaveLength(1); // fails — real DB has hundreds
```

**Correct:**

```typescript
import { and, eq } from 'drizzle-orm';

const scheduled = await db
  .select()
  .from(matchups)
  .where(
    and(eq(matchups.leagueId, league.id), eq(matchups.status, 'scheduled')),
  );
expect(scheduled).toHaveLength(1);
```

The same applies to:

- `WHERE selectionMethod = 'random'` → scope with `AND leagueId = league.id`
- `WHERE weekNumber = 2` → scope with `AND leagueId = league.id`
- `WHERE owner = userId` → scope with `AND id IN (l1.id, l2.id)` for multi-league tests
- JOIN queries without a WHERE → add `WHERE matchups.leagueId = league.id`

### 3. Isolated users for CRUD tests

`users.db.spec.ts` cannot use pre-seeded users 1–3 for create/update/delete tests because those rows are permanent. Use a dedicated ID range (200+) with a unique email domain so cleanup can be scoped:

```typescript
const CRUD_USERS = [
  { id: 200, email: 'user-200@users-spec.example.com', ... },
] as const;

beforeEach(async () => {
  await db.execute(sql`DELETE FROM app_internal.users WHERE email LIKE '%@users-spec.example.com'`);
});
```

## Seed Helper Pattern

All spec files use a `seedXxx()` helper that inserts the minimum prerequisites, returns the actual DB row (with auto-generated ID), and is called in each test that needs it:

```typescript
async function seedUserAndLeague() {
  const user = getUser(1); // pre-seeded — no insert
  const leagueFixture = getLeague(0);
  const [league] = await db
    .insert(leagues)
    .values({
      name: leagueFixture.name,
      owner: user.id,
      inviteCode: leagueFixture.inviteCode,
    })
    .returning();
  return { user, league }; // league has the DB-generated id
}
```

## Imports Reference

```typescript
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
  integrationTestInternalSchema, // only needed for app_internal writes (users.db.spec.ts)
} from '../../integration-test-setup';
import { getLeague, getTeam, getUser } from '../__fixtures__';
```

`integrationTestSchema` = `PublicSchema` (Drizzle schema for `public.*` tables).
`integrationTestInternalSchema` = `InternalSchema` (Drizzle schema for `app_internal.*` — needed only when inserting/updating `app_internal.users`).

## Minimum Player Count

`getTestPlayers()` enforces a minimum of **8 players** at setup (needed for 4-team × 2-round snake drafts: 4 × 2 = 8 unique picks). If the DB has fewer than 8 players, setup throws:

```
DB integration tests require at least 8 players in the players table (found N)
```

Fix: restore the DB from backup (`make db-restore`) or seed player data.
