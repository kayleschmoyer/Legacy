# E2E & Integration Test Determinism

The 12 levers that eliminate flake from end-to-end and integration tests. **Every E2E or integration test must satisfy all applicable levers** before merge. The pre-PR checklist gates on this.

Flake is treated as a P1 bug in this codebase. A test that "sometimes passes" trains the team to ignore failures, which then masks real bugs. Recent commits ([f73b142](../../../) — live-draft-ui Phase 7, [9a4ff17](../../../) — full-season-ui Phase 4) demonstrate the cost of letting determinism slip and the work required to recover it.

This document consolidates patterns that already exist in [playwright-best-practices.md](playwright-best-practices.md) and adds the missing levers.

## The 12 levers

### 1. No real time

Inject the clock. Freeze `Date.now()`. Advance time explicitly when needed.

```ts
// ❌ Bad — depends on real wall-clock
await page.waitForTimeout(2000);

// ❌ Bad — uses real Date in assertions
expect(record.createdAt).toBeCloseTo(Date.now(), -3);

// ✅ Good — frozen / injected clock
await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
await page.clock.fastForward('00:30');
```

For backend code under test: inject the clock as a dependency rather than calling `Date.now()` directly.

### 2. No real randomness

Seed every RNG. Seed UUIDs. Capture the seed in failure output.

```ts
// ❌ Bad — different IDs each run
const id = crypto.randomUUID();

// ✅ Good — seeded test factory
const id = testFactory.uuid('league'); // returns deterministic UUID per name + test
```

For property-based tests, log the seed on failure so the run is reproducible.

### 3. No `waitForTimeout` — wait for conditions

This is the **#1 source of flake** in this codebase. Every `waitForTimeout` call is a race waiting to happen. Wait for _what you actually need_, not for _time_.

```ts
// ❌ Bad — racing on duration
await page.click('#submit');
await page.waitForTimeout(500);
await expect(page.locator('#result')).toBeVisible();

// ✅ Good — waits exactly as long as needed, no longer
await page.click('#submit');
await expect(page.locator('#result')).toBeVisible();
```

For backend state changes that the UI doesn't reflect, **poll the backend status** rather than guess at duration. See [ui-serial-phases.md](ui-serial-phases.md).

### 4. No shared state across tests

Each test creates its own fixtures, owns its own user/league/draft, and tears down. Two tests that depend on the same data fail when run in parallel — and CI runs tests in parallel.

```ts
// ❌ Bad — shared league
const SHARED_LEAGUE_ID = 'league-1';
test('test A', () => {
  /* mutates league-1 */
});
test('test B', () => {
  /* expects league-1 in initial state */
});

// ✅ Good — per-test fixtures
test('test A', async () => {
  const league = await fixtures.createLeague();
  // …
});
test('test B', async () => {
  const league = await fixtures.createLeague();
  // …
});
```

This applies to **integration tests** especially — see [integration-testing.md](integration-testing.md) for the test-user pool pattern that prevents cross-test interference.

### 5. Idempotent setup

Fixture creation must succeed on a dirty DB or refuse to run. No "delete if exists" half-measures that mask broken state.

```ts
// ❌ Bad — masks state corruption
async function setupLeague() {
  await db.delete('leagues').where('owner', testUser.id);
  return db.insert('leagues').values({ owner: testUser.id });
}

// ✅ Good — fail loud if state is unexpected
async function setupLeague() {
  const existing = await db.select('leagues').where('owner', testUser.id);
  if (existing.length > 0) {
    throw new Error(
      `Test user ${testUser.id} has stale leagues — clean up failed in a prior run`,
    );
  }
  return db.insert('leagues').values({ owner: testUser.id });
}
```

### 6. Hermetic network in unit-style E2E

`apps/web-e2e/src/tests/` is hermetic — no real backend. `route.fulfill()` for explicit responses, `route.fallback()` to cascade to baseline mocks. **Never `route.continue()`** in this directory.

`apps/web-e2e/src/integration/tests/` is the exception — those tests run against the live backend by design. See [Integration vs E2E directory distinction](../SKILL.md#integration-vs-e2e-directory-distinction).

### 7. Stable selectors

`data-testid` first, role+name second, never CSS classes or text that ships in copy.

```ts
// ❌ Bad — couples to styling
await page.locator('.btn-primary.submit-btn').click();

// ❌ Bad — couples to copy
await page.getByText('Submit').click();

// ✅ Good — semantic
await page.getByRole('button', { name: 'Submit' }).click();

// ✅ Good — explicit test contract
await page.getByTestId('submit-draft').click();
```

When adding `data-testid` to production code, use **stable, semantic IDs** — not test-specific names. `submit-draft-button` is good; `e2e-test-3-submit` is not.

### 8. Deterministic ordering

Never rely on map / object iteration order, network response order, or filesystem order. Sort before assert.

```ts
// ❌ Bad — relies on response order
const players = await api.getPlayers();
expect(players[0].name).toBe('Acuna Jr.');

// ✅ Good — sort, then assert
const players = await api.getPlayers();
const sorted = players.toSorted((a, b) => a.name.localeCompare(b.name));
expect(sorted[0].name).toBe('Abreu');
```

For UI assertions: assert the set of items present (`expect(items).toEqual(expect.arrayContaining([…]))`) rather than the order, unless ordering is the behavior under test.

### 9. Single source of truth for "ready"

For backend async work that the UI eventually reflects: poll the **backend status** rather than guess at the UI state. Recent precedent: [9a4ff17](../../../) added `draftStatus` polling to replace timeout-based "wait for draft to complete" logic.

```ts
// ❌ Bad — guesses at the UI
await page.click('#start-draft');
await page.waitForTimeout(5000);
await expect(page.getByText('Draft complete')).toBeVisible();

// ✅ Good — polls the source of truth
await page.click('#start-draft');
await pollUntil(
  () => api.getDraftStatus(draftId),
  (s) => s === 'COMPLETE',
  { timeoutMs: 30_000 },
);
await expect(page.getByText('Draft complete')).toBeVisible();
```

### 10. Failure forensics built in

Every test must capture trace, video, network log, console, and (for integration tests) server logs **on failure**. Re-running to diagnose is a sign of insufficient instrumentation.

Configured in `playwright.config.ts` and `playwright.integration.config.ts`:

- `trace: 'retain-on-failure'`
- `video: 'retain-on-failure'`
- `screenshot: 'only-on-failure'`

For new test files: ensure failure artifacts are uploaded by the CI workflow. See [run-e2e-headless.md](run-e2e-headless.md).

### 11. Quarantine, don't disable

A flaky test moves to the `@flaky` tag with an **auto-filed Jira ticket**. Never `.skip()` or `.fixme()` without a tracking ticket — the test becomes invisible.

```ts
// ❌ Bad — invisible until someone notices
test.skip('flaky-thing', async () => {
  /* … */
});

// ✅ Good — quarantined with tracking
test('flaky-thing', { tag: '@flaky' }, async () => {
  /* … */
}); // LS-####
```

The `@flaky` tag excludes the test from the blocking-required suite while leaving it visible in CI runs and metrics. See [test-tagging-guide.md](test-tagging-guide.md).

### 12. Flake budget

Track flake rate per suite. **>1% failure rate triggers a stop-the-line ticket** to investigate the suite as a whole, not just individual tests.

The CI Playwright report (`playwright-report/pr-<N>/`) captures per-test pass/fail rates over time. When investigating a possible flake, pull historical data first to distinguish "this test is flaky" from "this run is broken."

## Stress-running

Before declaring a flake fixed, **stress-run locally**:

```bash
# Run a single test 50 times (Playwright)
pnpm exec nx e2e web-e2e -- --grep="test name" --repeat-each=50

# For Jest
pnpm exec nx run <project>:test -- --testPathPatterns="SpecName" --runInBand --testNamePattern="case" -- --repeat=50
```

Zero failures across 50 runs is the bar. Less is statistical noise.

## Anti-patterns (recap)

- ❌ `waitForTimeout` to "give it time"
- ❌ `route.continue()` in `apps/web-e2e/src/tests/`
- ❌ Real `Date.now()` / `Math.random()` / `crypto.randomUUID()` in test code
- ❌ Shared fixtures across tests
- ❌ "Delete if exists" cleanup that masks state corruption
- ❌ Selectors coupled to CSS classes or user-visible copy
- ❌ Order-dependent assertions
- ❌ Adding retries to "fix" flake
- ❌ `test.skip` without a tracking ticket
- ❌ "It passed 3 times in a row" — needs 50

## Related

- [playwright-best-practices.md](playwright-best-practices.md) — the broader Playwright reference
- [test-tagging-guide.md](test-tagging-guide.md) — `@flaky`, `@critical`, etc.
- [ui-serial-phases.md](ui-serial-phases.md) — patterns for multi-phase UI flows
- [integration-testing.md](integration-testing.md) — test-user pool pattern
- [04-ci-flaky-triage entrypoint](../../dev-process/entrypoints/04-ci-flaky-triage.md) — process for fixing flake when discovered
