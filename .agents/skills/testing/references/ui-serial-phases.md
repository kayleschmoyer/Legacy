# UI Serial Phase Template

Full serial phase template code, `switchUser` helper, `gqlFetch` raw API helper, real-world examples, and the mocked-vs-integration decision table.

## When to write a UI integration test

A feature warrants a UI integration test (in addition to its mocked E2E test) when **all three** of the following are true:

1. The feature involves **two or more user roles** with different capabilities (e.g., commissioner can compose; member can only read)
2. The feature **writes state to the DB** that must then be visible to another user
3. The mocked E2E test cannot fully prove the flow because it uses fake GraphQL responses rather than real persistence

## UI-first rule

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

## Structure: serial phases

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

## Raw API helper (for Phase 4 verification)

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

## Real-world examples

| Spec                                                | User story covered                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `commissioner-announcements-ui.integration.spec.ts` | Create league → manager joins → commissioner posts announcement → API persistence verified → manager sees it → member has no compose button |
| `live-draft-ui.integration.spec.ts`                 | Create league → 3 managers join → start live draft → multi-user picks → roster verification                                                 |
| `full-season-ui.integration.spec.ts`                | Full season: create → draft → select games → matchups → waivers → standings                                                                 |

## What belongs in mocked E2E vs UI integration

| Scenario                                         | Mocked E2E (`src/tests/`) | UI Integration (`src/integration/tests/`) |
| ------------------------------------------------ | ------------------------- | ----------------------------------------- |
| UI renders correctly with known data             | x                         |                                           |
| Empty state, loading state, error state          | x                         |                                           |
| Button disabled when input empty                 | x                         |                                           |
| Cancel / dismiss interactions                    | x                         |                                           |
| Data written to DB and visible to another user   |                           | x                                         |
| Role-based access verified against real identity |                           | x                                         |
| Multi-step workflow across multiple users        |                           | x                                         |
| Backend async processes complete correctly       |                           | x                                         |
