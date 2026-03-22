---
name: e2e-testing
description: 'Write, run, and debug Playwright E2E tests: auth fixtures, API isolation, GraphQL mocking, test tagging, static build serving (port 4280), and CI pipeline. Load before creating or modifying any E2E test.'
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

## Shutdown Hygiene (Windows Lock Prevention)

Always stop Playwright/static servers when done. Stale processes hold native `.node` addons, blocking `make install` for all junctioned worktrees. Use `make kill-stale` to find and stop them.

> 📎 **Detection scripts and full details**: see [references/shutdown-hygiene.md](references/shutdown-hygiene.md)

## When to Use

- Writing a new E2E test for a web feature
- Debugging a failing E2E test
- Adding GraphQL mocks for a new page/feature
- Running E2E tests locally or understanding CI behavior
- Adding page objects for new routes

## Mocked E2E vs. True UI Integration Tests

Mocked E2E tests (this skill) cover a component or page in **isolation** using `page.route()` to return controlled data. They are fast, deterministic, and require no running backend.

**For comprehensive user stories that involve multiple roles, real persistence, or cross-user visibility, also write a UI integration test** (see `.agents/skills/integration-testing/SKILL.md`). Use this table to decide:

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

The production build bakes in real AWS URLs from `.env`. The `_apiIsolation` auto-fixture in `auth-enhanced.ts` intercepts **all requests not targeting port 4280**, ensuring complete network isolation.

Three layers execute in LIFO order: **test `page.route()` → auth.ts overrides → baseline mocks**. The baseline (`shared-mocks.ts`) covers ~30 common operations. Unknown operations return an error and throw after the test.

- **Add new baseline**: edit `shared-mocks.ts`, add lowercased key to `BASELINE_GRAPHQL_RESPONSES`
- **Tests just add `page.route()`** — it overrides the baseline. Use `route.fallback()` for unhandled ops.
- Tests that don't need data (about page, nav) work with zero mocking setup.

> 📎 **Full 3-layer architecture, baseline catalog, auth.ts overrides, URL pattern table**: see [references/api-isolation-architecture.md](references/api-isolation-architecture.md)

> **Do NOT use MSW for E2E tests.** Playwright's `page.route()` intercepts at the network protocol layer and is the first-class solution.

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

> **🚫 NEVER use `route.continue()`** — E2E tests are hermetic (no backend in CI).
> Use `route.fallback()` for unhandled operations — they cascade through the 3-layer architecture.
>
> ```typescript
> await route.fallback();        // ✅ cascades to baseline mocks
> await route.fulfill({ ... });  // ✅ explicit response for specific operation
> await route.continue();        // ❌ hangs in CI, hits backend locally
> ```
>
> **Never return `{ errors: [...], data: null }` as a catch-all** — Apollo error boundaries crash the UI.

> **Avoid broad `postData.includes()` matches** — `'getleague'` also matches `getleagueteams`. Use `extractOperationName()` from `shared-mocks.ts` instead.

> **Mock response structure:** Always wrap in `{ data: { ... } }` with the correct GraphQL **field name** (not operation name):
> `{ data: { league: null } }` ✅ — `{ data: { GetLeagueById: null } }` ❌ — `{ getLeagueById: null }` ❌. See `shared-mocks.ts` for patterns.

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

## Mandatory Test Execution

After writing or modifying test files, you **must** run the tests locally before committing. Never push untested test code.

### Jest unit/integration tests

After writing `.spec.ts`, `.spec.tsx`, `.test.ts`, or `.test.tsx` files:

```bash
pnpm exec nx run <project>:test --testPathPattern="NewSpecName"
```

### Playwright E2E tests

After writing `.spec.ts` or `.integration.spec.ts` E2E files in `apps/web-e2e/src/`:

1. Build the web app: `pnpm exec nx build web`
2. Run the specific test: `pnpm exec nx e2e web-e2e -- --grep='test name' --config=apps/web-e2e/playwright.config.ts`

### Rules

- If tests fail, fix them in the same commit — never push broken tests
- Never skip test execution to save time — broken tests that reach CI waste more time than running them locally
- For bulk test writing (>5 files), run tests per-file as you write rather than batching at the end

## Test Tags

| Tag           | Meaning                                          | CI Behavior               |
| ------------- | ------------------------------------------------ | ------------------------- |
| `@critical`   | Core user flows — must never break               | Always runs in CI         |
| `@smoke`      | Quick sanity checks — page loads, nav works      | Runs on every PR          |
| `@regression` | Edge cases, error handling, complex interactions | Runs on merge to main     |
| `@visual`     | Snapshot / visual regression tests               | Manual trigger or nightly |
| `@slow`       | Tests that take >10 s (e.g. full season flows)   | Excluded from CI default  |

CI defaults to `@critical` (excluding `@slow`). To run all:

```powershell
# IMPORTANT: The pipe `|` in grep patterns is interpreted by Windows CMD
# (which Nx spawns internally). Always use the $env: variable approach:
$env:PLAYWRIGHT_GREP='@critical|@smoke|@regression' ; pnpm exec nx e2e web-e2e
```

> **Unsure which tag?** Load `references/test-tagging-guide.md` for the full decision guide with examples and common mistakes.

## Playwright Best Practices (REQUIRED)

> **Full details in `references/playwright-best-practices.md`** — load when writing or reviewing test code.

Key rules (always apply):

- **Never** use `waitForTimeout()` — use condition-based waits instead
- **Never** use `waitForLoadState('networkidle')` — wait for specific elements
- **Never** use `page.$()`, `page.$$()`, `page.waitForSelector()` — use Playwright locators
- **Always** use web-first assertions (`await expect(locator).toBeVisible()`)
- **Always** pass `--config=apps/web-e2e/playwright.config.ts`
- Prefer role-based selectors > text > placeholder > testID > CSS

## Running Tests, CI Pipeline & Validation

> **Full details in `references/e2e-ci-and-validation.md`** — load when running tests, understanding CI, or troubleshooting.

Quick reference:

```powershell
# All tests
pnpm exec nx e2e web-e2e

# Single test (no pipe — safe)
pnpm exec nx e2e web-e2e -- --grep='League Detail'

# Multiple tags (MUST use env var on Windows)
$env:PLAYWRIGHT_GREP='@critical|@smoke' ; pnpm exec nx e2e web-e2e

# Interactive UI mode
pnpm exec nx e2e:ui web-e2e
```

**Pre-commit rule (MANDATORY):** If you wrote or changed **any** test file (`.spec.ts`, `.spec.tsx`, `.test.ts`, `.test.tsx`, `.integration.spec.ts`) **or any file under** `apps/web-e2e/src/`, you **must** run the relevant tests locally (including the Playwright E2E suite for `apps/web-e2e/src/` changes) and confirm they pass before committing. This applies to E2E tests under `apps/web-e2e/src/` as well as Jest tests in any project. Skipping local test execution is never acceptable — broken tests that reach CI waste far more time than running them locally.

**Selector sync rule:** When a PR changes the login page, landing page, or auth guard, update all E2E selectors referencing those components in the same PR.
