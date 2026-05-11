# Test Data Determinism

Rules for test fixtures, mocks, and seed data. Complement to [e2e-determinism](../../testing/references/e2e-determinism.md), focused on the **data side** of test determinism rather than the runtime side.

## Rules

### 1. No `Math.random()` or `Date.now()` in test data

Story files, fixtures, and mock generators must produce identical output across runs. Already enforced by the top-review-findings rule "Deterministic story data."

```ts
// ❌ Bad
export const mockLeague = {
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  members: Array.from({ length: 10 }, (_, i) => ({
    id: i,
    score: Math.random() * 100,
  })),
};

// ✅ Good
export const mockLeague = {
  id: '00000000-0000-0000-0000-000000000001',
  createdAt: new Date('2026-01-01T00:00:00Z').getTime(),
  members: Array.from({ length: 10 }, (_, i) => ({
    id: i,
    score: (i * 17) % 100,
  })),
};
```

### 2. Use canonical config values in mock data

Mock data must use the same config constants as production. Ad-hoc values drift.

```ts
// ❌ Bad — magic number that may not match config
const mockDraft = { rounds: 25 };

// ✅ Good
import { DEFAULT_DRAFT_ROUNDS } from '@legacy-sports/draft-config';
const mockDraft = { rounds: DEFAULT_DRAFT_ROUNDS };
```

### 3. Fixtures own a stable ID range

Production data uses one ID range; test fixtures use another. This prevents collisions and makes cleanup queries simple (`DELETE FROM x WHERE id IN test-range`).

For this codebase: bulk-test users live in IDs 100–119; per-test users use IDs 1–3. See [db-integration-tests.md](../../testing/references/db-integration-tests.md).

### 4. Cleanup is targeted, never `TRUNCATE`

`cleanupTestData()` deletes only test-owned rows. The DB may contain real data (real players, real leagues) that must be preserved. `TRUNCATE` is forbidden.

### 5. Schema mirrors are forbidden

Tests must import the production schema (`PublicSchema` re-exported as `integrationTestSchema`). A hand-maintained SQLite schema mirror diverges and produces tests that pass locally but fail in production-shape conditions.

### 6. Seeded factories over inline literals

Repeated mock construction belongs in factories with deterministic seeds.

```ts
// ❌ Bad — drift across files
const mockUser = { id: 'u1', name: 'Test User', email: 'test@example.com' };

// ✅ Good — factory ensures consistency
const mockUser = userFactory.build({ seed: 'commissioner-of-league-1' });
```

### 7. Cover non-equal-modulo edge cases

For algorithms that distribute things (rotation, scoring, scheduling): test both equal-modulo cases (10 items / 5 buckets = 2 each) AND non-equal-modulo cases (11 items / 5 buckets = 3,2,2,2,2). Already in the top review findings.

## Related

- [coding-standards.md](coding-standards.md) — broader test patterns from review findings
- [e2e-determinism.md](../../testing/references/e2e-determinism.md) — runtime-side determinism for E2E
- [db-integration-tests.md](../../testing/references/db-integration-tests.md) — fixture model and cleanup
