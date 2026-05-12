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

This applies to **integration tests** especially — see [integration-testing.md](integration-testing.md#test-isolation--per-spec-setupteardown-required) for the per-spec setup/teardown doctrine ([LS-4356](https://legacysports.atlassian.net/browse/LS-4356) tracks the spec migration). A full **per-spec user pool** (JIT-registered ephemeral users that would also isolate user-level state across shards) is tracked as [LS-4357](https://legacysports.atlassian.net/browse/LS-4357) and not yet implemented — until it lands, shared-user contention is the dominant nightly failure mode, mitigated only by the write→read visibility pattern in [antipattern #3](#antipatterns-from-past-regressions--class-of-bug-catalog) below.

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

## Antipatterns from past regressions — class-of-bug catalog

These five patterns account for the bulk of nightly-only integration failures in this repo over the last six weeks. Each is documented with its symptom, why the obvious fix is wrong, and the right fix. When the [fix-integration-tests skill](../../fix-integration-tests/SKILL.md#class-of-bug-check--fix-the-pattern-not-the-phase) sends an agent here, it's because the root cause matches one of these — the agent's mandate is then to fix every instance of the pattern in the file/helper, or file an explicit follow-up listing them.

### 1. `expect.poll` callback throws instead of returning

**Ticket history:** [LS-4353](https://legacysports.atlassian.net/browse/LS-4353) (and the broader `waitForSeasonActive` regression chain LS-4237 → 4261 → 4278 → 4282 → 4287 → 4296 → 4306 → 4321 → 4344 → 4353).

**Symptom:** `expect.poll(...).toBe('completed')` fails with the callback's TypeError (`Cannot read property 'draftStatus' of null`) rather than retrying. Local single-spec runs are green; nightly trips on the same poll under load.

**Why the obvious fix is wrong:** `expect.poll` retries only on **assertion failures**, not on **callback throws**. Extending the timeout does nothing — the poll never gets a second attempt because the first one threw synchronously inside the callback.

**Right fix:** Make the callback return a sentinel (`null`) when the upstream data isn't ready, and let the poll's `.toBe(...)` assertion handle the retry:

```ts
// ❌ Bad — throws on null, poll does not retry
await expect
  .poll(async () => {
    const r = await gqlFetch(jwt, leagueQuery);
    return r.league.draftStatus; // TypeError if r.league is null
  })
  .toBe('completed');

// ✅ Good — returns null sentinel, poll retries on assertion failure
await expect
  .poll(
    async () => {
      const r = await gqlFetch(jwt, leagueQuery);
      return r.league?.draftStatus ?? null; // null → assertion fails → retry
    },
    { timeout: 60_000 },
  )
  .toBe('completed');
```

Update the callback's return type to include `null` so the type system catches future regressions. When fixing one callback, **grep the file and adjacent helpers for `expect\.poll` and audit every callback** — this antipattern shipped piecemeal across nine separate tickets because each fix touched only one phase.

### 2. UI-polling loops racing Apollo cache hydration

**Ticket history:** [LS-4321](https://legacysports.atlassian.net/browse/LS-4321), [LS-4344](https://legacysports.atlassian.net/browse/LS-4344). LS-4344 had to come along after LS-4321 to migrate the remaining callers of `waitForSeasonActive` to the backend-poll path.

**Symptom:** A loop of `page.goto(...)` + `waitForLoadState('networkidle')` + element check that flakes — sometimes the element is visible, sometimes not, even after the backend has clearly transitioned state.

**Why the obvious fix is wrong:** Apollo's cache update window is non-deterministic with respect to navigation. Extending the deadline, switching `load` → `networkidle`, or adding more reload iterations only narrows the race — it doesn't eliminate it. The UI is a derived view; polling it is polling a function of the actual source of truth.

**Right fix:** Poll the **backend** field directly via `expect.poll` on a `graphqlOk` query. Assert the UI once, after the backend signal has landed:

```ts
// ❌ Bad — races Apollo cache hydration
for (let i = 0; i < 20; i++) {
  await page.goto(`/baseball/league/${id}`);
  await page.waitForLoadState('networkidle');
  if (await page.getByTestId('season-active-badge').isVisible()) break;
}

// ✅ Good — poll backend; assert UI once
await expect
  .poll(
    async () => {
      const r = await gqlFetch(
        jwt,
        `query { league(id: ${id}) { seasonStatus } }`,
      );
      return r.league?.seasonStatus ?? null;
    },
    { timeout: 60_000 },
  )
  .toBe('active');

await page.goto(`/baseball/league/${id}`);
await expect(page.getByTestId('season-active-badge')).toBeVisible();
```

Reference pattern: `apps/web-e2e/src/integration/helpers/wait-for-season-active.ts` — the `api`-parameter path is the canonical backend-poll implementation. **When migrating one caller of a helper to backend polling, migrate every caller in the file and the helper itself.** LS-4344 existed because LS-4321 stopped halfway.

### 3. Phase proceeds before a state-changing mutation is visible to the read path

**Ticket history:** [LS-4350](https://legacysports.atlassian.net/browse/LS-4350).

**Symptom:** Phase 2 (e.g. `joinLeague` mutation) returns success. Phase 10 (a later phase that re-reads the same league as the same user) fails with `ForbiddenError` or `League not found`. The mutation's response is correct; the read path simply hasn't seen the write yet under nightly load.

**Why the obvious fix is wrong:** Extending phase 10's timeout does nothing — phase 10 isn't slow, it's reading from a path that lags the write. The lag is in the backend (write replica → read replica, cache invalidation, eventual-consistency horizon), so any client-side timeout on the read is sampling the wrong process.

**Right fix:** In the **mutation phase**, after the mutation returns success, poll the **read path** (via `apiCommissioner` or a manager's JWT) for write visibility before returning. The visibility check belongs to the mutation, not to the consumer:

```ts
// In phase 2 — after joinLeague mutation succeeds:
await expect
  .poll(
    async () => {
      const r = await gqlFetch(
        managerJwt,
        `query { userTeamId(leagueId: ${id}) }`,
      );
      return r.userTeamId ?? null;
    },
    { timeout: 30_000 },
  )
  .not.toBeNull();
```

Now phase 10 can re-read without race. The mutation phase has paid the visibility tax once; downstream phases trust the invariant.

### 4. Per-phase deadline extension as a substitute for fixing backend-state contention

**Ticket history:** [LS-4278](https://legacysports.atlassian.net/browse/LS-4278), [LS-4282](https://legacysports.atlassian.net/browse/LS-4282), [LS-4287](https://legacysports.atlassian.net/browse/LS-4287) — the canonical "Nth regression guard" chain.

**Symptom:** A phase times out. Agent doubles its `setTimeout`. Two weeks later, a different phase times out. Agent doubles that one. Repeat indefinitely. Total test deadline creeps from 2 min to 5 min to 10 min while nightly stays red.

**Why the obvious fix is wrong:** Doubling a deadline is a guess that the _next_ run will be faster than the _current_ tail. Under nightly's three-shard load, the tail keeps getting longer because the underlying contention (Lambda cold starts, RDS connection pool, SQS queue depth) is unbounded by the test's deadline.

**Right fix:** Identify which axis the contention sits on and fix the actual mechanism:

- **Shared helper** (e.g. `waitForSeasonActive` doing 20 navigation loops) → fix the helper (see antipattern #2).
- **Mutation→read lag** → apply antipattern #3 (the visibility tax belongs to the mutation).
- **Genuine backend load under sharding** → this is not a test fix. Escalate. The right answer is the per-spec teardown ([LS-4356](https://legacysports.atlassian.net/browse/LS-4356)) / per-spec user pool ([LS-4357](https://legacysports.atlassian.net/browse/LS-4357)) refactor, not another per-phase timeout bump.

The "Nth regression guard" framing in a ticket title is a tell that this antipattern is in play. If you're about to bump `timeout` and you can't articulate which of the three mechanisms above the contention sits on, **stop and escalate** — the ticket is misclassified.

### 5. `expect.poll` succeeding with bad data

Cross-referenced from [`integration-commands.md` — `expect.poll()` passes but data is wrong](integration-commands.md#expectpoll-passes-but-data-is-wrong).

**Symptom:** The poll resolves (its condition is met) but a downstream assertion on the _same_ response fails — e.g. `draftStatus === 'completed'` but the roster is empty.

**Why the obvious fix is wrong:** Re-running the test or extending the poll does nothing — the poll already succeeded. The async process completed, just with wrong output.

**Right fix:** This is a **real product bug**, not a test bug. Follow [`debugging/SKILL.md`](../../debugging/SKILL.md) to root-cause the upstream Lambda/SQS/RDS pipeline. Do **not** add fallback logic, retries, or "if empty then refetch" branches to the test — that hides the bug from nightly and from production.

## Related

- [playwright-best-practices.md](playwright-best-practices.md) — the broader Playwright reference
- [test-tagging-guide.md](test-tagging-guide.md) — `@flaky`, `@critical`, etc.
- [ui-serial-phases.md](ui-serial-phases.md) — patterns for multi-phase UI flows
- [integration-testing.md](integration-testing.md) — per-spec setup/teardown doctrine (per-spec user pool is tracked as [LS-4357](https://legacysports.atlassian.net/browse/LS-4357))
- [04-ci-flaky-triage entrypoint](../../dev-process/entrypoints/04-ci-flaky-triage.md) — process for fixing flake when discovered
