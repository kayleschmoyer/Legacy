---
name: e2e-testing
description: 'Write, run, and debug Playwright E2E tests for the web app; covers file placement, auth fixtures with automatic API isolation (blocks live AWS services), GraphQL mocking with page.route(), snapshot conventions, test tagging (@critical/@smoke/@regression), static production build serving (port 4280), Nx targets, and CI pipeline integration. Load this skill before creating or modifying any E2E test.'
---

# Skill: E2E Testing (Playwright — Web)

## Overview

End-to-end tests for the web app live in `apps/web-e2e/` and use [Playwright](https://playwright.dev). Tests run against a **static production build** served on port 4280 (`pnpm dlx serve@14.2.4 -s dist/apps/web`), matching CI behavior exactly. JWT authentication is managed by a global setup script.

> **Port convention:** E2E uses port **4280** (separate from the Vite dev server on 4200). This ensures tests always exercise the production build, not the dev server. The webServer is configured in `apps/web-e2e/playwright.config.ts` — Playwright starts/stops it automatically.

## Single Server Rule (CRITICAL)

Playwright's `webServer` config in `apps/web-e2e/playwright.config.ts` is the **sole mechanism** for starting the E2E static file server. No other mechanism — CI action steps, shell scripts, Makefile targets, or manual background processes — should start, wait for, or kill a server.

| Rule                                       | Rationale                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ONE server, ONE config**                 | `apps/web-e2e/playwright.config.ts` owns the full server lifecycle: start → health-check → run tests → kill.                                                                                                                                                                                                            |
| **Never start a server in CI**             | The CI action (`e2e-testing/action.yml`) runs `playwright test` — Playwright starts the server itself. Adding a manual `serve &` creates a race with `reuseExistingServer`.                                                                                                                                             |
| **Always pass `--config`**                 | A legacy root `playwright.config.ts` exists with different settings (port 4200, dev server, 1 worker). Without `--config=apps/web-e2e/playwright.config.ts`, Playwright picks the root config and everything breaks.                                                                                                    |
| **Port-based API isolation**               | The `_apiIsolation` fixture passes through ONLY requests to port 4280 (the E2E server). All other ports — including `localhost:5000` (GraphQL) and `localhost:5001` (OAuth proxy) — are intercepted. Changing the isolation to hostname-based (`localhost` passthrough) will break CI where those services don't exist. |
| **`reuseExistingServer: !process.env.CI`** | Locally, reuse an already-running server for fast iteration. In CI, always start fresh so startup failures are caught.                                                                                                                                                                                                  |

> **If you need to change the server command, port, or startup logic, change it ONLY in `apps/web-e2e/playwright.config.ts`.** Never duplicate server management in CI actions, scripts, or Makefiles.

## When to Use

- Writing a new E2E test for a web feature
- Debugging a failing E2E test
- Adding GraphQL mocks for a new page/feature
- Running E2E tests locally or understanding CI behavior
- Adding page objects for new routes

## Mocked E2E vs. True UI Integration Tests

Mocked E2E tests (this skill) cover a component or page in **isolation** using `page.route()` to return controlled data. They are fast, deterministic, and require no running backend.

**For comprehensive user stories that involve multiple roles, real persistence, or cross-user visibility, also write a UI integration test** (see `skills/integration-testing/SKILL.md`). Use this table to decide:

| Scenario                                                   | Here (mocked E2E) | integration-testing skill |
| ---------------------------------------------------------- | ----------------- | ------------------------- |
| UI renders correctly with known data                       | ✅                |                           |
| Empty/loading/error states                                 | ✅                |                           |
| Button disabled when input empty                           | ✅                |                           |
| Cancel/dismiss interactions                                | ✅                |                           |
| Post button enables after typing, form closes after submit | ✅                |                           |
| Data written to DB and visible to a different user         |                   | ✅                        |
| Role-based access verified against a real JWT identity     |                   | ✅                        |
| Multi-step workflow across commissioner + manager          |                   | ✅                        |
| Async backend processes complete end-to-end                |                   | ✅                        |

> A feature does **not** need both unless its user story includes cross-user visibility or backend persistence that mocks cannot prove. Simple display features only need a mocked E2E test.

## File Layout

```
apps/web-e2e/
├── src/
│   ├── global-setup.ts           # JWT auth (CI: sign JWT; local: OAuth device flow)
│   ├── fixtures/
│   │   ├── auth.ts               # Authenticated-user overrides (OAuth, leagues, mutations)
│   │   ├── auth-enhanced.ts      # test, adminTest, unauthTest, createCustomAuthTest
│   │   │                         #   + automatic API isolation with baseline mocks
│   │   └── shared-mocks.ts       # BASELINE_GRAPHQL_RESPONSES map + extractOperationName
│   ├── mocks/
│   │   └── graphql/              # Mock data factories (user, league, team, draft, etc.)
│   │       ├── index.ts          # Re-exports all factories
│   │       ├── user.mocks.ts     # mockUser(), currentUserResponse()
│   │       ├── league.mocks.ts   # mockLeague(), leagueByIdResponse(), etc.
│   │       ├── draft.mocks.ts    # startDraftResponse()
│   │       ├── matchup.mocks.ts  # mockMatchup(), matchupsForLeagueResponse()
│   │       ├── player.mocks.ts   # Player stats factories
│   │       └── subscription.mocks.ts
│   ├── pages/                    # Page objects (reusable locators per route)
│   │   ├── navigation.page.ts    # Header, nav, mobile menu
│   │   ├── league.page.ts        # League detail, create, list
│   │   ├── draft.page.ts         # Draft board UI
│   │   └── players.page.ts       # Player stats, detail, comparison
│   ├── support/
│   │   └── snapshot-utils.ts     # Hide dynamic content for snapshots
│   ├── utils/
│   │   └── jwt.ts                # E2EJwtUtil for generating test JWTs
│   └── tests/                    # Test specs
│       └── *.spec.ts
```

## Authentication

Authentication is handled by `global-setup.ts` before any test runs:

- **CI**: Signs a JWT using `JWT_SECRET` env var → writes `storageState` to `.auth/state.json`
- **Local**: OAuth device flow with token caching in `.auth/token-cache.json`

All tests inherit the authenticated state automatically via Playwright's `storageState` config.

### Auth Fixtures (`fixtures/auth-enhanced.ts`)

All fixtures extend from an `isolated` base that includes **automatic API isolation** (see below). You don't need to set it up — just import and use.

| Export                 | Use Case                                    |
| ---------------------- | ------------------------------------------- |
| `test`                 | Default authenticated user                  |
| `adminTest`            | Admin-level JWT (accessLevel: 'admin')      |
| `unauthTest`           | No auth — tests login flows                 |
| `createCustomAuthTest` | Factory for custom email/accessLevel combos |

### API Isolation (automatic — 3-layer mock architecture)

The production build bakes in **real AWS URLs** (GraphQL, OAuth proxy, WebSocket) from `.env` at build time. Without isolation, E2E tests would hit live services — making them flaky, slow, and dependent on network/AWS state.

`auth-enhanced.ts` includes an `{ auto: true }` fixture called `_apiIsolation` that intercepts **all requests not targeting the E2E static file server port (4280)**. This catches localhost service ports (`:5000` GraphQL, `:5001` OAuth proxy), external CDNs, AWS endpoints, and any other host — ensuring complete network isolation.

#### Layer structure

Playwright routes match in **LIFO order** (last registered runs first). The three layers register in this order, so they execute in reverse:

| Layer | File                               | Registers            | Runs   | Purpose                                             |
| ----- | ---------------------------------- | -------------------- | ------ | --------------------------------------------------- |
| 1     | `auth-enhanced.ts` `_apiIsolation` | First (auto fixture) | Last   | Shared baseline mocks + unmocked-op detection       |
| 2     | `auth.ts` page fixture             | Second               | Middle | Authenticated-user overrides (OAuth login, leagues) |
| 3     | Test code (`page.route()`)         | Last (test body)     | First  | Scenario-specific operation mocks                   |

Request flow: **test handler → auth.ts handler → \_apiIsolation baseline → throw if unknown**

#### Baseline mocks (`fixtures/shared-mocks.ts`)

The baseline mock map (`BASELINE_GRAPHQL_RESPONSES`) provides default responses for ~30 common GraphQL operations. These cover:

- **App shell**: `GetUserById`, `GetUserLeagues` (empty)
- **Home page**: `GetOnThisDay`, `GetOnThisDayEvents`
- **League detail**: `GetLeagueById`, `GetLeagueTeams`, `GetPositionsForLeague`, `GetLeagueScoringProfile`, matchups, standings, activity, chat, etc.
- **Draft**: `GetLeagueDraft`, `GetDraftTeamOrder`
- **Subscription, trade block, playoff, player stats, admin, team members, invite code**

All baseline responses use the factory functions from `mocks/graphql/` (e.g., `leagueByIdResponse()`, `leagueTeamsResponse()`).

#### Unmocked operation detection

If a GraphQL operation reaches layer 1 and is **not** in the baseline map:

1. **During the test**: returns `{ errors: [{ message: "unmocked..." }] }` (so the UI shows an error state instead of hanging)
2. **After the test body**: throws a descriptive error listing all unmocked operations

This catches missing mocks early. Fix by adding the operation to `shared-mocks.ts` (if common) or mocking it in the test.

#### How to add a new baseline operation

1. Edit `apps/web-e2e/src/fixtures/shared-mocks.ts`
2. Add a lowercased key to `BASELINE_GRAPHQL_RESPONSES`
3. Use a factory from `mocks/graphql/` or return a minimal `{ data: { fieldName: null } }` response

#### auth.ts overrides

`auth.ts` extends `auth-enhanced.ts` and adds overrides for authenticated user context:

- OAuth login endpoint mock
- `GetUserLeagues` → returns one league (overrides baseline's empty array)
- `StartDraft` and `UpdateLeagueBranding` mutation mocks
- All other operations use `route.fallback()` → fall through to baseline

Tests that import from `auth.ts` get both the auth overrides AND the baseline.

| URL Pattern            | Layer 1 (baseline) Response                     | Why                                                 |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `*/graphql` (known op) | `200` with baseline mock data                   | Components render with reasonable defaults          |
| `*/graphql` (unknown)  | `200 { errors: [...] }` + post-test throw       | Catches missing mocks — add to shared-mocks.ts      |
| Everything else        | `401 { error: 'Blocked by E2E API isolation' }` | Prevents silent JWT refresh and other backend calls |

This means:

- Tests that need specific GraphQL responses just add `page.route()` as before — it overrides the baseline
- Tests that don't need data (about page, navigation, etc.) work with zero mocking setup
- The silent JWT refresh (`/refresh-jwt`) is blocked automatically — no need for manual intercepts
- Unmocked operations are caught and reported instead of silently returning empty data

> **Do NOT use MSW for E2E tests.** MSW requires a Service Worker in the browser — fragile, requires build changes, and handlers don't serialize across the Playwright/browser boundary. Playwright's `page.route()` intercepts at the network protocol layer and is the first-class solution.

```typescript
// Default authenticated test
import { test, expect } from '../fixtures/auth-enhanced';

// Admin test
import { adminTest, expect } from '../fixtures/auth-enhanced';

// Unauthenticated test
import { unauthTest, expect } from '../fixtures/auth-enhanced';

// Custom identity
import { createCustomAuthTest, expect } from '../fixtures/auth-enhanced';
const ownerTest = createCustomAuthTest('owner@test.com', 'admin');
```

## Writing a New Test

### 1. Create the spec file

Place new tests in `apps/web-e2e/src/tests/<feature>.spec.ts`.

### 2. Choose the right fixture

```typescript
import { test, expect } from '../fixtures/auth-enhanced';
```

### 3. Use page objects for locators

```typescript
import { NavigationPage } from '../pages/navigation.page';
import { LeaguePage } from '../pages/league.page';

test.describe('League Detail @critical', () => {
  test('displays league name', async ({ page }) => {
    const nav = new NavigationPage(page);
    const league = new LeaguePage(page);

    await page.goto('/baseball/league/1');
    await nav.expectHeaderVisible();
    await expect(league.leagueName).toBeVisible();
  });
});
```

### 4. Mock GraphQL operations as needed

For pages that call the GraphQL API, use `page.route()` to intercept. Use `route.fallback()` for operations your test doesn't handle — they'll cascade to the shared baseline mocks.

**Prefer the mock factory library** from `mocks/graphql/` for consistent data shapes:

```typescript
import { leagueByIdResponse, leagueTeamsResponse } from '../mocks/graphql';

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) =>
      url.toString().includes('/graphql') && !url.toString().includes('/@fs/'),
    async (route) => {
      const body = route.request().postDataJSON() as { operationName?: string };
      const op = body.operationName ?? '';

      if (op === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leagueByIdResponse({ name: 'My Test League' })),
        });
      } else {
        // Cascade to shared baseline mocks (layer 1)
        await route.fallback();
      }
    },
  );
});
```

> **🚫 NEVER use `route.continue()`** in E2E tests. E2E tests are hermetic —
> they must never send requests to a real backend. In CI there _is_ no backend
> (the app is served as static files), so `route.continue()` causes requests to
> hang until timeout, silently breaking every test in the suite.
>
> **Use `route.fallback()` for unhandled operations.** With the 3-layer
> architecture, `route.fallback()` cascades through: test → auth.ts → baseline.
> The baseline handles ~30 common operations. Only truly unknown operations
> trigger the post-test error.
>
> **Never return `{ errors: [...], data: null }` as a catch-all** —
> Apollo treats that as a server error, triggering error boundaries that
> unmount the page and break every downstream assertion.
>
> ```typescript
> // ✅ Best: fall through to shared baseline mocks
> await route.fallback();
>
> // ✅ OK: explicit empty data for a specific operation
> await route.fulfill({
>   status: 200,
>   contentType: 'application/json',
>   body: JSON.stringify({ data: {} }),
> });
>
> // ❌ WRONG: error response — Apollo error boundary crashes UI
> await route.fulfill({
>   body: JSON.stringify({
>     errors: [{ message: `[E2E] No mock for operation: ${op}` }],
>     data: null,
>   }),
> });
>
> // ❌ WRONG: route.continue() — hangs in CI, hits real backend locally
> await route.continue();
> ```
>
> **`route.fallback()` is OK** when multiple route handlers are chained and you
> want an earlier handler to defer to a later one — but the _final_ handler in
> the chain must still end with `route.fulfill()`, never `route.continue()`.
>
> **Only integration tests hit real services** (see `skills/integration-testing/SKILL.md`).

> **Avoid broad `postData.includes()` matches:** A check like
> `postData.includes('getleague')` will also match `getleagueteams`,
> `getleaguemembers`, etc. Either:
>
> - **Reorder** specific matches before general ones (`getleagueteams` before `getleague`)
> - **Quote** the operation name: `postData.includes('"getleague"')` to match the exact JSON field

### 5. Tag the test suite

Add a tag to `test.describe` for CI filtering:

```typescript
test.describe('Feature Name @critical', () => {
  /* ... */
});
test.describe('Edge Cases @regression', () => {
  /* ... */
});
test.describe('Basic Smoke @smoke', () => {
  /* ... */
});
```

## Test Tags

| Tag           | Meaning                                          | CI Behavior               |
| ------------- | ------------------------------------------------ | ------------------------- |
| `@critical`   | Core user flows — must never break               | Always runs in CI         |
| `@smoke`      | Quick sanity checks — page loads, nav works      | Runs on every PR          |
| `@regression` | Edge cases, error handling, complex interactions | Runs on merge to main     |
| `@visual`     | Snapshot / visual regression tests               | Manual trigger or nightly |
| `@slow`       | Tests that take >10 s (e.g. full season flows)   | Excluded from CI default  |

CI defaults to `@critical` (excluding `@slow`). To run all:

### Tagging Decision Guide

Apply **one primary tag** to the `test.describe` block. Individual tests inherit the suite tag. Tests that genuinely belong to a different tier get their own inline tag appended to the test name (e.g., `'shows drag handles @regression'`).

#### `@critical` — Use when a failure means the app is effectively down

A flow is **critical** if a failure blocks users from completing the core game loop: authenticate → create/join a league → draft → play matchups → trade/waiver → manage subscription. Ask: _"If this breaks at 11 PM on a Friday, would we roll back immediately?"_ If yes → `@critical`.

Examples:

- User can log in / is redirected when unauthenticated
- User can create or join a league
- User can discover leagues and submit a join request
- Draft board renders and draft status updates work
- Commissioner can advance matchups, select games, process waivers
- User can send/receive/cancel trades
- Subscription paywall gates content correctly and upgrade flow works
- WebSocket real-time updates arrive without page reload
- Mobile navigation panel opens and links work

Counter-examples (these are **not** `@critical`):

- Player stats page loads (display-only, game still plays)
- Standings table renders (informational, not blocking)
- Playoff bracket shows round names (visual, results still process)
- Commissioner league settings form (games play with existing settings)
- Team detail page shows roster (read-only view)

Rule of thumb: if the feature breaking means **users cannot play their leagues or pay**, it is `@critical`. If it means **users cannot see some data** but the game loop still works, it is `@regression`.

#### `@smoke` — Use when the test is a basic page/navigation sanity check

A smoke test answers: _"Does the page load and show its main heading?"_ It is not testing a user flow — just that the route renders at all. These are fast (< 2 s) and exist to catch routing and build regressions before anything else runs.

Examples:

- About page shows its H1
- Help page sections are visible
- Home page heading is present
- Navigation links are visible
- Profile settings page loads

Rule of thumb: if the test only calls `page.goto()` + `expect(...).toBeVisible()` on a top-level heading or nav element, it is `@smoke`.

**Do not** tag a test `@smoke` if it requires GraphQL mocking, authentication state beyond a basic JWT, or more than one interaction.

#### `@regression` — Use for display features, edge cases, or error states

Regression tests cover features where a failure is annoying but doesn't break the core game loop. This includes **display/browsing pages** (stats, standings, player profiles, team detail, pricing, playoff brackets), **edge cases** (error states, empty states, locked UI), **accessibility checks**, and **admin-only tools**.

Examples:

- Player stats page structure and tab switching
- Standings table data rendering
- Playoff bracket completed/in-progress display
- Team detail page identity and roster
- Roster management layout and player data
- Commissioner league settings form
- Admin console access control and user management
- Error toast displays and can be dismissed
- Form shows validation errors on invalid input
- Accessibility: headings have correct hierarchy
- Cross-browser rendering differences

Rule of thumb: if the test was written _after_ a bug was found in production, tag it `@regression`. Also use `@regression` for anything that is too slow or too niche to run on every PR.

#### `@visual` — Use for screenshot/snapshot tests

Visual tests capture the pixel layout of a page or component. They are brittle across OS/DPI and are not run in normal CI. Always pair with a corresponding `@critical` or `@smoke` test that validates the same page functionally.

#### `@slow` — Append to any test that takes > 10 seconds

`@slow` can be combined with another tag (e.g., `@critical @slow`). The CI default run excludes `@slow` tests via `--grep-invert @slow`. Long-running integration flows (e.g., full season simulation) should carry this tag.

### Common Mistakes

| Mistake                                                    | Correct approach                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Tagging a heading-visibility check `@critical`             | Use `@smoke` instead                                           |
| Tagging a display/browsing page `@critical`                | Use `@regression` — game loop still works without it           |
| Tagging a broken-state / edge case `@critical`             | Use `@regression`                                              |
| Tagging admin-only tools `@critical`                       | Use `@regression` — internal ops, not user-facing gameplay     |
| Tagging a full season simulation without `@slow`           | Add `@slow` alongside the primary tag                          |
| Putting `@critical` on a test that takes 15+ seconds       | Add `@slow` so it is excluded by default                       |
| Tagging an entire file `@smoke` when some tests test flows | Split into multiple `test.describe` blocks with different tags |

```powershell
# IMPORTANT: The pipe `|` in grep patterns is interpreted by Windows CMD
# (which Nx spawns internally). Always use the $env: variable approach:
$env:PLAYWRIGHT_GREP='@critical|@smoke|@regression' ; pnpm exec nx e2e web-e2e
```

> **Never** pass `--grep='@critical|@smoke'` via `--` args on Windows.
> CMD interprets `|` as a shell pipe, producing `'smoke' is not recognized`.
> The `PLAYWRIGHT_GREP` env var is read by `apps/web-e2e/playwright.config.ts`
> and converted to a `grep` regex — it is not a built-in Playwright env var.

## Playwright Best Practices (REQUIRED)

Follow these Playwright-recommended patterns. Violations cause flaky, slow, and non-deterministic tests.

### Never use `waitForTimeout()`

`page.waitForTimeout()` is an arbitrary sleep — tests that depend on it are slow (best case) and flaky (worst case). Replace with a condition-based wait:

```typescript
// ❌ WRONG: arbitrary sleep
await page.waitForTimeout(1000);
await expect(page.getByText('Results')).toBeVisible();

// ✅ CORRECT: wait for the condition directly
await expect(page.getByText('Results')).toBeVisible();

// ✅ For debounced inputs: fill then assert on the result
await page.fill('#search', 'query');
await expect(page.getByTestId('search-results')).toBeVisible();

// ✅ For polling (integration tests): use expect.poll()
await expect
  .poll(async () => {
    const resp = await page.request.get('/api/status');
    return resp.json();
  })
  .toEqual(expect.objectContaining({ ready: true }));
```

### Never use `waitForLoadState('networkidle')`

`'networkidle'` waits until no network requests for 500ms — it's **deprecated**, unreliable with long-polling/WebSockets, and adds unnecessary delay. SPAs with polling or analytics never truly go idle.

```typescript
// ❌ WRONG: unreliable, deprecated
await page.waitForLoadState('networkidle');

// ✅ CORRECT: wait for a specific element
await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

// ✅ OK when you just need DOM ready (e.g., before a snapshot)
await page.waitForLoadState('domcontentloaded');
```

### Never use `page.$()`, `page.$$()`, `page.waitForSelector()`, or `elementHandle`

These are legacy Puppeteer-style APIs. Playwright locators are auto-waiting, auto-retrying, and composable.

```typescript
// ❌ WRONG: Puppeteer-style
const el = await page.$('.my-button');
await el?.click();

// ✅ CORRECT: Playwright locator
await page.locator('.my-button').click();
// Even better: use semantic selectors
await page.getByRole('button', { name: /submit/i }).click();
```

### Prefer web-first assertions

```typescript
// ❌ WRONG: manual check
const isVisible = await page.locator('.toast').isVisible();
expect(isVisible).toBe(true);

// ✅ CORRECT: auto-retrying web-first assertion
await expect(page.locator('.toast')).toBeVisible();
```

### Always pass `--config`

A legacy root `playwright.config.ts` exists. Without `--config`, Playwright picks it up and uses the wrong port/settings.

```powershell
# ❌ WRONG: picks up root config (port 4200, dev server)
pnpm exec playwright test

# ✅ CORRECT: uses E2E config (port 4280, static build)
pnpm exec playwright test --config=apps/web-e2e/playwright.config.ts
```

> **Known tech debt:** ~40 `waitForTimeout()` and ~20 `networkidle` calls exist in integration tests and page objects. These should be eliminated in future PRs but are not blocking `@critical` tests.

## Locator Conventions

Prefer Playwright's accessibility-first selectors in this order:

1. **Role-based** (best): `page.getByRole('button', { name: /create league/i })`
2. **Text**: `page.getByText('Fantasy League')`
3. **Placeholder**: `page.getByPlaceholder('Enter your league name')`
4. **Test ID** (when no semantic option): `page.getByTestId('leagues-grid')`
5. **CSS selector** (last resort): `page.locator('a[href="/about"]')`

> Avoid brittle CSS class selectors — they change with styling updates.

## Page Objects

Page objects live in `apps/web-e2e/src/pages/` and encapsulate locators for a route or component group.

### Pattern

```typescript
import { type Locator, type Page, expect } from '@playwright/test';

export class ExamplePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.submitButton = page.getByRole('button', { name: /submit/i });
  }

  async goto() {
    await this.page.goto('/example');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15000 });
  }
}
```

### Rules

- One page object per route group (e.g., `league.page.ts` covers create + detail + list)
- Expose `Locator` properties for assertions, helper methods for multi-step interactions
- Use `expect` inside helper methods only for preconditions (e.g., `expectLoaded`)
- Name the file `<domain>.page.ts`

## Snapshot Testing

### Visual snapshots

```typescript
import { SnapshotUtils } from '../support/snapshot-utils';

test('page matches snapshot @visual', async ({ page }) => {
  await page.goto('/about');
  await SnapshotUtils.preparePage(page);
  await expect(page).toHaveScreenshot('about-page.png', {
    maxDiffPixelRatio: 0.01,
  });
});
```

### Responsive snapshots

```typescript
await SnapshotUtils.captureResponsiveSnapshots(page, 'feature-name');
// Captures at mobile (375×667), tablet (768×1024), desktop (1920×1080)
```

### Update snapshots

```powershell
pnpm exec nx e2e:update-snapshots web-e2e
```

## Nx Targets

| Target                 | Command                                           |
| ---------------------- | ------------------------------------------------- |
| `e2e`                  | Run all Playwright tests                          |
| `e2e:ui`               | Interactive UI mode (pick & debug tests visually) |
| `e2e:headed`           | Run with visible browser                          |
| `e2e:debug`            | Run with Playwright Inspector                     |
| `e2e:update-snapshots` | Refresh all snapshot baselines                    |
| `e2e:snapshots`        | Run only snapshot/visual tests                    |
| `typecheck`            | TypeScript check (no emit)                        |
| `lint`                 | ESLint                                            |

### Run commands

```powershell
# All tests
pnpm exec nx e2e web-e2e

# Single test file (no pipe — safe to pass via --)
pnpm exec nx e2e web-e2e -- --grep='League Detail'

# Specific tag (no pipe — safe to pass via --)
pnpm exec nx e2e web-e2e -- --grep='@critical'

# Multiple tags (pipe in pattern — MUST use env var on Windows)
$env:PLAYWRIGHT_GREP='@critical|@smoke' ; pnpm exec nx e2e web-e2e

# Chromium only (useful for faster local runs)
$env:PLAYWRIGHT_GREP='@critical|@smoke' ; pnpm exec nx e2e web-e2e -- --project chromium

# Interactive UI mode
pnpm exec nx e2e:ui web-e2e

# Headed (see browser)
pnpm exec nx e2e:headed web-e2e

# Debug with inspector
pnpm exec nx e2e:debug web-e2e
```

> **Windows pipe escaping rule:** Any grep pattern containing `|` must be set
> via `$env:PLAYWRIGHT_GREP` — never passed as a `--grep` CLI argument.
> CMD (spawned by Node/Nx on Windows) treats `|` as a shell pipe operator.
> `PLAYWRIGHT_GREP` is read by `apps/web-e2e/playwright.config.ts`, not by Playwright itself.

## CI Pipeline

E2E tests run in **Stage 3** of the CI pipeline (after quality gates and build validation):

1. Pre-built web artifact is downloaded (or falls back to Nx remote cache)
2. Playwright browsers are installed (cached)
3. Playwright's `webServer` config starts `pnpm dlx serve@14.2.4 -s dist/apps/web` on port **4280**
4. Tests run with `--grep @critical` and `--grep-invert @slow` by default
5. Results are parsed: passed/failed/success-rate/execution-time

The CI action supports inputs: `test-patterns`, `browser`, `timeout-minutes`.

> **Server lifecycle is managed by Playwright**, not by the CI action. The `webServer` block in `playwright.config.ts` starts the static file server, waits for it to be healthy (`http://127.0.0.1:4280`), and kills it after tests finish. No manual start/wait/kill logic is needed.

**E2E failures block PR merging.** E2E is included in the CI `failure-threshold` alongside quality-gates and build-validation. A failing E2E shard will fail the overall CI pipeline and prevent the PR from landing.

## Pre-Commit: Local E2E Validation (REQUIRED)

When you add, modify, or delete any Playwright test file (`apps/web-e2e/src/**`), page object, fixture, mock, or utility, you **must** run the affected E2E tests locally and confirm they pass **before committing**. This is not optional — E2E failures now block PR merging in CI.

### Steps

1. **Build the web app** (if not already built or if you changed web app code):

   ```powershell
   pnpm exec nx build web
   ```

   The tests run against `dist/apps/web` — you **must** rebuild after web app changes.

2. **Run the specific test file you changed** (fastest feedback):

   ```powershell
   $env:E2E_AUTH_MODE='ci' ; pnpm exec playwright test --config=apps/web-e2e/playwright.config.ts --project=chromium --grep='Test Describe Name' apps/web-e2e/src/tests/my-feature.spec.ts
   ```

   Playwright's `webServer` config will automatically start `npx serve` on port 4280 and stop it when tests finish. No manual server management needed.

3. **If you changed shared infrastructure** (fixtures, page objects, utils), run the full `@critical` suite:

   ```powershell
   $env:E2E_AUTH_MODE='ci' ; pnpm exec playwright test --config=apps/web-e2e/playwright.config.ts --project=chromium --grep='@critical'
   ```

4. **All tests must pass** before you commit. If a test fails:
   - Fix the test or the code under test — do not skip or disable the test.
   - Re-run until green.

> Running with `--project chromium` is sufficient for local validation. CI runs across all browser projects.
> Set `$env:E2E_AUTH_MODE='ci'` to sign JWTs locally (skips OAuth device flow).

### What counts as "changing Playwright tests"

Any edit to files under `apps/web-e2e/src/` — including:

- Test specs (`tests/*.spec.ts`)
- Fixtures (`fixtures/*.ts`)
- Page objects (`pages/*.page.ts`)
- Mocks (`mocks/**/*.ts`)
- Utilities and support files (`utils/*.ts`, `support/*.ts`)
- Global setup/teardown (`global-setup.ts`, `global-teardown.ts`)

Also run E2E tests when your changes affect pages tested by existing E2E specs (e.g., editing a web app page component that has a corresponding `*.spec.ts`).

## Selector Sync Rule

When a PR changes the **login page, landing page, or auth guard** (`PublicLandingPage`, `LoginPage`, `EnhancedAuthGuard`, etc.), the same PR **must** update all E2E selectors that reference those components. Common selectors to check:

- Button names: `getByRole('button', { name: /get started.../i })`
- Headline text: `getByText(/build your dynasty/i)`
- Aria labels: `aria-label="Sign in"`, `aria-label="Get started with Google"`

**How to check:** Search `apps/web-e2e/src/` for the old button text, heading text, or aria-label. If any E2E file references the value you're changing, update it in the same PR.

```powershell
# Verify no stale selectors remain after a landing page change
Get-ChildItem -Recurse apps/web-e2e/src -Filter *.ts | Select-String -Pattern 'old button text' -SimpleMatch
```

> **Why:** E2E tests run against the _built_ app. If the app's UI changes but tests still look for old selectors, every test will fail — and if CI skips E2E (see below), the breakage goes undetected until it blocks all future PRs.

## CI: When E2E Tests Run

E2E tests only run when `detect-changes` flags `e2e: true` or `web: true`. The web app is built only when those flags (or `requires-full-build`) are set.

**Implication:** A PR that changes _only_ `apps/web/` components (no E2E file changes) will run E2E. A PR that changes _only_ `apps/web-e2e/` files will also trigger a web build and run E2E. But a PR that changes neither will skip E2E entirely.

**This means breaking changes to auth/landing pages that don't also touch E2E selectors will pass CI** — the tests that would catch the breakage simply don't run on unrelated PRs. This is why the Selector Sync Rule above is critical.

## Troubleshooting

| Problem                             | Fix                                                                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------- | ------------------ |
| Tests timeout on `goto()`           | Ensure `dist/apps/web` exists (`pnpm exec nx build web`). Playwright's webServer serves it on port 4280.                                                                                                          |
| Auth fails locally                  | Delete `.auth/token-cache.json` and re-run. Or use `$env:E2E_AUTH_MODE='ci'` to skip OAuth device flow.                                                                                                           |
| Snapshots differ on CI vs local     | CI uses Linux Chromium — update snapshots via the GH Action                                                                                                                                                       |
| GraphQL mock not intercepting       | Check the URL filter excludes `/@fs/` and `.ts`/`.js` paths                                                                                                                                                       |
| Tests hang on unmocked operation    | Add the operation to `shared-mocks.ts` (if common) or mock it in your test. The `_apiIsolation` fixture throws after the test with a list of unmocked operations.                                                 |
| Mock never intercepts query         | Check for broad `includes()` match — use quoted operation name                                                                                                                                                    |
| Flaky: some tests pass vacuously    | Mock returns `data: null` — use `{ data: { queryName: [] } }`                                                                                                                                                     |
| Expired JWT test shows auth content | The app's silent `/refresh-jwt` call is succeeding against real AWS. API isolation fixture handles this automatically — make sure your test extends from `auth-enhanced.ts` fixtures, not raw `@playwright/test`. |
| `'smoke' is not recognized`         | **Windows pipe bug.** Use `$env:PLAYWRIGHT_GREP='@critical                                                                                                                                                        | @smoke'`instead of`--grep='@critical | @smoke'`. CMD interprets ` | ` as a shell pipe. |

## Tamagui / Custom Component Pitfalls

### Custom dialog backdrops intercept Playwright clicks

Tamagui custom dialogs (not `<Dialog>`) that use a `position: fixed` backdrop `YStack` will intercept Playwright's hit test via `elementFromPoint()`. Even with proper `zIndex`, Playwright sees the backdrop, not the dialog content.

**Fix for the component:** Add `onPress={(e) => e.stopPropagation()}` to the inner dialog panel, plus `role="dialog"`, `aria-modal`, and `aria-label` for testability.

**Fix for the test:** Use `{ force: true }` on clicks inside the dialog, but **always scope locators to the dialog first**:

```typescript
const dialog = page.getByRole('dialog', { name: 'My Dialog' });
await dialog.getByRole('button', { name: /confirm/i }).click({ force: true });
```

> **Warning:** Unscoped `page.getByRole('button')` with `force: true` can match navigation buttons outside the dialog, causing it to close or navigate away.

### Adding testID for selection UIs

When Tamagui components lack semantic roles (e.g., player selection rows), add `testID` which renders as `data-testid` on web:

```tsx
<XStack testID={`item-${id}`} role="option" aria-label={`Select ${name}`}>
```

### Collapsed accordion sections

Accordion-style sections render children but keep them hidden. Always expand the accordion (click the header) before asserting on or clicking elements inside it.
