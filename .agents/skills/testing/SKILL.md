---
name: testing
description: 'Jest unit and DB tests, Playwright hermetic E2E and live-backend integration specs, which suites gate merge, the tiered test-user convention, surface-map registration, and the cross-platform test architecture (ADR-0015 semantic page objects, ADR-0016 AppDriver/dual-mode seams). Load when: writing or modifying any spec, running tests before committing, debugging a test failure locally or in CI, choosing a test layer, or planning E2E strategy / auditing coverage.'
metadata:
  scope: 'apps/web-e2e/**, maestro/**, lib/shared-components/**'
---

# Skill: Testing

Four test layers. This file carries the rules that must be in context whenever you touch a spec — writing or modifying a test, running tests before committing, debugging a failure, choosing a layer, or planning E2E strategy. Everything longer than a paragraph lives in `references/` and loads on demand.

## Test Layers

- **Unit** (Jest) — isolated logic, components, resolvers with mocked deps.
- **DB** (Jest + real PostgreSQL) — schema constraints, FK cascade, query correctness.
- **E2E, mocked** (Playwright, `src/tests/`) — full user flows against a static build; hermetic, no backend.
- **Integration** (Playwright, `src/integration/tests/`) — cross-service, multi-user, async backends against live APIs. Runnable locally: credentials are auto-linked from the main repo's `.env` by the worktree bootstrap script ([integration-commands.md](references/integration-commands.md#integration-tests-can-be-run-locally)).

Scenario→layer decision table and file-naming convention: [references/test-type-selection.md](references/test-type-selection.md). Per-layer authoring guides: [Reference Files](#reference-files).

## Cross-Platform Suite Roles (ADR-0015 / ADR-0016)

The UI is built once in `lib/shared-components` and rendered on web and native; the test architecture mirrors that. Source of truth: [ADR-0015](../../../docs/decisions/0015-semantic-page-objects.md) and [ADR-0016](../../../docs/decisions/0016-test-dependency-injection.md) — the ADRs win on any disagreement.

- `src/tests/` — hermetic mocked-backend specs; gates PR merge via CI Gate. Not for live-backend validation.
- `src/integration/tests/` — live-backend specs; nightly backstop plus the opt-in `run:integration` label. Never blocks merge.
- `src/tests/shared/*.dual.spec.ts` — ONE spec body running both mocked (PR CI) and live (`shared-live`) via the ADR-0016 backend seam.
- `maestro/` — **visual/AI-judging QA sweep only** (`/mobile-qa`, see [mobile-qa](../mobile-qa/SKILL.md)). Not functional native regression; do not build assertion-heavy Maestro suites.
- `apps/web-e2e/src/driver/` — `AppiumNativeDriver`'s WDIO/Appium runtime, which runs the shared suite natively via `e2e-native-android.yml`; not a parallel spec suite. (`apps/app-e2e` was retired in LS-8697.)

**The native principle:** functional native E2E coverage comes from running the **same shared Playwright suite** through a native `AppDriver` implementation (ADR-0016 §Native rollout blueprint; the driver has landed — see ADR-0018; enablement under epic LS-8444) — not from new Maestro suites or a separate native spec tree. Ticket `BaseScreen` page-object migration + driver enablement, never per-feature Maestro functional flows. Authoring rules and the full dual-mode contract: [references/test-architecture.md](references/test-architecture.md).

## Critical Rules

1. **Precondition for committing test code: the new/modified tests have run locally and passed.** For bulk test writing (>5 files), run per-file as you write — an untested test file is a guess about behavior, not a verification.
2. **Seed GrowthBook flags for flag-gated routes.** The CI runner has no `VITE_GROWTHBOOK_CLIENT_KEY`, so every flag defaults off. A spec navigating to a flag-gated route (e.g. `/football/**` behind `football_enabled`) must `page.addInitScript()` setting `window.__gbSeededFeatures = { flagName: { defaultValue: true } }` before `page.goto()` — the #1 source of `CI: E2E Failure` labels ([references/ci-failure-prevention.md](references/ci-failure-prevention.md)).
3. **Run E2E tests locally before pushing when you modify E2E files** — `make pc` does NOT run Playwright. Use `E2E_AUTH_MODE=ci` to skip the OAuth device flow; run the spec you changed, or the full `@critical` suite if you touched shared fixtures/helpers. The gate also fires when you touched no E2E file: run any spec the ticket names as a verification gate, any `.integration.spec.ts` you modified, and any spec you find by grepping for the changed route, component, or GraphQL operation. "Requires real infrastructure" is not a reason to skip — credentials are auto-linked in a standard worktree. Commands, the missing-credentials fallback, and the UNVERIFIED rule for autonomous sessions: [references/e2e-ci-and-validation.md](references/e2e-ci-and-validation.md) and [references/integration-commands.md](references/integration-commands.md).
4. **Precondition for network handling in `apps/web-e2e/src/tests/`: `route.fulfill()` or `route.fallback()`.** Those specs run with no backend in CI; `route.continue()` forwards to a non-existent server and hangs. `apps/web-e2e/src/integration/tests/` is **exempt** — direct `page.request` calls are correct there by design ([references/merge-gating.md](references/merge-gating.md#integration-vs-e2e-directory-distinction)).
5. **Visual verification uses web-first behavioral assertions** (`await expect(locator).toBeVisible()`). `toHaveScreenshot()` / `toMatchSnapshot()` belong in Storybook/Chromatic — in E2E they couple behavior to pixels and flake cross-platform.
6. **Every wait is condition-based.** `waitForTimeout()` is the #1 flake source, and `networkidle` is banned repo-wide (LS-9793). After `page.goto()` prefer direct element waits; to wait for a navigation use `page.waitForURL(pattern, { waitUntil: 'commit' })` — the only variant that survives a bfcache restore — except when the app may trigger a second client-side navigation to the same URL during init. Full checklist: [references/e2e-determinism.md](references/e2e-determinism.md).
7. **Precondition for any `@ts-ignore` / `eslint-disable` in tests: a separate ticket documents why the types or code cannot be fixed.** Suppression in test code hides the bugs the test exists to catch.
8. **Tag test suites** (`@critical`, `@smoke`, `@regression`, `@slow`) for CI filtering; `@visual` is deprecated ([references/test-tagging-guide.md](references/test-tagging-guide.md)).
9. **Selector sync rule** — when a PR changes anything a spec might assert (a `testID`, an accessible name, user-visible copy, a conditional render or responsive branch, a GraphQL operation, a shared mock/fixture factory), update the specs and page objects asserting it **in the same PR**. Do not infer coverage from green CI: the surface map selects **zero** specs for a change to a shared page object, and missed the breakage in both LS-9762 and LS-9718. Reverse lookup and the selection gap: [references/e2e-change-safety.md](references/e2e-change-safety.md).
10. **Kill background servers when done** — stale processes hold native `.node` addons. Use `make kill-stale`.
11. **Prefer Glob/Grep over `find`/`wc`** when discovering or counting spec files, baselines, and snapshot dirs.

## What Gates Merge

Merge is blocked only by the four required contexts in `.github/ruleset.json` (`bot-review`, `No Merge Conflicts`, `Verify All Migrations Applied`, `CI Gate`). All test signal reaches the gate through **CI Gate** — one aggregate commit status per head SHA posted by the CI Pipeline summarize job (`.github/scripts/ci-gate.js`), folding in lint, format, build, unit tests, custom-checks, and affected hermetic e2e shards. `ruleset.json` is config, not necessarily live state — check the live required set before asserting it.

- **Blocks merge:** unit + typecheck (`nx affected -t typecheck test`), lambda unit suites (including `lambdas/db`'s unit config; its `*.db.spec.ts` suite does not gate), and affected hermetic E2E shards.
- **Does not block merge:** DB specs (`run-db-tests.yml`, Discord notification only), live integration (nightly backstop + `run:integration` label), Storybook preview deploys.

Per-suite table with where each runs, the `lambdas/db` gate hole, the never-run Storybook story target, `run:integration` label semantics, the hermetic/live directory split, the ADR-0014 nightly-backstop design, and the state of coverage tooling: [references/merge-gating.md](references/merge-gating.md).

## Tiered Test-User Model (premium-default, free for gates)

Both Playwright suites share one tiered test-user convention. Using the wrong tier makes premium-gated UI silently render its locked state and hides real bugs behind passing tests (the LS-5030 regression).

| Tier      | Hermetic identity                   | Integration identity     | Use for                                      |
| --------- | ----------------------------------- | ------------------------ | -------------------------------------------- |
| `premium` | `useTier(page,'premium')` — DEFAULT | `loginAs('premium', n)`  | Any feature test; no opt-in needed           |
| `free`    | `useTier(page,'free')`              | `loginAs('free', n)`     | **Only** explicit gate assertions            |
| `admin`   | `useTier(page,'admin')`             | `loginAs('admin', 1\|2)` | `/admin/*` surfaces and admin-only resolvers |

1. **Premium is the default.** The hermetic baseline `GetUserById` mock and the integration `api`/`api2` fixtures resolve to premium without opt-in — new specs on non-admin surfaces leave the tier alone.
2. **`free` is for proving the gate fires.** A spec calling `useTier(page,'free')` or pulling `freeJwt` MUST assert the gate engaged (upgrade CTA, `PREMIUM_REQUIRED`, `PremiumGate` overlay, disabled affordance). Without that assertion, switch it back to premium.
3. **`admin` is for admin surfaces only** — elsewhere it is a noisy strict-superset of `premium`.

The pool is **6 premium / 6 free / 2 admin** seats; use seats ≥ 2 when a spec needs two distinct same-tier identities in one league. Copy-paste examples for both suites and the review guard: [references/tiered-test-users.md](references/tiered-test-users.md).

## New-Spec Registration Contract (surface maps)

Every Playwright spec must be registered in its suite's surface map — a JSON manifest mapping the spec to the source globs it exercises (`apps/web-e2e/src/e2e-surface-map.json` for hermetic, `apps/web-e2e/src/integration/integration-surface-map.json` for integration). Both feed the shared selector (`.github/scripts/integration-select/select-specs.mjs`), which runs only the specs whose globs match the PR's changed files plus the always-on `@critical` net (LS-7846).

**Checklist item for every new, renamed, or rescoped spec: update its map entry in the same commit.** `.github/checks/integration-select-tests.sh` (PR CI `custom-checks`, folds into CI Gate) fails when a spec on disk has no map entry. Lean broad with globs: over-selection costs a few CI minutes, under-selection means the spec silently stops running on exactly the PRs that break it — and if the selector errors, PR CI degrades to `@critical`-only as a warning, quietly weakening coverage for everyone. When a spec starts covering a new surface, add the glob then; the nightly coverage auditor (LS-7850) is a backstop, not the contract.

## Reference Files

**Start here when something is wrong or you are about to push:**

- ⭐ [e2e-failure-atlas.md](references/e2e-failure-atlas.md) — a spec is failing: symptom → root cause → why the obvious fix is wrong
- ⭐ [e2e-determinism.md](references/e2e-determinism.md) — the 12 levers gating every E2E/integration PR
- ⭐ [e2e-change-safety.md](references/e2e-change-safety.md) — changing product code without landing a red spec on `main`
- ⭐ [ci-failure-prevention.md](references/ci-failure-prevention.md) — top CI failure patterns and their proactive checklists

**Authoring and running:**

- [test-commands.md](references/test-commands.md) — MCP-first commands, shell fallbacks, e2e scope detection
- [test-architecture.md](references/test-architecture.md) — page objects, components, dual-mode specs, the ESLint-enforced bans
- [test-type-selection.md](references/test-type-selection.md) — picking a layer; naming a new spec file
- [unit-testing.md](references/unit-testing.md) · [e2e-testing.md](references/e2e-testing.md) · [integration-testing.md](references/integration-testing.md) · [db-integration-tests.md](references/db-integration-tests.md) — per-layer authoring guides
- [tiered-test-users.md](references/tiered-test-users.md) — tier examples and the free-tier review guard
- [integration-commands.md](references/integration-commands.md) — integration Nx targets, CLI, environment setup
- [ui-integration-patterns.md](references/ui-integration-patterns.md) · [ui-serial-phases.md](references/ui-serial-phases.md) — Playwright+Tamagui patterns; serial phase template and `switchUser`
- [playwright-best-practices.md](references/playwright-best-practices.md) · [test-tagging-guide.md](references/test-tagging-guide.md) — required patterns; choosing a tag

**Infrastructure and policy:**

- [merge-gating.md](references/merge-gating.md) — what blocks merge, suite boundaries, coverage reality
- [api-isolation-architecture.md](references/api-isolation-architecture.md) — the 3-layer mock system
- [e2e-ci-and-validation.md](references/e2e-ci-and-validation.md) — CI behavior and troubleshooting a run
- [run-e2e-headless.md](references/run-e2e-headless.md) · [shutdown-hygiene.md](references/shutdown-hygiene.md) — headless/agent runs; stale process cleanup
- [e2e-ledger.md](references/e2e-ledger.md) — bisecting a regression to its introducing commit
- [zero-zero-maintenance-policy.md](references/zero-zero-maintenance-policy.md) — the 0/0 nightly policy: once 3 consecutive nightly runs hit 0 failures / 0 flakies, any new failure is P0 and new tests need 5 consecutive local passes. Triage of a red nightly: [nightly-green-campaign](../nightly-green-campaign/SKILL.md)

## Provenance and maintenance

- 2026-07-02: _What Gates Merge_, _New-Spec Registration Contract_, _Coverage Truth_, and the `nx_run_e2e_specs` commands added from the skills audit (`scratch/skills-audit/synthesis.json`).
- 2026-09-12 (LS-9982): restructured into a thin dispatcher under the 15KB SKILL.md budget; commands, architecture, gating caveats, tier examples, and layer selection moved to `references/`.

Re-verify volatile facts before trusting them:

- Required merge contexts: `grep -n '"context"' .github/ruleset.json` (config) vs live: `gh api repos/{owner}/{repo}/rulesets`
- PR CI test command: `grep -n "nx run-many -t typecheck test" .github/workflows/ci-pipeline.yml` (sharded across the `test` matrix — LS-11028)
- Lambda test targets: `pnpm exec nx show project db --json` (look for an explicit `test` target, not the package.json script)
- Surface-map enforcement: `head .github/checks/integration-select-tests.sh`
- Test-user pool seats: `grep -n "TIER_SEATS" apps/web-e2e/src/utils/test-user-auth.ts`
- Further probes (DB-suite triggers, coverage absence): [references/merge-gating.md](references/merge-gating.md)
