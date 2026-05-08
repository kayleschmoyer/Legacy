---
name: testing
description: 'Write, run, and debug tests: Jest unit tests, Playwright E2E tests (hermetic, mocked), Playwright integration tests (real services), and DB integration tests (Jest + real PostgreSQL). Covers test type selection, commands, tagging, API isolation, and CI pipeline.'
---

# Skill: Testing

## When to Use

- Writing or modifying any test (unit, E2E, integration, or DB)
- Running tests before committing changes
- Debugging test failures locally or in CI
- Deciding which test type to use for a feature

## Test Type Selection Guide

There are **four** test layers. Three use Jest; two use Playwright.

| Type             | Tool       | Layer | When to Use                                                                                                                                                                                                                                                                                                                                                               | Reference                                                              |
| ---------------- | ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Unit**         | Jest       | 1     | Isolated logic, utilities, components, resolvers with mocked deps                                                                                                                                                                                                                                                                                                         | [references/unit-testing.md](references/unit-testing.md)               |
| **DB**           | Jest       | 2     | Schema constraints, FK cascade, query correctness against real PostgreSQL                                                                                                                                                                                                                                                                                                 | See [DB Integration Tests](#db-integration-tests) below                |
| **E2E (mocked)** | Playwright | 3     | Full user flows against a static build; hermetic (no backend)                                                                                                                                                                                                                                                                                                             | [references/e2e-testing.md](references/e2e-testing.md)                 |
| **Integration**  | Playwright | 4     | Cross-service validation against real APIs, multi-user flows, async backends. **Not run in CI for PRs** (too slow) — local execution is the only gate. **Runnable locally** — credentials are auto-linked from the main repo's `.env` by the worktree bootstrap script; see [Local credentials](references/integration-commands.md#integration-tests-can-be-run-locally). | [references/integration-testing.md](references/integration-testing.md) |

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

1. **Always run new/modified tests before committing** -- never push untested test code. For bulk test writing (>5 files), run tests per-file as you write rather than batching at the end.
2. **Run E2E tests locally before pushing when you modify E2E files** -- `make pc` does NOT run Playwright tests. When you add or change any file under `apps/web-e2e/src/`, run the affected tests locally and confirm they pass before committing. Use `E2E_AUTH_MODE=ci` to skip the OAuth device flow (required for local runs -- without it global setup calls `api.legacysports.dev` and fails). Run the specific spec file you changed, or the full `@critical` suite if you touched shared fixtures/helpers. See [references/e2e-ci-and-validation.md](references/e2e-ci-and-validation.md) for the exact commands.
   - **Also run any spec named in the ticket as a verification gate**, even if you did not modify E2E files — e.g. "run the Phase 5 spec locally before submitting" is a mandatory gate, not a suggestion.
   - **Also run any `.integration.spec.ts` file you modified**, regardless of what the ticket description says. Touching an integration spec triggers the local spec gate automatically.
   - **"Requires real infrastructure" is not a valid reason to skip.** Integration specs (`.integration.spec.ts`) run against the live backend using test-user credentials that are auto-linked from the main repo's `.env` by the worktree bootstrap script — no additional setup is required in a standard worktree. See [references/integration-commands.md](references/integration-commands.md). If credentials are missing, ask the user rather than skipping the gate.
3. **Hermetic E2E -- no `route.continue()`** -- there is no backend in CI. Use `route.fulfill()` for explicit responses and `route.fallback()` to cascade to baseline mocks.
4. **Assert behavior, not pixels** -- use web-first assertions (`await expect(locator).toBeVisible()`) over manual checks. Never use `toHaveScreenshot()` or `toMatchSnapshot()` in E2E tests -- visual regression belongs in Storybook/Chromatic.
5. **Never use `waitForTimeout()`** -- use condition-based waits. Never use `waitForLoadState('networkidle')` after `page.goto()` -- it does not drain Playwright's CDP navigation tracking, causing `locator.waitFor()` to block. Use `page.waitForURL(pattern, { waitUntil: 'networkidle' })` instead, which fully commits the navigation before any locator action runs. **Exception**: avoid `waitForURL` when the app may trigger a second client-side navigation to the same URL during initialization (e.g., React Router `pushState` during mount) -- in that case, `waitForURL` latches onto the second navigation and resolves while `#root` is empty. Prefer direct element waits after `page.goto()` whenever possible.
6. **No `@ts-ignore` or `eslint-disable`** in tests -- fix root causes.
7. **Tag test suites** (`@critical`, `@smoke`, `@regression`, `@slow`) for CI filtering. `@visual` is deprecated. See [references/test-tagging-guide.md](references/test-tagging-guide.md).
8. **Selector sync rule** -- when a PR changes login/landing page UI, update E2E selectors in the same PR.
9. **Kill background servers when done** -- stale processes hold native `.node` addons. Use `make kill-stale`.
10. **Prefer Glob/Grep for file discovery and counting** -- when exploring test file structure (finding spec files, counting baselines, listing snapshot dirs), use the Glob and Grep tools instead of `find`/`wc`. `ls` is fine for quick one-off orientation when there's no equivalent tool or when tool output would be noisier.

## File Naming Convention

| Test Type                           | File Pattern                                                     | Example                             |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Unit test                           | `*.spec.ts`                                                      | `scoring.spec.ts`                   |
| DB integration (Jest + PostgreSQL)  | `*.db.spec.ts` in `lambdas/db/src/schema/`                       | `leagues.db.spec.ts`                |
| Mocked E2E (Playwright)             | `*.spec.ts` in `apps/web-e2e/src/tests/`                         | `league-overview.spec.ts`           |
| Full-stack integration (Playwright) | `*.integration.spec.ts` in `apps/web-e2e/src/integration/tests/` | `live-draft-ui.integration.spec.ts` |

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

```bash
# 1. Start SSM port-forward (NAT instance as proxy into VPC)
aws ssm start-session --region us-east-1 --target <NAT_INSTANCE_ID> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters 'host=legacy-sports-dev-postgres.cep4b6aynyet.us-east-1.rds.amazonaws.com,portNumber=5432,localPortNumber=15432' &

# 2. Fetch creds from Secrets Manager
aws secretsmanager get-secret-value --region us-east-1 \
  --secret-id legacy-sports-dev-db-creds-20250925194630368900000002 \
  --query SecretString --output text > scratch/migcreds.json

# 3. Run (NODE_TLS_REJECT_UNAUTHORIZED=0 bypasses self-signed cert over tunnel)
TEST_DATABASE_URL="postgresql://$(jq -r .username scratch/migcreds.json):$(jq -r .password scratch/migcreds.json)@127.0.0.1:15432/postgres" \
  NODE_TLS_REJECT_UNAUTHORIZED=0 \
  pnpm exec nx run db:test:db --skip-nx-cache
```

See `.agents/skills/repo-tooling/references/db-dump-and-restore.md` for the full tunnel setup and the current NAT instance ID.

**Environment variable:** tests read `TEST_DATABASE_URL` (preferred) or `DATABASE_URL`. Must point to a real PostgreSQL instance.

**Schema access:** always import `integrationTestSchema` from `../../integration-test-setup` — never create a manual SQLite schema mirror. `integrationTestSchema` re-exports `PublicSchema`, so tests always run against the exact production schema.

**Fixtures and cleanup:** see [references/db-integration-tests.md](references/db-integration-tests.md) for the full fixture model, cleanup strategy, and required patterns when writing new DB tests.

**Cleanup summary:** `cleanupTestData()` deletes only test-owned rows — `DELETE FROM leagues WHERE owner IN (1, 2, 3)` (which cascade-deletes teams, drafts, matchups, draft_picks, etc.) plus bulk-test users 100–119. It never truncates: the DB may contain real production data (real players, real leagues) that must be preserved. See the reference doc for the full invariant.

## DB Integration Test Reference Files

- [DB Integration Tests Guide](references/db-integration-tests.md) — fixture model, cleanup strategy, ID collision rules, query scoping, player data

## E2E Reference Files

- [API Isolation Architecture](references/api-isolation-architecture.md) -- 3-layer mock system
- [CI Pipeline & Validation](references/e2e-ci-and-validation.md) -- running tests, CI behavior, troubleshooting
- [Playwright Best Practices](references/playwright-best-practices.md) -- required patterns and anti-patterns
- [Run E2E Headless](references/run-e2e-headless.md) -- suppress HTML reporter for agent/CI/headless execution (always use `nx run web-e2e:e2e` or `nx_run` MCP tool, never bare `playwright test`)
- [Shutdown Hygiene](references/shutdown-hygiene.md) -- stale process detection and cleanup
- [Test Tagging Guide](references/test-tagging-guide.md) -- tag decision guide with examples

## Integration Reference Files

- [Integration Commands](references/integration-commands.md) -- Nx targets, CLI commands, environment setup
- [UI Integration Patterns](references/ui-integration-patterns.md) -- Playwright+Tamagui interaction patterns
- [UI Serial Phases](references/ui-serial-phases.md) -- serial phase template, switchUser helper, decision table

## Integration with Workflow

Testing is part of the pre-commit sequence: typecheck -> lint -> test -> build. Run the full suite with `make pc`. See [repo-tooling](../repo-tooling/SKILL.md) for all targets.

### E2E Pre-Commit Scope Detection

Before running E2E tests, determine the minimum scope needed based on changed files:

```bash
make e2e-scope
# or: node scripts/e2e-pre-commit.js --json
```

This classifies changes and recommends: **targeted** (specific test files changed), **critical** (@critical suite for fixture/helper changes), or **none** (no E2E-relevant changes). Use `--run` to execute the recommended tests directly.
