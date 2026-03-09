---
name: integration-testing
description: 'Write, run, and debug Playwright integration tests that validate distributed flows end-to-end against deployed (or local) services; covers async polling with expect.poll(), WebSocket message verification, GraphQL API assertions, long-running Lambda chain waits, UI browser integration tests for comprehensive user stories, test tagging, and Playwright config for integration projects. Load this skill before creating or modifying any integration test that hits real services or waits for async backends.'
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

For user stories that span multiple roles and require real browser rendering, use the `ui.ts` fixtures instead of `api.ts`. This gives you browser contexts authenticated as real users (commissioner + managers via impersonation) while still hitting the live API.

#### When to write a UI integration test

A feature warrants a UI integration test (in addition to its mocked E2E test) when **all three** of the following are true:

1. The feature involves **two or more user roles** with different capabilities (e.g., commissioner can compose; member can only read)
2. The feature **writes state to the DB** that must then be visible to another user
3. The mocked E2E test cannot fully prove the flow because it uses fake GraphQL responses rather than real persistence

#### UI-first rule

In `*-ui.integration.spec.ts` tests, **all state-changing operations that have a corresponding UI flow must be performed through browser interactions** — not via direct API calls. This ensures the tests validate the same code paths a real user would exercise.

Direct API calls (`gqlFetch`) are permitted **only** for:

1. **Read-only verification** of backend persistence (e.g., polling `leagueTeams` to confirm a rename stuck)
2. **Querying IDs or state** needed for navigation (e.g., discovering a `matchupId` to build a URL)
3. **Polling async backend processes** that have no UI indicator (e.g., waiting for a Lambda chain to complete)

```typescript
// ❌ BAD — creating a league via API when a UI flow exists
const result = await gqlFetch(jwt, createLeagueMutation, { input });
state.leagueId = result.createLeague.id;

// ✅ GOOD — drive the real UI
await page.goto('/baseball/league/create');
await page.getByPlaceholder('Enter your league name').fill(leagueName);
await page.getByRole('button', { name: /create league/i }).click();
await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
```

#### Structure: serial phases

UI integration tests follow a **serial phase pattern**: each `test()` inside `test.describe.serial()` builds on the state from prior phases. Share state via a typed module-level object.

```typescript
// apps/web-e2e/src/integration/tests/my-feature-ui.integration.spec.ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from '../fixtures/ui';

interface FeatureState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  createdItemText: string; // whatever the feature creates
}

let state: FeatureState;

async function switchUser(page: Page, jwt: string, url?: string) {
  if (url) {
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(
      (token) => localStorage.setItem('auth_jwt', token),
      jwt,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  } else {
    await page.evaluate(
      (token) => localStorage.setItem('auth_jwt', token),
      jwt,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }
}

test.describe
  .serial('My Feature UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      createdItemText: '',
    };
  });

  test('Phase 1: Commissioner creates a league', async ({
    commissionerPage: page,
  }) => {
    // ... create league, extract id + invite code into state
  });

  test('Phase 2: Manager joins the league', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    // switchUser(page, managerJwt1, joinUrl) → join → switchUser back to commissioner
  });

  test('Phase 3: Commissioner performs the action via UI', async ({
    commissionerPage: page,
  }) => {
    // Navigate, click, fill, submit — assert result appears in the UI
  });

  test('Phase 4: API verification — action persists to the backend', async ({
    commissionerJwt,
  }) => {
    // Use expect.poll() + a raw gqlFetch to confirm DB state
    await expect
      .poll(
        async () => {
          /* query backend */
        },
        { timeout: 15_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toContain(state.createdItemText);
  });

  test('Phase 5: Member sees the result', async ({
    commissionerPage: page,
    managerJwt1,
  }) => {
    await switchUser(
      page,
      managerJwt1,
      `/baseball/league/${state.leagueId}/overview`,
    );
    // Assert the created item is visible to a different user
  });

  test('Phase 6: Member cannot perform the commissioner-only action', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await switchUser(
      page,
      managerJwt1,
      `/baseball/league/${state.leagueId}/overview`,
    );
    // Assert compose/admin button is absent
    await switchUser(page, commissionerJwt); // restore
  });
});
```

#### Raw API helper (for Phase 4 verification)

UI integration tests sometimes need a direct API call outside the browser context (e.g., to poll backend state). Add a typed `gqlFetch` helper at the top of the spec:

```typescript
const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ??
    'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/'
  ).replace(/\/?$/, '/') + 'graphql';

async function gqlFetch<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length)
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  if (!json.data) throw new Error('GraphQL response contained no data');
  return json.data;
}
```

#### Real-world examples

| Spec                                                | User story covered                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `commissioner-announcements-ui.integration.spec.ts` | Create league → manager joins → commissioner posts announcement → API persistence verified → manager sees it → member has no compose button |
| `live-draft-ui.integration.spec.ts`                 | Create league → 3 managers join → start live draft → multi-user picks → roster verification                                                 |
| `full-season-ui.integration.spec.ts`                | Full season: create → draft → select games → matchups → waivers → standings                                                                 |

#### What belongs in mocked E2E vs UI integration

| Scenario                                         | Mocked E2E (`src/tests/`) | UI Integration (`src/integration/tests/`) |
| ------------------------------------------------ | ------------------------- | ----------------------------------------- |
| UI renders correctly with known data             | ✅                        |                                           |
| Empty state, loading state, error state          | ✅                        |                                           |
| Button disabled when input empty                 | ✅                        |                                           |
| Cancel / dismiss interactions                    | ✅                        |                                           |
| Data written to DB and visible to another user   |                           | ✅                                        |
| Role-based access verified against real identity |                           | ✅                                        |
| Multi-step workflow across multiple users        |                           | ✅                                        |
| Backend async processes complete correctly       |                           | ✅                                        |

### 7. Test Steps for Readability

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

## UI Integration Test Patterns (Browser-Based)

For full lifecycle tests that drive the real UI against live backends (not mocked), these additional patterns apply:

### Switching Users via localStorage JWT

When swapping identities in a single browser context, **always navigate first, then set the JWT, then reload**:

```typescript
async function switchUser(page: Page, jwt: string, url?: string) {
  if (url) {
    // Navigate first to establish correct origin (avoids SecurityError on about:blank)
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    // Set JWT, then reload so the app loads with the new identity
    await page.evaluate((t) => localStorage.setItem('auth_jwt', t), jwt);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  } else {
    await page.evaluate((t) => localStorage.setItem('auth_jwt', t), jwt);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }
}
```

**Common mistake:** Setting localStorage before any navigation fails with `SecurityError: Access is denied` because the page is on `about:blank` (no origin). And navigating + setting JWT _without reloading_ leaves the app using the old identity's cached data.

### Custom Dialog Backdrop Interception

Tamagui custom dialogs (not `<Dialog>`) often use a `position: fixed` `YStack` backdrop with `onPress={onDismiss}`. This causes two Playwright problems:

1. **Event bubbling** — Clicks inside the dialog bubble to the backdrop, closing it. Fix: add `onPress={(e) => e.stopPropagation()}` to the inner dialog panel.
2. **Hit test interception** — Playwright's `elementFromPoint()` returns the backdrop overlay, not the dialog content, even with `zIndex`. Fix: use `{ force: true }` on clicks inside the dialog.

When using `force: true`, **always scope locators to the dialog element** to prevent clicking page-level buttons:

```typescript
// ✅ GOOD — scoped to dialog
const dialog = page.getByRole('dialog', { name: 'Propose Trade' });
await dialog.getByRole('button', { name: /Submit/i }).click({ force: true });

// ❌ BAD — unscoped, may click a nav button outside the dialog
await page.getByRole('button', { name: /Submit/i }).click({ force: true });
```

To make dialogs testable, add `role="dialog"`, `aria-modal`, and `aria-label` to the component:

```tsx
<YStack role="dialog" aria-modal aria-label="Propose Trade"
  onPress={(e) => e.stopPropagation()}>
```

### Collapsed Accordion Sections

Commissioner panel sections (e.g., "Waiver Processing") may render as collapsed accordions. Always **expand the section before looking for buttons inside it**:

```typescript
// Click accordion header to expand
const accordion = page.getByText('Waiver Processing');
await accordion.click();
// Now the button inside is visible
await page.getByRole('button', { name: /Process Waivers/i }).click();
```

### Auto-Created Resources

Some resources are created automatically by backend processes. Don't try to create them via UI if they already exist — verify existence instead:

```typescript
// ❌ BAD — matchups were already auto-created after draft
await page.getByRole('button', { name: /Create Week 1 Matchups/i }).click();

// ✅ GOOD — verify they exist
await expect(page.getByText(/Week 1/i)).toBeVisible({ timeout: 10000 });
```

### Adding testID for Complex Selection UIs

When selection UIs have no accessible role/name (e.g., player rows in a claim modal), add `testID` to the Tamagui component. This renders as `data-testid` on web:

```tsx
<XStack testID={`drop-player-${playerId}`} role="option" aria-label={`Drop ${name}`}>
```

Then in the test:

```typescript
const row = page.locator('[data-testid^="drop-player-"]').first();
await row.click();
```
