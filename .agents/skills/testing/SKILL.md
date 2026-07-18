---
name: testing
description: 'Write, run, and debug tests: Jest unit tests, Playwright E2E tests (hermetic, mocked), Playwright integration tests (real services), and DB integration tests (Jest + real PostgreSQL). Covers test type selection, which suites gate merge, surface-map registration, coverage reality, commands, tagging, API isolation, and CI pipeline — plus the cross-platform test architecture (ADR-0015 semantic page objects, ADR-0016 AppDriver/BaseScreen DI seams, dual-mode specs) and the suite-role split: functional native coverage comes from the shared Playwright suite via a native driver, Maestro is the visual QA sweep only, apps/app-e2e is the WDIO/Appium stack the native driver builds on. Load before any E2E test-strategy or coverage-planning work, not just when editing specs. references/e2e-determinism.md is the 12-lever determinism checklist for every PR touching E2E or integration tests.'
metadata:
  scope: 'apps/web-e2e/**, apps/app-e2e/**, maestro/**, lib/shared-components/**'
---

# Skill: Testing

## When to Use

- Writing or modifying any test (unit, E2E, integration, or DB)
- Running tests before committing changes
- Debugging test failures locally or in CI
- Deciding which test type to use for a feature
- **Planning E2E test strategy or auditing coverage — read the suite-role map below first**

## Cross-Platform Suite Roles (ADR-0015 / ADR-0016)

The UI is built once in `lib/shared-components` (Tamagui) and rendered on web and native; the test architecture mirrors that. Source of truth: [ADR-0015 — Semantic Page Object Model](../../../docs/decisions/0015-semantic-page-objects.md) and [ADR-0016 — Test dependency injection](../../../docs/decisions/0016-test-dependency-injection.md) (this skill summarizes; the ADRs win on any disagreement).

| Suite / workspace                                          | Role                                                                                                                                    | NOT its role                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/web-e2e/src/tests/` (hermetic)                       | Deterministic mocked-backend Playwright specs; gates PR merge via CI Gate                                                               | Live-backend validation                                                                |
| `apps/web-e2e/src/integration/tests/` (integration)        | Live-backend Playwright specs; nightly backstop + opt-in `run:integration` label                                                        | Blocking merge                                                                         |
| `apps/web-e2e/src/tests/shared/*.dual.spec.ts` (dual-mode) | ONE spec body running both mocked (PR CI) and live (`shared-live` project) via the ADR-0016 backend seam                                | —                                                                                      |
| `maestro/` (Maestro flows)                                 | **Visual/AI-judging QA sweep only** (`/mobile-qa` — screenshot pairs judged by a vision rubric; see [mobile-qa](../mobile-qa/SKILL.md)) | **Functional native regression testing — do not build assertion-heavy Maestro suites** |
| `apps/app-e2e/` (WDIO + Appium)                            | The runtime stack the future `AppiumNativeDriver` builds on (ADR-0016 §Native rollout blueprint)                                        | A parallel spec suite with its own vocabulary                                          |

**The native principle:** functional native E2E coverage comes from running the **same shared Playwright suite** through a native `AppDriver` implementation (ADR-0016 §Native rollout blueprint — deferred until mobile e2e is a committed, watched suite; enablement tracked under epic LS-8444). It does **not** come from new Maestro suites or a separate native spec tree. When planning native coverage, ticket page-object migration to `BaseScreen` + driver enablement — never per-feature Maestro functional flows.

**Authoring rules (details in [ADR-0016 section below](#test-dependency-injection-adr-0016)):** new page objects extend `BaseScreen` (take an `AppDriver`), not `BasePage` — unless genuinely web-only, documented in the object's doc comment; spec bodies speak page-object verbs only (selector ban, ESLint-enforced); capability-dependent tests gate with `test.skip(!driver.capabilities.X, …)`; no platform branches inside page/component objects.

## Test Type Selection Guide

There are **four** test layers. Three use Jest; two use Playwright.

| Type             | Tool       | Layer | When to Use                                                                                                                                                                                                                                                                                                                                                                                                                  | Reference                                                              |
| ---------------- | ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Unit**         | Jest       | 1     | Isolated logic, utilities, components, resolvers with mocked deps                                                                                                                                                                                                                                                                                                                                                            | [references/unit-testing.md](references/unit-testing.md)               |
| **DB**           | Jest       | 2     | Schema constraints, FK cascade, query correctness against real PostgreSQL                                                                                                                                                                                                                                                                                                                                                    | See [DB Integration Tests](#db-integration-tests) below                |
| **E2E (mocked)** | Playwright | 3     | Full user flows against a static build; hermetic (no backend)                                                                                                                                                                                                                                                                                                                                                                | [references/e2e-testing.md](references/e2e-testing.md)                 |
| **Integration**  | Playwright | 4     | Cross-service validation against real APIs, multi-user flows, async backends. Runs nightly and via the opt-in `run:integration` PR label; never blocks merge — see [What Gates Merge](#what-gates-merge). **Runnable locally** — credentials are auto-linked from the main repo's `.env` by the worktree bootstrap script; see [Local credentials](references/integration-commands.md#integration-tests-can-be-run-locally). | [references/integration-testing.md](references/integration-testing.md) |

### Quick Decision Table

| Scenario                                          | Unit | DB  | E2E | Integration |
| ------------------------------------------------- | ---- | --- | --- | ----------- |
| Pure function / utility logic                     | x    |     |     |             |
| FK constraint or schema default enforced          |      | x   |     |             |
| Cascade delete works correctly in DB              |      | x   |     |             |
| Draft pick state machine correctness              |      | x   |     |             |
| React component renders correctly with known data |      |     | x   |             |
| Empty/loading/error states                        |      |     | x   |             |
| Button disabled when input empty                  |      |     | x   |             |
| Data written to DB and visible to another user    |      |     |     | x           |
| Role-based access verified against real identity  |      |     |     | x           |
| Multi-step workflow across multiple users         |      |     |     | x           |
| Backend async processes complete correctly        |      |     |     | x           |

## What Gates Merge

Merge is blocked only by the four required contexts configured in `.github/ruleset.json` (`bot-review`, `No Merge Conflicts`, `Verify All Migrations Applied`, `CI Gate`). All test signal reaches the merge gate through **CI Gate** — a single aggregate commit status posted per head SHA by the CI Pipeline summarize job (`.github/scripts/ci-gate.js`); it folds in lint, format, build, unit tests, custom-checks, and affected hermetic e2e shards. Caveat: `ruleset.json` is **config, not necessarily live state** — a maintainer applies it via `bash scripts/apply-ruleset.sh`, and until then `check-ruleset.yml` reports (expected) drift. Check the live required set before asserting it (`gh api repos/{owner}/{repo}/rulesets`); the gate mechanics and staging model are documented in [pr-lifecycle](../pr-lifecycle/SKILL.md).

| Suite                                      | Where it runs                                                                                                                                  | Blocks merge?                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Unit + typecheck (Jest, `*.spec.ts`)       | PR CI `test` job: `pnpm exec nx affected -t typecheck test` (`.github/workflows/ci-pipeline.yml`)                                              | **Yes** — folded into CI Gate                                                                           |
| Lambda unit suites (`lambdas/*`)           | Same `nx affected -t test` path                                                                                                                | **Yes, as of 2026-07-02 — except `lambdas/db`** — see gate-hole note below                              |
| DB (`*.db.spec.ts`, target `db:test:db`)   | `run-db-tests.yml`: on push touching `lib/db-client/migrations/**` or `lambdas/db/src/**`, plus manual dispatch (ephemeral PostgreSQL)         | **No** — not a required context; failures notify Discord only                                           |
| Hermetic E2E (Playwright, `src/tests/`)    | PR CI `e2e` job: affected specs via the [surface map](#new-spec-registration-contract-surface-maps) + always-on `@critical` net (LS-7846)      | **Yes** — CI Gate fails if any affected e2e shard fails                                                 |
| Live integration (`*.integration.spec.ts`) | Nightly 03:00 UTC (`run-playwright-tests.yml`) + opt-in `run:integration` PR label (`run-integration-tests.yml`); advisory comment on every PR | **No** — nightly backstop by design, see [ADR 0014](#integration-regression-detection-nightly-backstop) |
| Storybook (`shared-components` stories)    | `deploy-storybook.yml` builds + deploys a preview on PRs touching `lib/shared-components/**` (sticky comment)                                  | **No**                                                                                                  |

**Lambda unit gate hole — closed 2026-07-02 for every jest-bearing lambda except `lambdas/db`.** Before this date, ten lambdas defined `"test": "jest --onlyChanged"` in their `package.json`. On the clean tree CI checks out, `--onlyChanged` finds no modified files, runs **zero tests**, and still passes via `nx.json`'s `passWithNoTests: true` — which is how 9 red `lambdas/db` unit specs sat on `main` while a premium-breaking bug shipped (LS-8247, commit `8575ba9`). The fix (landed in the 2026-07-02 skills-overhaul PR): explicit `@nx/jest:jest` targets with `passWithNoTests: false` in each gated lambda's `project.json` (modeled on `lambdas/game-selection`), so `nx affected -t test` runs the full suites for apple-iap, game-selection, github-webhook, image-upload, jira-proxy, notifications, oauth-proxy, rollbar-discord, stats-lambda, stripe-webhook, and websocket; draft-processor gates via the `@nx/jest` plugin-inferred target (which inherits `passWithNoTests: true` from `nx.json` — it relies on its specs continuing to exist). **`lambdas/db` is deliberately not gated**: its unit suite carried pre-existing red debt at the 2026-07-02 probe (12 failing suites / 37 tests, distinct root causes), so its merged test target is still the `jest --onlyChanged` package.json script. Its `*.db.spec.ts` files run (non-blocking) via `run-db-tests.yml` and are excluded from the unit config (`lambdas/db/jest.config.ts` `testPathIgnorePatterns`), so once the red suites are fixed, gating db is a one-block `project.json` change. `lambdas/db` keeps `test:all-files` (`jest`, no flags) as a manual full-run command; `*.db.spec.ts` needs real PostgreSQL — see [DB Integration Tests](#db-integration-tests). Re-verify: `pnpm exec nx show project db --json` (merged `test` target) and `grep -l '"test": "jest --onlyChanged"' lambdas/*/package.json`.

**Storybook story tests never run in CI (OPEN).** `shared-components:test:stories` exists (`lib/shared-components/project.json`) but is not in the `test` target's `dependsOn` (`test` = `test:web` + `test:mobile`) and no workflow invokes it.

**`run:integration` label semantics:** it runs only the specs touched by the PR / selected by the surface map and posts `<integration-results>` evidence that the reviewer bot parses (LS-4617); the label is auto-removed when the run completes. The nightly run remains the full-suite backstop.

## Tiered Test-User Model (premium-default, free for gates)

Both Playwright suites share a single tiered test-user convention. Use the right tier for the right shape of test — otherwise premium-gated UI silently renders the wrong state and entire suites regress (this is what broke under LS-5030).

| Tier      | Hermetic e2e identity                          | Integration identity (`loginAs`)                | When to use                                                                                |
| --------- | ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `premium` | `useTier(page, 'premium')` (DEFAULT — no call) | `loginAs('premium', 1\|2\|…)` / `premiumJwt[2]` | **Default for any feature test.** Subscriber state; not blocked by `premium-feature-gate`. |
| `free`    | `useTier(page, 'free')`                        | `loginAs('free', 1\|2\|…)` / `freeJwt[2]`       | **Only for explicit gate assertions** — "free user sees the upgrade CTA / cannot do X."    |
| `admin`   | `useTier(page, 'admin')`                       | `loginAs('admin', 1\|2)` / `adminJwt[2]`        | Admin-only surfaces (`/admin/*`). `admin` is also treated as premium server-side.          |

### The rule

1. **Premium is the default.** The hermetic baseline `GetUserById` mock and the integration `api` / `api2` fixtures resolve to premium users without any opt-in. New specs touching any non-admin product surface should leave the tier alone.
2. **`free` is for proving the gate fires.** If a spec calls `useTier(page, 'free')` or pulls `freeJwt`, it MUST contain an assertion that the gate is engaged — an upgrade CTA visible, a `PREMIUM_REQUIRED` error, a `PremiumGate` overlay, the feature disabled. A free-tier spec without a gate assertion is the LS-5030 regression in seed form: it silently flips premium-gated UI to its locked state and hides real bugs behind a passing test.
3. **`admin` is for admin surfaces.** Use it only when the test exercises `/admin/*`, the admin override path, or admin-only resolvers. Otherwise it is a noisy strict-superset of `premium`.

### Hermetic e2e — copy-paste examples

```typescript
// Premium is the DEFAULT — no opt-in needed for a feature test.
import { test, expect } from '../fixtures/auth-enhanced';

test('premium user sees the advanced filter', async ({ page }) => {
  await page.goto('/players');
  await expect(
    page.getByRole('button', { name: /advanced filters/i }),
  ).toBeVisible();
});

// Free-tier spec — MUST assert the gate.
import { useTier } from '../fixtures/shared-mocks';

test('free user is gated out of the advanced filter', async ({ page }) => {
  await useTier(page, 'free'); // before goto
  await page.goto('/players');
  await expect(page.getByText(/upgrade to premium/i)).toBeVisible(); // ← gate assertion
});

// Admin-only surface.
test('admin can reach the admin console', async ({ page }) => {
  await useTier(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible();
});
```

`useTier` and `EntitlementTier` are exported from `apps/web-e2e/src/fixtures/shared-mocks.ts`. It pins `GetUserById` and cascades every other operation to the baseline; call it BEFORE `page.goto()`. See [shared-mocks.ts](../../../apps/web-e2e/src/fixtures/shared-mocks.ts) (LS-8056).

### Live integration — copy-paste examples

```typescript
import { test, expect } from '../fixtures/api';

// Premium is the default identity behind `api` / `api2`.
test('premium user can call a premium-gated resolver', async ({
  premiumJwt,
}) => {
  const result = await gqlFetchEnvelope(premiumJwt, PREMIUM_GATED_QUERY, vars);
  expect(
    result.errors?.some((e) => e.extensions?.code === 'PREMIUM_REQUIRED'),
  ).toBeFalsy();
});

// Free-tier spec — MUST assert the gate fires.
test('free user is blocked by the premium gate', async ({ freeJwt }) => {
  const result = await gqlFetchEnvelope(freeJwt, PREMIUM_GATED_QUERY, vars);
  expect(
    result.errors?.some((e) => e.extensions?.code === 'PREMIUM_REQUIRED'),
  ).toBeTruthy();
});
```

`loginAs(tier, seat)` lives in `apps/web-e2e/src/utils/test-user-auth.ts` and powers the `premiumJwt` / `premiumJwt2` / `freeJwt` / `freeJwt2` / `adminJwt` / `adminJwt2` fixtures in `apps/web-e2e/src/integration/fixtures/api.ts`. The pool is **6 premium / 6 free / 2 admin** seats; use seats ≥ 2 when a spec needs two distinct same-tier identities in one league. See [tiered-auth.integration.spec.ts](../../../apps/web-e2e/src/integration/tests/tiered-auth.integration.spec.ts) (LS-8055).

### Review-checklist guard

When reviewing (self-review or PR review) any new spec, ask:

- Does the spec call `useTier(page, 'free')` or use `freeJwt` / `freeJwt2`?
- If yes: is there an assertion that the gate engages (upgrade CTA, `PREMIUM_REQUIRED` error, disabled affordance, gate overlay)?
- If no: the spec is testing a premium-gated feature against a free user with no gate assertion. **Switch it back to the premium default** unless the gate assertion is added.

This is the LS-5030 footgun in a single check — see `.agents/skills/pr-lifecycle/references/self-review.md`.

## Commands

### MCP-first (preferred)

Use the `nx_run` MCP tool for all test runs — it provides structured output and avoids shell quoting issues:

```
# Run all tests for a project
nx_run(project: "scoring", target: "test")

# Run a specific test file with verbose output
nx_run(project: "web", target: "test", args: ["--testPathPatterns=csrf\\.spec", "--verbose"])

# Bypass Nx cache (use when output appears empty or stale)
nx_run(project: "web", target: "test", args: ["--testPathPatterns=useAuth\\.spec", "--verbose"], noCache: true)

# Run in a worktree
nx_run(project: "scoring", target: "test", args: ["--testPathPatterns=lwar\\.spec", "--verbose"], worktreePath: "$wt")
```

> **`--testPathPatterns` preferred**: always use `--testPathPatterns` (plural) in new commands. The singular `--testPathPattern` still works — the `nx_run` MCP tool auto-translates it — but it is deprecated in Jest 30+. Common causes of "0 tests found": wrong project (e.g., a project whose `test` target delegates to sub-targets rather than running Jest directly), typo in the pattern, or missing `--all` flag (see shell fallback note below).

> **Empty output?** If `nx_run` returns no test names or truncated output, re-run with `noCache: true` before falling back to Bash. Nx cache can replay stale summaries that omit verbose detail.

### Playwright specs via MCP: `nx_run_e2e_specs`

Prefer `nx_run_e2e_specs` over raw `playwright test` / `nx e2e` shell commands for running individual specs — it returns a compact pass/fail summary instead of a full reporter dump:

```
# Hermetic (default): runs against a local static build.
# Precondition: dist/apps/web exists — run nx_run(project: "web", target: "build") first.
nx_run_e2e_specs(specs: ["src/tests/roster-management.spec.ts"], grep: "@critical")

# Live integration: runs against api.legacy-fantasy.com with workers=1 enforced.
nx_run_e2e_specs(specs: ["src/integration/tests/league-creation.integration.spec.ts"], integration: true, withTracing: true)
```

- Spec paths are relative to `apps/web-e2e/` (absolute paths also accepted); `project` selects the browser (default `chromium`); `worktreePath` runs in a worktree.
- Hermetic mode auto-selects a free `E2E_PORT` and forces `E2E_AUTH_MODE=ci` (no OAuth handshake needed).
- Integration mode checks e2e JWT freshness (`~/.legacy-sports/e2e-token.json`, minted by `make e2e-auth`) and `E2E_POOL_PASSWORD` before launching, and returns `graphqlErrors` plus (with `withTracing: true`) `traceArtifacts` — the sanctioned way to get a Playwright trace, since CI traces are off (see [references/e2e-determinism.md](references/e2e-determinism.md), lever 10).

### Shell fallback

Use these only when the `nx_run` MCP tool is unavailable:

```bash
# Run affected tests (preferred)
make test

# Test a specific project
pnpm exec nx run <project>:test

# Run specific test file with verbose output (--all bypasses --onlyChanged default)
pnpm exec nx run <project>:test -- --all --testPathPatterns="SpecName" --verbose

# E2E tests (build first: pnpm exec nx build web)
pnpm exec nx e2e web-e2e -- --grep='test name' --config=apps/web-e2e/playwright.config.ts

# Integration tests (requires deployed/local services)
pnpm exec nx integration web-e2e -- --grep='Flow Name'

# Full pre-commit validation
make pc
```

## Critical Rules

1. **Precondition for committing test code: the new/modified tests have run locally and passed.** For bulk test writing (>5 files), run tests per-file as you write rather than batching at the end — an untested test file is a guess about behavior, not a verification.
2. **Seed GrowthBook flags in E2E tests for flag-gated routes** -- the CI runner has no `VITE_GROWTHBOOK_CLIENT_KEY`, so every flag defaults to off. Tests that navigate to routes behind a GrowthBook flag (e.g., `/football/**` behind `football_enabled`) **must** call `page.addInitScript()` to set `window.__gbSeededFeatures = { flagName: { defaultValue: true } }` before `page.goto()`. Asserting on elements that depend on an unseeded flag is the #1 source of `CI: E2E Failure` labels — the dominant class in the failure table (19 of 22 failure-labeled PRs at the 2026-07-02 analysis; current tally: [references/ci-failure-prevention.md](references/ci-failure-prevention.md)).
3. **Run E2E tests locally before pushing when you modify E2E files** -- `make pc` does NOT run Playwright tests. When you add or change any file under `apps/web-e2e/src/`, run the affected tests locally and confirm they pass before committing. Use `E2E_AUTH_MODE=ci` to skip the OAuth device flow (required for local runs -- without it global setup calls `api.legacysports.dev` and fails). Run the specific spec file you changed, or the full `@critical` suite if you touched shared fixtures/helpers. See [references/e2e-ci-and-validation.md](references/e2e-ci-and-validation.md) for the exact commands.
   - **Also run any spec named in the ticket as a verification gate**, even if you did not modify E2E files — e.g. "run the Phase 5 spec locally before submitting" is a mandatory gate, not a suggestion.
   - **Also run any `.integration.spec.ts` file you modified**, regardless of what the ticket description says. Touching an integration spec triggers the local spec gate automatically.
   - **"Requires real infrastructure" is not a valid reason to skip.** Integration specs (`.integration.spec.ts`) run against the live backend using test-user credentials that are auto-linked from the main repo's `.env` by the worktree bootstrap script — no additional setup is required in a standard worktree. See [references/integration-commands.md](references/integration-commands.md). If credentials are missing, ask the user rather than skipping the gate. In an autonomous session with no user turn available (cloud, no `.env`), do not stall: follow the rule in [fix-integration-tests § Prerequisites](../fix-integration-tests/SKILL.md) — record the gate as UNVERIFIED and continue on static + CI-log evidence.
   - **Search for related E2E tests that cover the surface you changed.** Even if you did not touch any spec file, use `Grep` to find specs referencing the changed route, component name, or GraphQL operation name. Run them locally. If your fix changes behavior the test was asserting, update the test in the same PR — a passing test that asserts the old (wrong) behavior is worse than no test at all.
4. **Precondition for any network-handling code in `apps/web-e2e/src/tests/`: use `route.fulfill()` (explicit response) or `route.fallback()` (cascade to baseline mocks).** These specs run with no backend in CI; `route.continue()` would forward the request to a non-existent server and hang. **`apps/web-e2e/src/integration/tests/` is exempt** — those specs run against the live backend by design; direct `page.request` calls are expected and correct there. See [Integration vs E2E directory distinction](#integration-vs-e2e-directory-distinction).
5. **Precondition for visual verification in E2E: use web-first behavioral assertions** (`await expect(locator).toBeVisible()`). `toHaveScreenshot()` and `toMatchSnapshot()` belong in Storybook/Chromatic — using them in E2E couples behavior tests to pixel rendering and produces cross-platform flake.
6. **Precondition for any wait in E2E: condition-based (`await expect(...).toBeVisible()`, `page.waitForURL(...)`).** `waitForTimeout()` is the #1 source of E2E flake — it waits for time, not for the thing you actually need. See [references/e2e-determinism.md](references/e2e-determinism.md) for the 12-lever determinism checklist that gates every E2E/integration PR. After `page.goto()`, prefer direct element waits over `waitForLoadState('networkidle')` (which does not drain Playwright's CDP navigation tracking and causes `locator.waitFor()` to block); when you need to wait for a navigation, use `page.waitForURL(pattern, { waitUntil: 'networkidle' })`, which fully commits the navigation before any locator action. **Exception**: avoid `waitForURL` when the app may trigger a second client-side navigation to the same URL during initialization (e.g., React Router `pushState` during mount) — it latches onto the second navigation and resolves while `#root` is empty.
7. **Precondition for any `@ts-ignore` / `eslint-disable` in tests: a separate ticket documents why the types or code cannot be fixed.** Suppression in test code hides the same bugs the test exists to catch.
8. **Tag test suites** (`@critical`, `@smoke`, `@regression`, `@slow`) for CI filtering. `@visual` is deprecated. See [references/test-tagging-guide.md](references/test-tagging-guide.md).
9. **Selector sync rule** -- when a PR changes login/landing page UI, update E2E selectors in the same PR.
10. **Kill background servers when done** -- stale processes hold native `.node` addons. Use `make kill-stale`.
11. **Prefer Glob/Grep for file discovery and counting** -- when exploring test file structure (finding spec files, counting baselines, listing snapshot dirs), use the Glob and Grep tools instead of `find`/`wc`. `ls` is fine for quick one-off orientation when there's no equivalent tool or when tool output would be noisier.

## File Naming Convention

| Test Type                           | File Pattern                                                     | Example                             |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Unit test                           | `*.spec.ts`                                                      | `scoring.spec.ts`                   |
| DB integration (Jest + PostgreSQL)  | `*.db.spec.ts` in `lambdas/db/src/schema/`                       | `leagues.db.spec.ts`                |
| Mocked E2E (Playwright)             | `*.spec.ts` in `apps/web-e2e/src/tests/`                         | `league-overview.spec.ts`           |
| Full-stack integration (Playwright) | `*.integration.spec.ts` in `apps/web-e2e/src/integration/tests/` | `live-draft-ui.integration.spec.ts` |

## New-Spec Registration Contract (surface maps)

Every Playwright spec must be registered in its suite's surface map — a JSON manifest mapping the spec file to the source globs it exercises:

| Suite                                  | Map                                                         |
| -------------------------------------- | ----------------------------------------------------------- |
| Hermetic (`src/tests/`)                | `apps/web-e2e/src/e2e-surface-map.json`                     |
| Integration (`src/integration/tests/`) | `apps/web-e2e/src/integration/integration-surface-map.json` |

Both feed the shared selector (`.github/scripts/integration-select/select-specs.mjs`). On a PR: CI runs only the specs whose surface globs match the changed files, plus the always-on `@critical` net (LS-7846); `runAllWhenChanged` globs (backend schema, shared components, shared e2e harness) trigger the full suite. The integration map additionally drives the per-PR advisory comment and the `run:integration` label run.

**Checklist item for every new, renamed, or rescoped spec: update its map entry in the same commit.**

- Enforced: `.github/checks/integration-select-tests.sh` (runs in the PR CI `custom-checks` job, which folds into CI Gate) fails when a spec on disk has no map entry.
- Lean broad with globs — over-selection costs a few CI minutes; under-selection means your spec silently stops running on exactly the PRs that break it. If the selector itself errors, PR CI degrades to `@critical`-only (a warning, not a failure), so a malformed map quietly weakens coverage for everyone.
- When a spec starts covering a new surface, add the glob then; the nightly coverage auditor (LS-7850, istanbul-instrumented runs) detects drift but is a backstop, not the contract.

## DB Integration Tests

DB integration tests live in `lambdas/db/src/schema/*.db.spec.ts`. They use **Jest + real PostgreSQL** (not SQLite, not mocks) via the `jest.db.config.ts` config and the Nx `test:db` target.

**Key files:**

- `lambdas/db/integration-test-setup.ts` — pool setup, `getTestDatabase()`, `cleanupTestData()`, `getTestPlayers()`, exports `integrationTestSchema` (= `PublicSchema` from `@legacy-sports/db-client`)
- `lambdas/db/integration-test-global-setup.ts` / `…teardown.ts` — Jest globalSetup/Teardown hooks
- `lambdas/db/jest.db.config.ts` — Jest config (`testMatch: ['**/*.db.spec.ts']`, `testTimeout: 30000`)

**Running locally (Docker Postgres):**

```bash
# Start Docker Postgres first
docker compose up -d postgres

# Run via Nx MCP tool (preferred)
nx_run(project: "db", target: "test:db")

# Shell fallback
pnpm exec nx run db:test:db
```

**Running against the dev RDS via SSM tunnel:**

Tunnel setup — tag-based NAT-instance discovery (never hardcode an instance ID; it churns, LS-5247), RDS endpoint discovery, and `make db-tunnel` — is homed in [cloudwatch-archaeology Step 5](../cloudwatch-archaeology/SKILL.md#step-5--fall-back-to-the-database). With the tunnel up on `localhost:15432`:

```bash
# 1. Fetch creds from Secrets Manager (name prefix legacy-sports-dev-db-creds-;
#    find the full suffixed name with: aws secretsmanager list-secrets)
aws secretsmanager get-secret-value --region us-east-1 \
  --secret-id "legacy-sports-dev-db-creds-<suffix>" \
  --query SecretString --output text > scratch/migcreds.json

# 2. Run (NODE_TLS_REJECT_UNAUTHORIZED=0 bypasses self-signed cert over tunnel)
TEST_DATABASE_URL="postgresql://$(jq -r .username scratch/migcreds.json):$(jq -r .password scratch/migcreds.json)@127.0.0.1:15432/postgres" \
  NODE_TLS_REJECT_UNAUTHORIZED=0 \
  pnpm exec nx run db:test:db --skip-nx-cache
```

**Environment variable:** tests read `TEST_DATABASE_URL` (preferred) or `DATABASE_URL`. Must point to a real PostgreSQL instance.

**Schema access:** always import `integrationTestSchema` from `../../integration-test-setup` — never create a manual SQLite schema mirror. `integrationTestSchema` re-exports `PublicSchema`, so tests always run against the exact production schema.

**Fixtures and cleanup:** see [references/db-integration-tests.md](references/db-integration-tests.md) for the full fixture model, cleanup strategy, and required patterns when writing new DB tests.

**Cleanup summary:** `cleanupTestData()` deletes only test-owned rows — `DELETE FROM leagues WHERE owner IN (1, 2, 3)` (which cascade-deletes teams, drafts, matchups, draft_picks, etc.) plus bulk-test users 100–119. It never truncates: the DB may contain real production data (real players, real leagues) that must be preserved. See the reference doc for the full invariant.

## DB Integration Test Reference Files

- [DB Integration Tests Guide](references/db-integration-tests.md) — fixture model, cleanup strategy, ID collision rules, query scoping, player data

## 0/0 Nightly Playwright Maintenance Policy

Once 3 consecutive nightly runs hit 0 failures / 0 flakies, the maintenance policy activates: any new failure or flake is P0, new tests require 5 consecutive local passes before merge, and each run must be tracked with a streak comment on LS-4401. See [references/zero-zero-maintenance-policy.md](references/zero-zero-maintenance-policy.md) for the full rules. Operational triage of a red nightly (find run → classify → bisect → remediate) lives in [nightly-green-campaign](../nightly-green-campaign/SKILL.md).

## E2E Reference Files

- [E2E & Integration Determinism](references/e2e-determinism.md) -- ⭐ the 12 levers gating every E2E/integration PR
- [CI Failure Prevention](references/ci-failure-prevention.md) -- ⭐ top CI failure patterns (GrowthBook flag seeding, Suspense text comparison, migration check) with proactive checklists
- [API Isolation Architecture](references/api-isolation-architecture.md) -- 3-layer mock system
- [CI Pipeline & Validation](references/e2e-ci-and-validation.md) -- running tests, CI behavior, troubleshooting
- [Playwright Best Practices](references/playwright-best-practices.md) -- required patterns and anti-patterns
- [Run E2E Headless](references/run-e2e-headless.md) -- suppress HTML reporter for agent/CI/headless execution (always use `nx run web-e2e:e2e` or `nx_run` MCP tool, never bare `playwright test`)
- [Shutdown Hygiene](references/shutdown-hygiene.md) -- stale process detection and cleanup
- [Test Tagging Guide](references/test-tagging-guide.md) -- tag decision guide with examples
- [0/0 Nightly Maintenance Policy](references/zero-zero-maintenance-policy.md) -- rules for maintaining 0 failures / 0 flakies once achieved

## Integration Reference Files

- [Integration Commands](references/integration-commands.md) -- Nx targets, CLI commands, environment setup
- [UI Integration Patterns](references/ui-integration-patterns.md) -- Playwright+Tamagui interaction patterns
- [UI Serial Phases](references/ui-serial-phases.md) -- serial phase template, switchUser helper, decision table

## Semantic Page Object Model (ADR-0015)

Hermetic Playwright specs under `apps/web-e2e/src/tests/` use a **three-layer semantic Page Object Model** (ADR-0015). Selectors live in the page object layer; specs call semantic verbs.

| Layer          | Location                       | Owns                                                            |
| -------------- | ------------------------------ | --------------------------------------------------------------- |
| **Base**       | `apps/web-e2e/src/base/`       | Shared primitives — `BasePage`, `BaseComponent` building blocks |
| **Components** | `apps/web-e2e/src/components/` | Reusable UI surfaces (`NavHeader`, `PremiumGate`, `Toast`, ...) |
| **Pages**      | `apps/web-e2e/src/pages/`      | Route-scoped objects (`DraftPage`, `LeaguePage`, `PlayersPage`) |
| **Spec**       | `apps/web-e2e/src/tests/`      | Calls semantic verbs on the page object — **no raw selectors**  |

**Selector ban in spec files (LS-8096 — ESLint enforced):**

The `apps/web-e2e/.eslintrc.js` `no-restricted-syntax` rule bans these calls in migrated `*.spec.ts` files (selectors must move into the page object layer):

- `getByTestId(...)`
- `getByRole(...)`
- `getByPlaceholder(...)`
- `getByText(...)`
- `locator(...)`

The rule is currently scoped to the migrated specs by basename — see the final override in `apps/web-e2e/.eslintrc.js` for the list. When migrating a new spec to the semantic POM, **add its basename** to that override; once every spec under `src/tests/` is migrated, widen `files` to `src/tests/**/*.spec.ts` and delete the per-file list.

> **Why basename globs + extended LAST:** ESLint legacy-config overrides do not merge `no-restricted-syntax` — the later override replaces the rule list entirely (LS-7947 clobber hazard). The LS-8096 override uses **basename globs** to form a distinct override key, lands **last** in the array so it wins on matched files, and **re-spreads the LS-4458 spec rules** so those checks remain active.

**Writing a new spec under the semantic POM:**

```ts
// spec file — no selectors, only semantic verbs from the page object
import { expect, test } from '../fixtures/pages';

test('player can be added to compare', async ({ playersPage }) => {
  await playersPage.goto();
  await playersPage.search('mike trout');
  await playersPage.addToCompare('Mike Trout');
  await expect(playersPage.compareTray).toContainPlayer('Mike Trout');
});
```

```ts
// pages/players.page.ts — selectors live here, behind verbs
export class PlayersPage extends BasePage {
  async search(query: string) {
    await this.page.getByTestId('player-search-input').fill(query);
  }
  async addToCompare(name: string) {
    await this.page
      .getByRole('row', { name })
      .getByRole('button', { name: /compare/i })
      .click();
  }
}
```

If a spec needs a one-off selector that does not yet belong on the page object, the right move is to add the verb to the page object — not to suppress the lint rule.

## Test Dependency Injection (ADR-0016)

Two DI seams sit on top of the semantic POM — both selected by **Playwright projects**, both documented in [`docs/decisions/0016-test-dependency-injection.md`](../../../docs/decisions/0016-test-dependency-injection.md):

### Platform seam — `AppDriver`

Migrated test objects are written against the platform-neutral `AppDriver`/`UIElement` interfaces (`apps/web-e2e/src/driver/`) instead of Playwright's `Page`/`Locator`. The two object kinds migrate differently: **page objects (screens)** extend `BaseScreen` and take an `AppDriver`; **component objects** take a `UIElement` root (instead of `BaseComponent`'s `Locator` root), so a migrated screen composes them by passing a driver element for the widget's region. On web the driver is `PlaywrightWebDriver` (injected by `fixtures/pages.ts` / `fixtures/dual.ts`); the interface is the seam where an Appium native driver plugs in later. Rules:

- **New page objects take an `AppDriver`** (`BaseScreen`) and **new components take a `UIElement` root**, unless they genuinely need web-only surfaces (CSS assertions, `dispatchEvent` workarounds) — document that need in the object's doc comment and keep extending `BasePage` / `BaseComponent`.
- The driver's `expect*` methods are the retrying assertion surface — never sample `isVisible()` where you mean `expectVisible()`. Runner-level `expect.poll` over driver reads is fine.
- Capability-dependent behavior gates on `driver.capabilities.<cap>` (`networkMock`, `clock`, `trace`, `hover`, `multiWindow`) via `test.skip`, never by failing at runtime.
- Reference migration: `pages/draft.page.ts` (screen) + `components/player-search-box.component.ts` (component).

### Backend seam — dual-mode specs (`src/tests/shared/`)

A spec whose flow deserves both hermetic PR coverage and a live check is written ONCE under `apps/web-e2e/src/tests/shared/` (named `*.dual.spec.ts`), importing `test` from `fixtures/dual.ts` and speaking only page-object verbs + the `TestData` seam (`fixtures/test-data.ts`):

| Where it runs           | Config / project                                           | `backend` | Data preconditions                  |
| ----------------------- | ---------------------------------------------------------- | --------- | ----------------------------------- |
| PR CI + local           | `playwright.config.ts` (existing browser projects)         | `mock`    | `MockTestData` → `route.fulfill()`  |
| Live (local / dispatch) | `playwright.integration.config.ts` → `shared-live` project | `live`    | `LiveTestData` → real backend state |

```bash
# mocked (hermetic — runs in PR CI automatically)
pnpm exec playwright test --project=chromium --config=apps/web-e2e/playwright.config.ts src/tests/shared

# live (needs integration credentials, like any integration run)
pnpm exec playwright test --project=shared-live --config=apps/web-e2e/playwright.integration.config.ts
```

Rules for dual-mode specs: no `page.route()`, no mock payload imports, no identity setup — preconditions go through `TestData` (grow it verb-by-verb; a verb one backend cannot satisfy must throw, not no-op). Assert only on handles `TestData` returned, never on mock-specific incidentals. The nightly integration shard partition does not include `shared-live` yet — wiring it in is an ADR-0016 rollout follow-up.

Reference dual-mode spec: `src/tests/shared/player-stats-search.dual.spec.ts`.

## Integration vs E2E Directory Distinction

`apps/web-e2e/` contains two distinct test suites with different network contracts:

| Directory                             | Test type    | Network                                                   | Playwright config                  |
| ------------------------------------- | ------------ | --------------------------------------------------------- | ---------------------------------- |
| `apps/web-e2e/src/tests/`             | E2E (mocked) | Hermetic — `route.fulfill()` only, no real backend        | `playwright.config.ts`             |
| `apps/web-e2e/src/integration/tests/` | Integration  | Live backend — `baseURL: https://api.legacy-fantasy.com/` | `playwright.integration.config.ts` |

**Why this matters for reviewers and agents:**

- The hermeticity rule (`route.continue()` is forbidden) applies **only** to `apps/web-e2e/src/tests/`. Flagging `page.request.post` or direct API calls in `src/integration/tests/` as a hermeticity violation is incorrect — those specs are designed to hit the live API.
- Integration specs use `*.integration.spec.ts` naming and carry `@integration @critical` tags. Their test names typically include `(Live Backend)`.
- A similar carve-out already exists for `console.log`: `apps/web-e2e/.eslintrc.json` sets `"no-console": "off"` for `src/**/*.ts`.

**Precedent**: [PR #3763](https://github.com/bkrupa/legacy-sports/pull/3763) (LS-4289) — the reviewer bot incorrectly flagged `page.request.post` in a live-draft integration spec across 3 review cycles, requiring `CANNOT-COMPLY` escalation each time. This rule split was created to prevent that from recurring.

## Integration Regression Detection (nightly backstop)

Per [ADR 0014](../../../docs/decisions/0014-integration-nightly-bisect.md), there is **no per-merge integration validation** and the merge queue does not gate on integration runs:

- A PR-branch `run:integration` run still in flight at merge time is **orphaned** (cancelled / result never consumed) by the merge-queue squash + branch deletion. This is **accepted by design** — do not propose per-merge or merge-gated integration validation (LS-7880, Won't Do).
- The **nightly full Playwright run on `main`** is the backstop; it catches any integration regression that merged that day (accepted residual window: up to ~24h).
- **Agent guidance:** when a `run:integration` result matters to a merge decision, confirm the run **completed** before merging, or re-validate on `main` afterward. On a nightly failure, bisect the day's merges — see the runbook in the ADR.

## Coverage Truth

State as of 2026-07-02 — what coverage tooling exists and, more importantly, what does not:

- **No coverage gate exists.** No `coverageThreshold` is configured anywhere in the repo. Nothing in CI collects or aggregates unit-test coverage. The shared `test` target's `ci` configuration (`nx.json` targetDefaults — `coverageReporters: ['text']`) is invoked by no workflow: the PR CI test job runs `nx affected -t typecheck test` with no `--configuration` flag.
- **Local coverage is informational only:** `pnpm exec nx run <project>:test --coverage` writes to `coverage/<project-root>/` (per-project `coverageDirectory`). Nothing consumes these files.
- **The only automated coverage machinery is for E2E, not units:** the `collect-coverage` input on `run-playwright-tests.yml` (LS-7849) runs an istanbul-instrumented build to repopulate the per-spec coverage data behind the [surface maps](#new-spec-registration-contract-surface-maps). It maintains spec→surface mappings; it is not a quality gate.
- `make check-skipped-tests` reports skipped tests; the script is PowerShell (`scripts/check-skipped-tests.ps1`), so it needs `pwsh` on Linux/macOS.
- **OPEN — zero-spec surfaces** (no `*.spec.ts` files at all, verified 2026-07-02): `lib/api`, `lib/graphql`, `lib/codegen`, `apps/video`, `lambdas/layers`, `tools/mcp/browser-server`, `tools/mcp/local-git-server`. If your change lands in one of these, there is no existing suite to extend — budget for creating one or state explicitly in the PR why not.

## Integration with Workflow

Testing is part of the pre-commit sequence: typecheck -> lint -> test -> build. Run the full suite with `make pc`. See [repo-tooling](../repo-tooling/SKILL.md) for all targets.

### E2E Pre-Commit Scope Detection

Before running E2E tests, determine the minimum scope needed based on changed files:

```bash
make e2e-scope
# or: node scripts/e2e-pre-commit.js --json
```

This classifies changes and recommends: **targeted** (specific test files changed), **critical** (@critical suite for fixture/helper changes), or **none** (no E2E-relevant changes). Use `--run` to execute the recommended tests directly.

## Provenance and maintenance

Sections _What Gates Merge_, _New-Spec Registration Contract_, _Coverage Truth_, and the `nx_run_e2e_specs` commands were added 2026-07-02 from the skills audit (`scratch/skills-audit/synthesis.json`, gaps 1, 11, 12). Re-verify volatile facts before trusting them:

- Required merge contexts: `grep -n '"context"' .github/ruleset.json` (config) vs live: `gh api repos/{owner}/{repo}/rulesets`
- PR CI test command: `grep -n "nx affected -t typecheck test" .github/workflows/ci-pipeline.yml`
- Lambda test targets: `pnpm exec nx show project db --json` (look for an explicit `test` target, not the package.json script)
- DB-suite trigger paths: `grep -n -A4 "paths:" .github/workflows/run-db-tests.yml`
- Surface-map enforcement: `head .github/checks/integration-select-tests.sh`
- Coverage absence: `grep -rn coverageThreshold --include='jest*' . ` (expect zero hits) and `grep -n -A6 '"test":' nx.json`
- Zero-spec surfaces: `Glob('<dir>/**/*.spec.ts')` per listed directory
- Test-user pool seats: `grep -n "TIER_SEATS" apps/web-e2e/src/utils/test-user-auth.ts`
