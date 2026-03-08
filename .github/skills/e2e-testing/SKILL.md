---
name: e2e-testing
description: 'Write, run, and debug Playwright E2E tests for the web app; covers file placement, auth fixtures, GraphQL mocking with page objects, snapshot conventions, test tagging (@critical/@smoke/@regression), Nx targets, and CI pipeline integration. Load this skill before creating or modifying any E2E test.'
---

# Skill: E2E Testing (Playwright — Web)

## Overview

End-to-end tests for the web app live in `apps/web-e2e/` and use [Playwright](https://playwright.dev). Tests run against the Next.js dev server (`http://localhost:4200`) with JWT authentication managed by a global setup script.

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
│   ├── global-teardown.ts        # MSW cleanup
│   ├── fixtures/
│   │   ├── auth.ts               # Base fixture with route-level GraphQL mocking
│   │   └── auth-enhanced.ts      # test, adminTest, unauthTest, createCustomAuthTest
│   ├── pages/                    # Page objects (reusable locators per route)
│   │   ├── navigation.page.ts    # Header, nav, mobile menu
│   │   ├── league.page.ts        # League detail, create, list
│   │   ├── draft.page.ts         # Draft board UI
│   │   └── players.page.ts       # Player stats, detail, comparison
│   ├── mocks/
│   │   ├── server.ts             # MSW Node.js server
│   │   ├── handlers.ts           # GraphQL + REST mock handlers
│   │   ├── graphql/              # Per-domain GraphQL mock factories
│   │   │   ├── league.mocks.ts   # League queries & mutations
│   │   │   ├── draft.mocks.ts    # Draft queries & mutations
│   │   │   ├── matchup.mocks.ts  # Matchup queries & mutations
│   │   │   ├── player.mocks.ts   # Player & stats queries
│   │   │   └── user.mocks.ts     # User & auth queries
│   │   └── browser.ts
│   ├── support/
│   │   ├── test-setup.ts         # Mock server reset hooks
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

| Export                 | Use Case                                    |
| ---------------------- | ------------------------------------------- |
| `test`                 | Default authenticated user                  |
| `adminTest`            | Admin-level JWT (accessLevel: 'admin')      |
| `unauthTest`           | No auth — tests login flows                 |
| `createCustomAuthTest` | Factory for custom email/accessLevel combos |

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

For pages that call the GraphQL API, use `page.route()` to intercept:

```typescript
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) =>
      url.toString().includes('/graphql') && !url.toString().includes('/@fs/'),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('getuserleagues')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              userLeagues: [
                { __typename: 'League', id: 1, name: 'Test League' },
              ],
            },
          }),
        });
      } else {
        await route.fallback();
      }
    },
  );
});
```

> **Important:** Always call `route.fallback()` (not `route.continue()`) for unmatched
> operations so other route handlers can process them.

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

CI defaults to `--grep='@critical|@smoke'`. To run all:

```powershell
pnpm exec nx e2e web-e2e -- --grep='@critical|@smoke|@regression'
```

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
    await this.page.waitForLoadState('load');
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

# Single test file
pnpm exec nx e2e web-e2e -- --grep='League Detail'

# Specific tag
pnpm exec nx e2e web-e2e -- --grep='@critical'

# Interactive UI mode
pnpm exec nx e2e:ui web-e2e

# Headed (see browser)
pnpm exec nx e2e:headed web-e2e

# Debug with inspector
pnpm exec nx e2e:debug web-e2e
```

## CI Pipeline

E2E tests run in **Stage 4** of the CI pipeline (after quality gates and build validation):

1. Pre-built web artifact is downloaded (or falls back to Nx remote cache)
2. Playwright browsers are installed (cached)
3. Static file server starts against `dist/apps/web` on port 4200
4. Tests run with `--grep='@critical|@smoke'` by default
5. Results are parsed: passed/failed/success-rate/execution-time

The CI action supports inputs: `test-patterns`, `browser`, `timeout-minutes`, `retry-count`.

## Troubleshooting

| Problem                         | Fix                                                         |
| ------------------------------- | ----------------------------------------------------------- |
| Tests timeout on `goto()`       | Ensure `pnpm exec nx serve web` is running on port 4200     |
| Auth fails locally              | Delete `.auth/token-cache.json` and re-run                  |
| Snapshots differ on CI vs local | CI uses Linux Chromium — update snapshots via the GH Action |
| GraphQL mock not intercepting   | Check the URL filter excludes `/@fs/` and `.ts`/`.js` paths |
| `route.continue()` conflicts    | Use `route.fallback()` instead to allow handler chaining    |

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
