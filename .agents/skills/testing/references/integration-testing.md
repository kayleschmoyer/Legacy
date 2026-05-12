---
name: integration-testing
description: 'Write and debug Playwright integration tests that validate distributed flows end-to-end against deployed or local services. Load before creating or modifying any integration test that hits real services or waits for async backends.'
---

# Skill: Integration Testing (Playwright — Distributed Flows)

## Overview

Integration tests validate **real end-to-end flows** across deployed services: Lambda chains, SQS queues, WebSocket notifications, and database state changes. Unlike E2E tests (which mock GraphQL via MSW), integration tests hit **real APIs** and wait for **real async processes** to complete.

There are two modes:

- **API-only** (`APIRequestContext`): headless, no browser. Best for distributed Lambda chains, SQS flows, and backend-only smoke checks.
- **UI browser integration** (`fixtures/ui.ts` browser contexts): full browser with real JWTs. Best for comprehensive user story flows that span multiple roles (commissioner + manager) and must verify that the UI correctly drives and reflects real backend state.

## When to Use

### Use API-only integration tests when:

- Testing a distributed backend flow (draft → SQS → draft-processor → WebSocket notification)
- Verifying async Lambda chains complete correctly (game selection → stats loading → matchup completion)
- Confirming WebSocket messages arrive at the client after backend processing
- Validating EventBridge-triggered cron flows against a deployed environment
- Writing smoke tests for deployed infrastructure (staging/production health checks)

### Use UI browser integration tests when:

- The user story spans **multiple user roles** (e.g., commissioner creates, manager sees)
- The feature requires **real browser rendering** to verify correct conditional display (show/hide logic that depends on real user identity from a live JWT)
- You need to confirm that a UI action **persists to the database** and is then visible to a different user
- The mocked E2E test covers the component in isolation but cannot prove the full create→persist→display→role-restriction chain works against the real API
- The user story is **comprehensive** — multiple sequential steps that together constitute a complete workflow (e.g., create league → join → post announcement → verify persistence → member sees it → member cannot compose)

## Prerequisites

- Deployed environment (dev/staging) **or** local Docker stack (`make docker-up`) with Lambdas running
- Valid authentication credentials (JWT or OAuth token)
- Environment variables set: `INTEGRATION_BASE_URL`, `INTEGRATION_WS_URL`, `INTEGRATION_JWT`

## File Layout

```
apps/web-e2e/
├── src/
│   ├── integration/                    # Integration test directory
│   │   ├── fixtures/
│   │   │   ├── api.ts                  # APIRequestContext fixture with auth
│   │   │   └── ui.ts                   # Browser context fixtures (commissionerPage, managerJwt1-3, ...)
│   │   ├── helpers/
│   │   │   ├── graphql.ts              # Typed GraphQL request helper
│   │   │   ├── poll.ts                 # Reusable polling helpers
│   │   │   └── websocket.ts            # WebSocket connection + message helpers
│   │   └── tests/
│   │       ├── draft-flow.integration.spec.ts               # API-only: Draft → SQS → processor
│   │       ├── live-draft-ui.integration.spec.ts            # UI: Multi-user live draft
│   │       ├── full-season-ui.integration.spec.ts           # UI: Full season workflow
│   │       ├── commissioner-announcements-ui.integration.spec.ts  # UI: Create→post→member sees
│   │       ├── game-selection.integration.spec.ts           # API-only: game select → stats load
│   │       ├── matchup-advance.integration.spec.ts          # API-only: matchup advancement
│   │       └── health-check.integration.spec.ts             # API-only: smoke checks
│   └── ...
├── playwright.integration.config.ts    # Separate Playwright config for integration
```

## Playwright Integration Config

Create a separate config so integration tests don't run with normal E2E tests:

```typescript
// apps/web-e2e/playwright.integration.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/integration/tests',
  timeout: 120_000, // 2 min per test (async flows are slow)
  retries: 1,
  workers: 1, // Sequential — tests may share state
  fullyParallel: false,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.INTEGRATION_BASE_URL ?? 'http://localhost:5000',
    extraHTTPHeaders: {
      Authorization: `Bearer ${process.env.INTEGRATION_JWT ?? ''}`,
    },
    trace: 'on-first-retry',
  },
});
```

## Core Patterns

### 1. API Fixture (No Browser Needed)

Most integration tests don't need a browser. Use Playwright's `APIRequestContext`:

```typescript
// integration/fixtures/api.ts
import { test as base, type APIRequestContext } from '@playwright/test';

interface IntegrationFixtures {
  api: APIRequestContext;
}

export const test = base.extend<IntegrationFixtures>({
  api: async ({ playwright }, use) => {
    const api = await playwright.request.newContext({
      baseURL: process.env.INTEGRATION_BASE_URL ?? 'http://localhost:5000',
      extraHTTPHeaders: {
        Authorization: `Bearer ${process.env.INTEGRATION_JWT ?? ''}`,
        'Content-Type': 'application/json',
      },
    });
    await use(api);
    await api.dispose();
  },
});

export { expect } from '@playwright/test';
```

### 2. Typed GraphQL Helper

```typescript
// integration/helpers/graphql.ts
import type { APIRequestContext } from '@playwright/test';

interface GraphQLResult<T = Record<string, unknown>> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

export async function graphql<T = Record<string, unknown>>(
  api: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResult<T>> {
  const response = await api.post('/graphql', {
    data: { query, variables },
  });
  return response.json() as Promise<GraphQLResult<T>>;
}
```

### 3. Waiting for Async Processes — `expect.poll()`

**This is the primary pattern for integration tests.** Use `expect.poll()` to repeatedly query an API until the async backend process completes.

```typescript
// Wait for draft to complete (Lambda chain: DB → SQS → Draft Processor)
await expect
  .poll(
    async () => {
      const result = await graphql(
        api,
        `
          query GetLeague($id: Int!) {
            league(id: $id) {
              draftStatus
            }
          }
        `,
        { id: leagueId },
      );
      return result.data?.league?.draftStatus;
    },
    {
      timeout: 60_000,
      intervals: [1_000, 2_000, 5_000],
      message: `Draft for league ${leagueId} did not complete within 60s`,
    },
  )
  .toBe('completed');
```

#### Interval Strategy

| Flow                | Expected Duration | Recommended Intervals     | Timeout |
| ------------------- | ----------------- | ------------------------- | ------- |
| Draft completion    | 5–30s             | `[1_000, 2_000, 5_000]`   | 60s     |
| Game selection      | 10–60s            | `[2_000, 5_000, 10_000]`  | 120s    |
| Stats loading       | 30–120s           | `[5_000, 10_000, 15_000]` | 180s    |
| Matchup advancement | 5–15s             | `[1_000, 2_000, 5_000]`   | 30s     |
| WebSocket delivery  | 1–5s              | `[500, 1_000, 2_000]`     | 15s     |

### 4. Waiting for Async Processes — `expect().toPass()`

Use `toPass()` when you need to retry an entire assertion block (multiple checks):

```typescript
await expect(async () => {
  const result = await graphql(api, matchupQuery, { id: matchupId });
  const matchup = result.data?.matchup;
  expect(matchup?.statsLoadingStatus).toBe('completed');
  expect(matchup?.homeScore).toBeGreaterThan(0);
  expect(matchup?.awayScore).toBeGreaterThan(0);
}).toPass({
  timeout: 120_000,
  intervals: [5_000, 10_000],
});
```

### 5. WebSocket Message Verification

#### Option A: Browser-Based (real WS via page)

Use when testing that WebSocket messages reach the UI:

```typescript
import { test, expect } from '@playwright/test';

test('draft completion sends WS notification', async ({ page }) => {
  // Navigate to trigger WS connection
  await page.goto(`/baseball/league/${leagueId}`);

  // Capture the WebSocket connection
  const ws = await page.waitForEvent('websocket', {
    predicate: (ws) => ws.url().includes('/ws'),
    timeout: 10_000,
  });

  // Trigger the draft via API
  const api = page.request;
  await api.post('/graphql', {
    data: { query: startDraftMutation, variables: { leagueId } },
  });

  // Wait for draft-completed WS frame
  const frame = await ws.waitForEvent('framereceived', {
    predicate: (event) => {
      const data = JSON.parse(event.payload as string);
      return data.type === 'DRAFT_COMPLETED';
    },
    timeout: 60_000,
  });

  const payload = JSON.parse(frame.payload as string);
  expect(payload.leagueId).toBe(leagueId);
});
```

#### Option B: Headless WS Client (no browser)

Use when testing WS delivery without a browser — connect directly via the `@legacy-sports/websocket-client` library:

```typescript
// integration/helpers/websocket.ts
import { WebSocketClient } from '@legacy-sports/websocket-client';

export function createTestWsClient(jwt: string): WebSocketClient {
  const wsUrl = process.env.INTEGRATION_WS_URL ?? 'ws://localhost:5001';
  return new WebSocketClient({ url: wsUrl, jwt });
}

export async function waitForMessage<T>(
  client: WebSocketClient,
  type: string,
  timeoutMs = 30_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for WS message: ${type}`)),
      timeoutMs,
    );

    const unsubscribe = client.on(type, (data: T) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(data);
    });
  });
}
```

```typescript
test('draft completion delivers WS notification', async ({ api }) => {
  const ws = createTestWsClient(process.env.INTEGRATION_JWT!);
  await ws.connect();

  try {
    // Start draft via API
    await graphql(api, startDraftMutation, { leagueId });

    // Wait for WS message
    const notification = await waitForMessage<DraftCompletedNotification>(
      ws,
      'DRAFT_COMPLETED',
      60_000,
    );
    expect(notification.leagueId).toBe(leagueId);
  } finally {
    ws.disconnect();
  }
});
```

### 6. UI Browser Integration Tests — Comprehensive User Stories

> **Read [ui-serial-phases.md](ui-serial-phases.md)** for the full serial phase template code, `switchUser` helper, `gqlFetch` raw API helper, real-world examples, and the mocked-vs-integration decision table.

### 7. Test Isolation — Per-Spec Setup/Teardown Required

Each `*.integration.spec.ts` runs against the **live backend**. League-level state (the league row, draft state, roster, matchups) does not vanish at the end of a test process — it sits in `api.legacy-fantasy.com`'s database until something deletes it. Under nightly's three-shard execution that database accumulates leagues from every spec in every shard, and read paths see all of them.

The current model uses `globalTeardown` to sweep leftover leagues at the _end_ of a run — but in sharded runs `globalTeardown` is **skipped** ([LS-4318](https://legacysports.atlassian.net/browse/LS-4318)) because the fastest shard would finish first, call `userLeagues`, see leagues created by slower shards still mid-test, and `deleteLeague` them — yanking rows out from in-flight tests on other shards. The result is that under sharded runs, leagues accumulate across the whole nightly window and `globalSetup` cleans them up _at the start of the next run_ instead.

The model going forward is **per-spec setup/teardown**: each spec owns its data lifecycle and deletes its own league(s) at the end of its describe block. `globalTeardown` is retained as a safety net for orphans (a test crashing mid-run), not as the primary cleanup.

#### Rules

- **Each `test.describe.serial` block must own its data lifecycle.** Create leagues, draft state, and any backend rows in `test.beforeAll` or the first phase. Delete them in `test.afterAll`.
- **Delete by ID, not by pattern.** `deleteLeague(leagueId)` against the specific row created by this spec. **Never** `userLeagues → filter by name pattern → delete all` inside a spec — that's exactly what `globalSetup` does and it cannot be made safe at the per-spec layer (race against other shards' specs in flight).
- **Drain async backend operations before teardown.** If a phase triggered a draft processor, stats loader, or matchup advancement, `expect.poll` the terminal status (`draftStatus === 'completed'`, `matchup.statsLoadingStatus === 'completed'`) in `test.afterAll` _before_ calling `deleteLeague`. Otherwise the background write races the delete and leaves orphan rows.
- **`globalTeardown` is a safety net, not the primary cleanup.** Once per-spec teardown is in place across all specs, `globalTeardown` runs in all modes (sharded included) to catch the rare case where a test crashes before reaching its `afterAll`.

#### Why per-spec teardown is the right model

Global cleanup (the LS-4318 model) cannot run safely in sharded mode because one shard's cleanup races other shards' in-flight tests. Per-spec teardown eliminates that race because each spec only deletes rows it owns — there is no cross-shard reference at all. Once every spec has its own `afterAll`, the LS-4318 skip in `apps/web-e2e/src/integration/global-teardown.ts` can be removed and `globalTeardown` becomes a true safety net.

#### Caveat — shared users are not isolated by per-spec teardown

The 4 hardcoded users (`E2E_COMMISSIONER`, `E2E_MANAGER_1/2/3` in `apps/web-e2e/src/utils/test-user-auth.ts`) are still mutated concurrently by all shards. Per-spec teardown solves _league-level_ cross-contamination, not _user-level_ contention. Until the **per-spec user pool** (JIT-registered ephemeral users per spec — tracked as [LS-4357](https://legacysports.atlassian.net/browse/LS-4357)) lands, the LS-4350 / LS-4353 class of failures requires the write→read visibility pattern from [`e2e-determinism.md` antipattern #3](e2e-determinism.md#3-phase-proceeds-before-a-state-changing-mutation-is-visible-to-the-read-path).

#### Cross-references

- The per-spec teardown migration is tracked as [LS-4356](https://legacysports.atlassian.net/browse/LS-4356).
- The per-spec user pool refactor (the only fix that fully eliminates shared-user contention) is tracked as [LS-4357](https://legacysports.atlassian.net/browse/LS-4357).
- Until both ship, treat any "Nth regression guard" ticket as a signal to apply [antipattern #4 — Per-phase deadline extension](e2e-determinism.md#4-per-phase-deadline-extension-as-a-substitute-for-fixing-backend-state-contention): identify which contention axis is at play, fix the mechanism, escalate if it's genuine sharded backend load.

### 8. Test Steps for Readability

Long integration flows should use `test.step()` to break into labeled sections in reports:

```typescript
test('full draft flow @integration @critical', async ({ api }) => {
  const leagueId = await test.step('create test league', async () => {
    const result = await graphql(api, createLeagueMutation, { input });
    return result.data!.createLeague.id;
  });

  await test.step('start draft', async () => {
    await graphql(api, startDraftMutation, { leagueId });
  });

  await test.step('wait for draft completion', async () => {
    await expect
      .poll(
        async () => {
          const r = await graphql(api, leagueQuery, { id: leagueId });
          return r.data?.league?.draftStatus;
        },
        {
          timeout: 60_000,
          intervals: [1_000, 2_000, 5_000],
        },
      )
      .toBe('completed');
  });

  await test.step('verify roster populated', async () => {
    const result = await graphql(api, teamMembersQuery, { leagueId });
    expect(result.data!.teamMembers.length).toBeGreaterThan(0);
  });
});
```

## Test Tags

| Tag            | Meaning                                               | When to Run             |
| -------------- | ----------------------------------------------------- | ----------------------- |
| `@integration` | Hits real services, may be slow                       | On-demand or nightly CI |
| `@critical`    | Core distributed flow — must work                     | Every deploy            |
| `@smoke`       | Quick connectivity check (API reachable, WS connects) | Every deploy            |
| `@slow`        | Flow takes > 60s (stats loading, full game cycle)     | Nightly only            |

```typescript
test.describe('Draft Flow @integration @critical', () => {
  /* ... */
});
test.describe('Stats Loading Chain @integration @slow', () => {
  /* ... */
});
test.describe('Infrastructure Health @integration @smoke', () => {
  /* ... */
});
```

## Anti-Patterns

### Never use hard sleeps

```typescript
// ❌ BAD — wasteful and flaky
await page.waitForTimeout(30_000);

// ✅ GOOD — resolves as soon as condition is met
await expect
  .poll(
    async () => {
      /* ... */
    },
    { timeout: 30_000 },
  )
  .toBe('completed');
```

### Never assert on stale snapshots

```typescript
// ❌ BAD — checks once and fails if async not done yet
const result = await graphql(api, query, { id });
expect(result.data?.status).toBe('completed');

// ✅ GOOD — retries until async process finishes
await expect
  .poll(
    async () => {
      const r = await graphql(api, query, { id });
      return r.data?.status;
    },
    { timeout: 60_000 },
  )
  .toBe('completed');
```

### Never leave connections open

```typescript
// ✅ GOOD — always disconnect in finally block
const ws = createTestWsClient(jwt);
await ws.connect();
try {
  // ... test logic
} finally {
  ws.disconnect();
}
```

### Don't share mutable state between parallel tests

Integration tests run `workers: 1` and `fullyParallel: false` by default. If you need to create test data, use unique identifiers:

```typescript
const uniqueName = `test-league-${Date.now()}`;
```

## Distributed Flow Reference

Use this table to know which APIs to call and what state to poll for each flow:

| Flow            | Trigger Mutation          | Poll Field                   | Expected Value | WS Event Type            |
| --------------- | ------------------------- | ---------------------------- | -------------- | ------------------------ |
| Draft           | `startDraft`              | `league.draftStatus`         | `completed`    | `DRAFT_COMPLETED`        |
| Game Selection  | `selectGamesForMatchup`   | `matchup.gamesSelected`      | `true`         | `PLAYER_STATS_LOADING`   |
| Stats Loading   | _(triggered by game sel)_ | `matchup.statsLoadingStatus` | `completed`    | `MATCHUP_STATS_COMPLETE` |
| Matchup Advance | `advanceMatchups`         | `matchup.status`             | `completed`    | _(none — poll only)_     |
| Roster Update   | `addPlayerToRoster`       | `teamMembers[].playerId`     | _(contains)_   | `ROSTER_UPDATE`          |

## Running Integration Tests

> **Read [integration-commands.md](integration-commands.md)** for Nx project.json targets, CLI commands, environment variable setup, and troubleshooting tips.

## UI Integration Test Patterns (Browser-Based)

> **Read [ui-integration-patterns.md](ui-integration-patterns.md)** for Playwright+Tamagui interaction patterns: switchUser via localStorage, dialog backdrop interception, collapsed accordions, testID forwarding, disabled button behavior, fixed overlay click bypass, and DB constraint issues.
