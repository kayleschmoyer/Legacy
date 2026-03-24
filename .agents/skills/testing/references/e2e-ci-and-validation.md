# E2E CI Pipeline & Local Validation

> Extracted from e2e-testing SKILL.md — load when configuring CI, running tests locally, or troubleshooting E2E failures.

## Nx Targets

| Target       | Command                                           |
| ------------ | ------------------------------------------------- |
| `e2e`        | Run all Playwright tests                          |
| `e2e:ui`     | Interactive UI mode (pick & debug tests visually) |
| `e2e:headed` | Run with visible browser                          |
| `e2e:debug`  | Run with Playwright Inspector                     |
| `typecheck`  | TypeScript check (no emit)                        |
| `lint`       | ESLint                                            |

> **`@visual` snapshot tests** still exist but have no dedicated Nx target. Run them with
> `pnpm exec nx e2e web-e2e -- --grep='@visual'` and update baselines with
> `pnpm exec playwright test --config=apps/web-e2e/playwright.config.ts --update-snapshots --grep='@visual'`.
> These tests are deprecated and tracked for removal under LS-1779.

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
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests timeout on `goto()`           | Ensure `dist/apps/web` exists (`pnpm exec nx build web`). Playwright's webServer serves it on port 4280.                                                                                                          |
| Auth fails locally                  | Delete `.auth/token-cache.json` and re-run. Or use `$env:E2E_AUTH_MODE='ci'` to skip OAuth device flow.                                                                                                           |
| Snapshots differ on CI vs local     | CI uses Linux Chromium — update snapshots via the GH Action                                                                                                                                                       |
| GraphQL mock not intercepting       | Check the URL filter excludes `/@fs/` and `.ts`/`.js` paths                                                                                                                                                       |
| Tests hang on unmocked operation    | Add the operation to `shared-mocks.ts` (if common) or mock it in your test. The `_apiIsolation` fixture throws after the test with a list of unmocked operations.                                                 |
| Mock never intercepts query         | Check for broad `includes()` match — use quoted operation name                                                                                                                                                    |
| Flaky: some tests pass vacuously    | Mock returns `data: null` — use `{ data: { queryName: [] } }`                                                                                                                                                     |
| Expired JWT test shows auth content | The app's silent `/refresh-jwt` call is succeeding against real AWS. API isolation fixture handles this automatically — make sure your test extends from `auth-enhanced.ts` fixtures, not raw `@playwright/test`. |
| `'smoke' is not recognized`         | **Windows pipe bug.** Use `$env:PLAYWRIGHT_GREP='@critical \| @smoke'` instead of `--grep='@critical \| @smoke'`. CMD interprets `\|` as a shell pipe.                                                            |
