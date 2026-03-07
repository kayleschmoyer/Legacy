---
name: integration-testing
description: 'Write, run, and debug Playwright integration tests that validate distributed flows end-to-end against deployed (or local) services; covers async polling with expect.poll(), WebSocket message verification, GraphQL API assertions, long-running Lambda chain waits, test tagging, and Playwright config for integration projects. Load this skill before creating or modifying any integration test that hits real services or waits for async backends.'
---

# Skill: Integration Testing (Playwright — Distributed Flows)

## Overview

Integration tests validate **real end-to-end flows** across deployed services: Lambda chains, SQS queues, WebSocket notifications, and database state changes. Unlike E2E tests (which mock GraphQL via MSW), integration tests hit **real APIs** and wait for **real async processes** to complete.

These tests use Playwright's `APIRequestContext` for headless API-only tests and browser contexts when verifying WebSocket delivery to the UI.

## When to Use

- Testing a distributed flow (draft → SQS → draft-processor → WebSocket notification)
- Verifying async Lambda chains complete correctly (game selection → stats loading → matchup completion)
- Confirming WebSocket messages arrive at the client after backend processing
- Validating EventBridge-triggered cron flows against a deployed environment
- Writing smoke tests for deployed infrastructure (staging/production health checks)

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
│   │   │   └── api.ts                  # APIRequestContext fixture with auth
│   │   ├── helpers/
│   │   │   ├── graphql.ts              # Typed GraphQL request helper
│   │   │   ├── poll.ts                 # Reusable polling helpers
│   │   │   └── websocket.ts            # WebSocket connection + message helpers
│   │   └── tests/
│   │       ├── draft-flow.spec.ts      # Draft → processor → WS notification
│   │       ├── game-selection.spec.ts  # Game select → stats load → completion
│   │       ├── matchup-advance.spec.ts # Matchup advancement flow
│   │       └── health-check.spec.ts    # Basic API + WS connectivity smoke
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

### 6. Test Steps for Readability

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

### Nx Targets

Add these targets to `apps/web-e2e/project.json`:

```json
{
  "integration": {
    "command": "pnpm exec playwright test --config=playwright.integration.config.ts",
    "options": { "cwd": "apps/web-e2e" }
  },
  "integration:ui": {
    "command": "pnpm exec playwright test --config=playwright.integration.config.ts --ui",
    "options": { "cwd": "apps/web-e2e" }
  }
}
```

### Commands

```powershell
# Run all integration tests
pnpm exec nx integration web-e2e

# Run a specific flow
pnpm exec nx integration web-e2e -- --grep='Draft Flow'

# Run smoke checks only
pnpm exec nx integration web-e2e -- --grep='@smoke'

# Interactive UI mode
pnpm exec nx integration:ui web-e2e

# Against a deployed environment
$env:INTEGRATION_BASE_URL = "https://api.staging.example.com"
$env:INTEGRATION_WS_URL = "wss://ws.staging.example.com"
$env:INTEGRATION_JWT = "eyJ..."
pnpm exec nx integration web-e2e
```

## Troubleshooting

### Test times out waiting for async flow

1. Check Lambda logs: `.\scripts\aws-logs.ps1 -Function <lambda> -Since 15m -Filter "ERROR"`
2. Check SQS DLQ for failed messages (see `skills/debug-distributed/SKILL.md`)
3. Increase timeout and intervals — some flows are slower under load
4. Verify the trigger mutation returned successfully (check for GraphQL errors)

### WebSocket never connects

1. Verify `INTEGRATION_WS_URL` points to the correct endpoint
2. Check JWT is valid and not expired
3. Test WS connectivity manually: open browser console → `new WebSocket('wss://...')`
4. Check WebSocket Lambda logs: `.\scripts\aws-logs.ps1 -Function websocket -Since 15m`

### Tests pass locally but fail in CI

1. CI may use different env vars — verify `INTEGRATION_BASE_URL` is set in CI workflow
2. Network latency is higher in CI — increase timeouts
3. Check if the target environment is actually running / deployed

### `expect.poll()` passes but data is wrong

The poll succeeded (condition met) but downstream assertions fail — the async process completed with incorrect data. This is a real bug. Follow `skills/debug-distributed/SKILL.md` to root-cause.
