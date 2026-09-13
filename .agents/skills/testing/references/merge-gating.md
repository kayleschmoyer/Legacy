# Merge Gating, Suite Boundaries, and Coverage Truth

> Loaded from [testing SKILL](../SKILL.md). The per-suite gate table lives in [§ What Gates Merge](../SKILL.md#what-gates-merge); this file carries the long-form caveats behind it, the hermetic/live directory split, the nightly-backstop design, and the state of coverage tooling.

## Gate caveats

**Lambda unit gate hole — closed 2026-07-02 for every jest-bearing lambda; `lambdas/db` followed on 2026-09-13.** Before this date, ten lambdas defined `"test": "jest --onlyChanged"` in their `package.json`. On the clean tree CI checks out, `--onlyChanged` finds no modified files, runs **zero tests**, and still passes via `nx.json`'s `passWithNoTests: true` — which is how 9 red `lambdas/db` unit specs sat on `main` while a premium-breaking bug shipped (LS-8247, commit `8575ba9`). The fix (landed in the 2026-07-02 skills-overhaul PR): explicit `@nx/jest:jest` targets with `passWithNoTests: false` in each gated lambda's `project.json` (modeled on `lambdas/game-selection`), so `nx affected -t test` runs the full suites for apple-iap, game-selection, github-webhook, image-upload, jira-proxy, notifications, oauth-proxy, rollbar-discord, stats-lambda, stripe-webhook, and websocket; draft-processor gates via the `@nx/jest` plugin-inferred target (which inherits `passWithNoTests: true` from `nx.json` — it relies on its specs continuing to exist). **`lambdas/db` was left ungated at first**: its unit suite carried pre-existing red debt (12 failing suites / 37 tests at the 2026-07-02 probe; 5 suites / 29 tests by 2026-09-12, almost all mocks lagging newer resolver code). Once those were fixed, it got the same explicit `@nx/jest:jest` target with `passWithNoTests: false` (2026-09-13). The full unit suite takes ~200–280s locally. Its resolver specs re-require the whole schema per test, so without `workerIdleMemoryLimit: '1GB'` in `lambdas/db/jest.config.ts` a jest worker exhausts CI's `--max_old_space_size=2048` heap and crashes an arbitrary suite ("Jest worker ran out of memory") — reproduce locally with that `NODE_OPTIONS` before touching the limit. Its `*.db.spec.ts` files are excluded from the unit config (`lambdas/db/jest.config.ts` `testPathIgnorePatterns`) and still run only via `run-db-tests.yml`, where they do not block merge. `lambdas/db` keeps `test:all-files` (`jest`, no flags) as a manual full-run command; `*.db.spec.ts` needs real PostgreSQL — see [DB Integration Tests](db-integration-tests.md). Re-verify: `pnpm exec nx show project db --json` (merged `test` target) and `grep -l '"test": "jest --onlyChanged"' lambdas/*/package.json`.

**Storybook story tests never run in CI (OPEN).** `shared-components:test:stories` exists (`lib/shared-components/project.json`) but is not in the `test` target's `dependsOn` (`test` = `test:web` + `test:mobile`) and no workflow invokes it.

**`run:integration` label semantics:** it runs only the specs touched by the PR / selected by the surface map and posts `<integration-results>` evidence that the reviewer bot parses (LS-4617); the label is auto-removed when the run completes. The nightly run remains the full-suite backstop.

## Integration vs E2E Directory Distinction

`apps/web-e2e/` contains two distinct test suites with different network contracts:

| Directory                             | Test type    | Network                                                   | Playwright config                  |
| ------------------------------------- | ------------ | --------------------------------------------------------- | ---------------------------------- |
| `apps/web-e2e/src/tests/`             | E2E (mocked) | Hermetic — `route.fulfill()` only, no real backend        | `playwright.config.ts`             |
| `apps/web-e2e/src/integration/tests/` | Integration  | Live backend — `baseURL: https://api.legacy-fantasy.com/` | `playwright.integration.config.ts` |

**Why this matters for reviewers and agents:**

- The hermeticity rule (`route.continue()` is forbidden) applies **only** to `apps/web-e2e/src/tests/`. Flagging `page.request.post` or direct API calls in `src/integration/tests/` as a hermeticity violation is incorrect — those specs are designed to hit the live API.
- Integration specs use `*.integration.spec.ts` naming and carry `@integration @critical` tags. Their test names typically include `(Live Backend)`.
- A similar carve-out already exists for `console.log`: `apps/web-e2e/eslint.config.mjs` sets `"no-console": "off"` for `src/**/*.ts`.

**Precedent**: [PR #3763](https://github.com/bkrupa/legacy-sports/pull/3763) (LS-4289) — the reviewer bot incorrectly flagged `page.request.post` in a live-draft integration spec across 3 review cycles, requiring `CANNOT-COMPLY` escalation each time. This rule split was created to prevent that from recurring.

## Integration Regression Detection (nightly backstop)

Per [ADR 0014](../../../../docs/decisions/0014-integration-nightly-bisect.md), there is **no per-merge integration validation** and the merge queue does not gate on integration runs:

- A PR-branch `run:integration` run still in flight at merge time is **orphaned** (cancelled / result never consumed) by the merge-queue squash + branch deletion. This is **accepted by design** — do not propose per-merge or merge-gated integration validation (LS-7880, Won't Do).
- The **nightly full Playwright run on `main`** is the backstop; it catches any integration regression that merged that day (accepted residual window: up to ~24h).
- **Agent guidance:** when a `run:integration` result matters to a merge decision, confirm the run **completed** before merging, or re-validate on `main` afterward. On a nightly failure, bisect the day's merges — see the runbook in the ADR.

## Coverage Truth

State as of 2026-07-02 — what coverage tooling exists and, more importantly, what does not:

- **No coverage gate exists.** No `coverageThreshold` is configured anywhere in the repo. Nothing in CI collects or aggregates unit-test coverage. The shared `test` target's `ci` configuration (`nx.json` targetDefaults — `coverageReporters: ['text']`) is invoked by no workflow: the PR CI test job runs `nx affected -t typecheck test` with no `--configuration` flag.
- **Local coverage is informational only:** `pnpm exec nx run <project>:test --coverage` writes to `coverage/<project-root>/` (per-project `coverageDirectory`). Nothing consumes these files.
- **The only automated coverage machinery is for E2E, not units:** the `collect-coverage` input on `run-playwright-tests.yml` (LS-7849) runs an istanbul-instrumented build to repopulate the per-spec coverage data behind the [surface maps](../SKILL.md#new-spec-registration-contract-surface-maps). It maintains spec→surface mappings; it is not a quality gate.
- `make check-skipped-tests` reports skipped tests; the script is PowerShell (`scripts/check-skipped-tests.ps1`), so it needs `pwsh` on Linux/macOS.
- **OPEN — zero-spec surfaces** (no `*.spec.ts` files at all, verified 2026-07-02): `lib/api`, `lib/graphql`, `lib/codegen`, `apps/video`, `lambdas/layers`, `tools/mcp/browser-server`. If your change lands in one of these, there is no existing suite to extend — budget for creating one or state explicitly in the PR why not.
