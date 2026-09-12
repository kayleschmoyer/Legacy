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

This applies to **integration tests** especially — see [integration-testing.md](integration-testing.md#test-isolation--per-spec-setupteardown-required) for the per-spec setup/teardown doctrine ([LS-4356](https://bkrupa.atlassian.net/browse/LS-4356) tracks the spec migration). A full **per-spec user pool** (JIT-registered ephemeral users that would also isolate user-level state across shards) is tracked as [LS-4357](https://bkrupa.atlassian.net/browse/LS-4357) and not yet implemented — until it lands, shared-user contention is the dominant nightly failure mode, mitigated only by the write→read visibility pattern in [antipattern #3](#antipatterns-from-past-regressions--class-of-bug-catalog) below.

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

### 10. Failure forensics on demand, not retained in CI

A failure must be diagnosable from the run's own output — re-running to diagnose is a sign of insufficient instrumentation. But note what CI does and does not retain:

- **`trace: 'off'` in BOTH configs** (`playwright.config.ts` and `playwright.integration.config.ts`). Traces were disabled under LS-4537: a single trace zip can exceed GitHub's 100 MB per-file limit on the `legacy-sports-deploys` gh-pages branch, failing the report deploy. Retention returns only if report hosting moves to S3/CloudFront. No `video`/`screenshot` retention is configured either.
- What CI **does** give you: the merged HTML/`summary.md` report with per-failure error + snippet ([read-playwright-report](../../read-playwright-report/SKILL.md)), the `list`/`json` reporter output, and — integration suite — the agent-md reporter (`test-results/summary.md`) plus captured GraphQL errors.
- To get a trace, reproduce locally with tracing on: `nx_run_e2e_specs(specs: [...], integration: true, withTracing: true)` returns `traceArtifacts` paths (see [SKILL.md Commands](../SKILL.md#playwright-specs-via-mcp-nx_run_e2e_specs)). For opaque backend failures, go to CloudWatch — [cloudwatch-archaeology](../../cloudwatch-archaeology/SKILL.md).

**Retries policy (same LS-4537/LS-4401 era, same rationale):** `retries: 0` in both configs — the integration config's own comment records that 2 retries hid 67% of CI-run flake. The nightly workflow passes `--retries=2` on the CLI **for the hermetic e2e suite only**, so genuine flake surfaces as `flaky` in the nightly report (the 0/0 policy counts flakies, not just failures); the integration suite gets no `--retries` flag anywhere and always runs at 0. Do not add retries to a config or workflow to "fix" flake — that is anti-pattern territory below.

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

These five patterns account for the bulk of nightly-only integration failures in this repo over the last six weeks. Each is documented with its symptom, why the obvious fix is wrong, and the right fix. When the [fix-integration-tests skill](../../fix-integration-tests/references/workflow.md#class-of-bug-check--fix-the-pattern-not-the-phase) sends an agent here, it's because the root cause matches one of these — the agent's mandate is then to fix every instance of the pattern in the file/helper, or file an explicit follow-up listing them.

### 1. `expect.poll` callback throws instead of returning

**Ticket history:** [LS-4353](https://bkrupa.atlassian.net/browse/LS-4353) (and the broader `waitForSeasonActive` regression chain LS-4237 → 4261 → 4278 → 4282 → 4287 → 4296 → 4306 → 4321 → 4344 → 4353).

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

**Ticket history:** [LS-4321](https://bkrupa.atlassian.net/browse/LS-4321), [LS-4344](https://bkrupa.atlassian.net/browse/LS-4344). LS-4344 had to come along after LS-4321 to migrate the remaining callers of `waitForSeasonActive` to the backend-poll path.

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

**Ticket history:** [LS-4350](https://bkrupa.atlassian.net/browse/LS-4350).

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

**Ticket history:** [LS-4278](https://bkrupa.atlassian.net/browse/LS-4278), [LS-4282](https://bkrupa.atlassian.net/browse/LS-4282), [LS-4287](https://bkrupa.atlassian.net/browse/LS-4287) — the canonical "Nth regression guard" chain.

**Symptom:** A phase times out. Agent doubles its `setTimeout`. Two weeks later, a different phase times out. Agent doubles that one. Repeat indefinitely. Total test deadline creeps from 2 min to 5 min to 10 min while nightly stays red.

**Why the obvious fix is wrong:** Doubling a deadline is a guess that the _next_ run will be faster than the _current_ tail. Under nightly's three-shard load, the tail keeps getting longer because the underlying contention (Lambda cold starts, RDS connection pool, SQS queue depth) is unbounded by the test's deadline.

**Right fix:** Identify which axis the contention sits on and fix the actual mechanism:

- **Shared helper** (e.g. `waitForSeasonActive` doing 20 navigation loops) → fix the helper (see antipattern #2).
- **Mutation→read lag** → apply antipattern #3 (the visibility tax belongs to the mutation).
- **Genuine backend load under sharding** → this is not a test fix. Escalate. The right answer is the per-spec teardown ([LS-4356](https://bkrupa.atlassian.net/browse/LS-4356)) / per-spec user pool ([LS-4357](https://bkrupa.atlassian.net/browse/LS-4357)) refactor, or rebalancing the shards themselves (see [Shard balancing](#shard-balancing-integration-suite) below — [LS-7845](https://bkrupa.atlassian.net/browse/LS-7845)), not another per-phase timeout bump.

The "Nth regression guard" framing in a ticket title is a tell that this antipattern is in play. If you're about to bump `timeout` and you can't articulate which of the three mechanisms above the contention sits on, **stop and escalate** — the ticket is misclassified.

### 5. `expect.poll` succeeding with bad data

Cross-referenced from [`integration-commands.md` — `expect.poll()` passes but data is wrong](integration-commands.md#expectpoll-passes-but-data-is-wrong).

**Symptom:** The poll resolves (its condition is met) but a downstream assertion on the _same_ response fails — e.g. `draftStatus === 'completed'` but the roster is empty.

**Why the obvious fix is wrong:** Re-running the test or extending the poll does nothing — the poll already succeeded. The async process completed, just with wrong output.

**Right fix:** This is a **real product bug**, not a test bug. Follow [`debugging/SKILL.md`](../../debugging/SKILL.md) to root-cause the upstream Lambda/SQS/RDS pipeline. Do **not** add fallback logic, retries, or "if empty then refetch" branches to the test — that hides the bug from nightly and from production.

### 6. HTTP 429 from the shared live backend masquerading as spec failures

**Ticket history:** [LS-7866](https://bkrupa.atlassian.net/browse/LS-7866), [LS-7867](https://bkrupa.atlassian.net/browse/LS-7867) (prior 429 work: LS-5149 / LS-4940 / LS-4796).

**Symptom:** A shifting set of integration specs fail with "Failed to fetch", "null teamId", or opaque `Received: null`, and the run-level error log is dominated by `HTTP 429`. The failing specs correlate with _whichever_ specs were running when the live backend's rate budget was exhausted — not with any one spec's logic.

**Why the obvious fix is wrong:** Debugging the individual "failing" specs finds nothing — they fail because a _sibling_ shard saturated the shared backend. Re-running flakes a different set. The contention is global (API Gateway / Lambda throttle), not per-spec.

**Right fix:** Two levers, applied together (see [Integration concurrency ceiling & 429 backoff](#integration-concurrency-ceiling--429-backoff-ls-7866--ls-7867)): (1) bound concurrency to a small shard count (the documented ceiling) so the shared backend sees only a few in-flight flows at a time, and (2) route every live call through `fetchWithBackoff` / `retryWithBackoff` so a residual 429 is retried with Retry-After backoff instead of failing the spec. Never add a one-off `try/catch + sleep` to a single spec — that papers over the pattern in one place and lets it resurface elsewhere.

## Integration concurrency ceiling & 429 backoff ([LS-7866](https://bkrupa.atlassian.net/browse/LS-7866) / [LS-7867](https://bkrupa.atlassian.net/browse/LS-7867))

**The integration suite runs at a bounded shard count — `INTEGRATION_SHARD_CEILING` in `run-playwright-tests.yml` (currently `3`) — with `workers = 1` per shard.** This is the documented live-backend concurrency ceiling. Every concurrent shard runs its own league-creation / draft / season flow against the **one shared backend** (`api.legacy-fantasy.com`), so N shards = N× the API-Gateway/Lambda load. Run [27186006949](https://github.com/bkrupa/legacy-sports/actions/runs/27186006949) (3 shards, **before** the universal backoff) produced a **39× HTTP 429** cascade that surfaced as "Failed to fetch" / "null teamId" failures across ~9 specs — 429 victims, not discrete bugs.

LS-7866 first collapsed this to a single serial shard (`1/1`), which removed the 429s but no longer finished inside the 120-min job timeout — run [27216379406](https://github.com/bkrupa/legacy-sports/actions/runs/27216379406) reached only **69/186** tests in ~46 min (≈2 h extrapolated). **LS-7867 restored bounded sharding**: with the universal Retry-After backoff (axis 2 below) now absorbing transient 429s, a small shard count brings wall-clock back under the cap while keeping **0 429-driven failures**. The ceiling is the empirically-validated maximum shard count that satisfies both constraints across ≥2 consecutive runs; the single heaviest spec (`live-draft-ui` ≈ 1400 s) bounds the makespan, so gains past ~3 shards are marginal while 429 risk keeps climbing. **Do not raise `INTEGRATION_SHARD_CEILING` without re-validating** via `workflow_dispatch` (`test-suite=integration`) at the higher count and confirming 0 429-driven failures across ≥2 runs.

`run-playwright-tests.yml` enforces this: the nightly/`all` matrix emits `INTEGRATION_SHARD_CEILING` integration shards, and manual `test-suite=integration` dispatch honors the `shard-total` input **clamped to the ceiling**. Workers are pinned to 1 per shard in the "Run Playwright Tests" step, and each shard's startup is **staggered** (`INTEGRATION_SHARD_STAGGER_SECONDS × (index − 1)`) so the shards don't stampede the oauth-proxy login route (5/60s per IP) at second 0. The integration job keeps `timeout-minutes: 120` as headroom above the observed per-shard wall-clock (e2e stays at 60). E2E is hermetic (no shared backend) and keeps its 3 shards.

Bounding concurrency keeps 429s rare; **comprehensive Retry-After backoff makes any residual 429 non-fatal.** Every live call goes through [`apps/web-e2e/src/utils/retry-with-backoff.ts`](../../../../apps/web-e2e/src/utils/retry-with-backoff.ts) — the GraphQL `gqlFetch` helper, the Playwright `graphql` helper, the oauth-proxy auth/token-mint path (`test-user-auth.ts`), the global setup/teardown cleanup, and the google-oauth smoke tests. It honours the server `Retry-After` header (the oauth-proxy rate limiter sets it) and falls back to exponential backoff with full jitter when absent. **When you add a new live call site, route it through `fetchWithBackoff` / `retryWithBackoff` — never raw `fetch` / `api.post` without retry.** Per-test JWTs are cached on disk across workers ([LS-5149](https://bkrupa.atlassian.net/browse/LS-5149)) so auth is not re-minted per spec. To make raising `workers` (intra-runner concurrency) safe, `global-setup.ts` **pre-warms** every spec's per-spec fixture identities (`MANAGER_1` / `MANAGER_2` / `COMMISSIONER`) into that disk cache before any spec runs — but only when `config.workers > 1`, so the serial `workers=1` ceiling pays nothing. Pre-warming moves all logins into one sequential, backoff-paced startup phase, so concurrent workers only ever read the cache instead of stampeding the oauth-proxy login route (5/60s per IP). JWTs live 24h, far longer than a full suite, so a warmed token never expires mid-run.

**Weight-balanced sharding** (below) governs how specs split across the ceiling's shards; at a 1-shard fallback the partition simply returns every spec to shard `1/1`. The weights manifest and its guard test are essential — an imbalanced partition would concentrate the heavy draft/season specs on one shard and re-create localized backend saturation:

- **Weights manifest:** [`apps/web-e2e/src/integration/integration-shard-weights.json`](../../../../apps/web-e2e/src/integration/integration-shard-weights.json) — approximate worst-case runtime (seconds) per spec. **Add an entry whenever you add a heavy spec.** A unit test (`shard-partition.test.ts`) fails CI if a spec is missing a weight or an entry is stale.
- **Partition:** [`apps/web-e2e/src/integration/shard-partition.ts`](../../../../apps/web-e2e/src/integration/shard-partition.ts) distributes specs across shards by weight using the Longest-Processing-Time greedy heuristic (deterministic; bin spread bounded by the single heaviest spec). The workflow runs its CLI to pass each shard an explicit file list instead of `--shard`; shard identity for the cleanup guards travels via `INTEGRATION_SHARD_CURRENT` / `INTEGRATION_SHARD_TOTAL`. The 3-shard fan-out ([LS-7845](https://bkrupa.atlassian.net/browse/LS-7845)) balances load _across_ the shards the LS-7867 ceiling now permits, keeping each shard's wall-clock within one max-weight of optimal.

## Related

- [e2e-change-safety.md](e2e-change-safety.md) — the companion catalog for the **other** failure class: specs broken deterministically by a shipped product change (stale testIDs, responsive-branch changes, unmocked new operations, defaulted fixture fields), plus why affected-spec selection does not catch them. This document covers flake; that one covers drift.
- [e2e-failure-atlas.md](e2e-failure-atlas.md) — the symptom-indexed diagnostic catalogue built from all 412 E2E fix commits: strict-mode collisions, actionability failures, listener-ordering bugs, mock/enum drift, identity races, viewport splits, state leakage, and the local-environment traps. Use it when you are looking at a failure; use this document when you are writing the spec.
- [ci-failure-prevention.md](ci-failure-prevention.md) — proactive catalog of the top CI failure patterns (GrowthBook flag seeding, Suspense body-text comparison, migration check) with write-time checklists
- [playwright-best-practices.md](playwright-best-practices.md) — the broader Playwright reference
- [test-tagging-guide.md](test-tagging-guide.md) — `@flaky`, `@critical`, etc.
- [ui-serial-phases.md](ui-serial-phases.md) — patterns for multi-phase UI flows
- [integration-testing.md](integration-testing.md) — per-spec setup/teardown doctrine (per-spec user pool is tracked as [LS-4357](https://bkrupa.atlassian.net/browse/LS-4357))
- [04-ci-flaky-triage entrypoint](../../dev-process/entrypoints/04-ci-flaky-triage.md) — process for fixing flake when discovered
- [nightly-green-campaign](../../nightly-green-campaign/SKILL.md) — nightly triage/bisect playbook that routes failures into this catalog
