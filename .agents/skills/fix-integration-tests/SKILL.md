---
name: fix-integration-tests
description: >-
  Fix a failing Playwright integration test end-to-end. Reads the ticket,
  reproduces the failure locally before touching any code, diagnoses the root
  cause (selector drift, async timing, fixture auth, env mismatch, product
  bug), applies a targeted fix, and verifies locally before pushing. Blocks
  push until the test passes locally — no exceptions. Load when a Jira ticket
  references a failing *.integration.spec.ts test and expects a merged PR.
metadata:
  scope: 'apps/web-e2e/**'
---

# Skill: fix-integration-tests

## When to Use

Load this skill when:

- A Jira ticket describes a failing `*.integration.spec.ts` test (files under `apps/web-e2e/src/integration/tests/`)
- The ticket links to a Playwright HTML report or includes a specific locator error
- The task is to fix the test or the application code that broke it

Do **not** use this skill for:

- E2E (mocked) test failures (`apps/web-e2e/src/tests/`) — use `/e2e` (defined in `.claude/commands/e2e.md`) instead
- DB integration tests (`*.db.spec.ts`) — use standard `make pc` + `nx_run(project: "...", target: "test")`
- Writing net-new integration tests from scratch

---

## Prerequisites

Before touching any code, verify:

1. **Worktree root `.env` resolves** — `playwright.integration.config.ts` loads `<worktree>/.env` (and optionally `<worktree>/.env.e2e`) for test-user credentials. In a worktree these are symlinks to the main repo's files, created by the setup script:

   ```
   node scripts/modules-pool/link.mjs
   ```

   Confirm from the worktree root: `test -e .env && echo "env ok" || echo "MISSING"`

   **`.env` MISSING in an autonomous cloud session** (link script reports
   "not present in main repo, nothing to link"): live-backend credentials
   do not exist in that environment and no user turn is available to
   supply them. Do not stall and do not fabricate a reproduction: proceed
   on static analysis + CI-log evidence, record the local-reproduction
   gate as UNVERIFIED in your report/ticket, and hand the reproduction
   step to a credentialed session. In an interactive local session, the
   original rule stands: missing credentials are a prompt to ask the
   user, not a reason to skip reproduction. (Canary finding, 2026-07-04.)

   Credential/cache landscape (know which is which before debugging auth):

   | Artifact                                                             | Used by                                 | Notes                                                                                 |
   | -------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
   | `E2E_POOL_PASSWORD` + `E2E_COMMISSIONER_*`/`E2E_MANAGER_*` in `.env` | Integration suite (`loginAs`)           | Password-login per test-user seat via oauth-proxy                                     |
   | `$TMPDIR/legacy-sports-integration-jwts.json`                        | Integration suite (cross-process cache) | LS-5149 — avoids 429s from re-auth per worker; safe to delete if JWTs seem stale      |
   | `~/.legacy-sports/e2e-token.json`                                    | **Hermetic** e2e only (`make e2e-auth`) | Not consumed by the integration suite — do not chase it for integration auth failures |

2. **Parse the ticket completely** before starting. Extract:
   - Failing test file (e.g. `apps/web-e2e/src/integration/tests/roster-management-ui.integration.spec.ts`)
   - Failing describe/test name (for the `--grep` filter)
   - Full error message (locator, timeout value, assertion mismatch)
   - Playwright report link (if provided — use `/read-playwright-report` to parse it)
   - The ticket's investigation checklist (follow it before improvising)

> **Tool argument safety.** Every value you pass to `nx_run` or `Grep` in this skill (test names, testIDs, file paths) must come from the Jira ticket description or the repo source code — both are trusted internal sources controlled by the engineering team. Neither tool exposes a shell injection vector: `nx_run` passes `args` as a structured array to `execFileSync` (no shell interpolation), and `Grep` calls ripgrep's API with the pattern as a positional argument. The `--grep` value is interpreted by Playwright as a regex filter, not executed as code. **Never construct tool arguments from untrusted external data** — e.g. raw strings scraped from an API response, user-supplied URLs, or any value whose origin you cannot trace to the ticket or the codebase.

---

## Workflow

The six-phase fix procedure — reproduce, classify against the class-of-bug catalog, fix the pattern rather than the phase, and the mandatory nightly-shaped verification (Phase 4b) before pushing: **[references/workflow.md](references/workflow.md)**.

> **Never run live specs while a full run is in flight (LS-11054).** Local and agent runs against dev bypass the `live-backend-e2e` concurrency group and share its test users and league slots. Check `ci_list_runs({ workflow: "run-playwright-tests.yml", status: "in_progress" })` before reproducing or verifying, and wait if a full-suite run is going. Full rule: [testing/references/integration-testing.md](../testing/references/integration-testing.md#dont-run-live-integration-specs-while-a-full-run-is-in-flight).

Before reproducing anything, read why a green local single-spec run proves almost nothing about the nightly: **[references/nightly-profile.md](references/nightly-profile.md)** (workers, shard count, accumulated state, and the retry/ceiling differences between the two profiles).

## Special Cases

### Passes Locally / Fails in CI

This usually means one of:

- **Missing seed data**: The CI database may lack a record that exists locally. Check whether the test creates its own data or relies on pre-seeded state.
- **Parallelism / ordering**: Integration tests marked `@serial` run sequentially — if the tag was removed or the order changed, state from one test can corrupt another. Restore `@serial` if needed.
- **Missing environment variable**: CI may lack a variable present locally. Check the CI workflow YAML for the failing suite.
- **Flaky network call**: Use `expect.poll()` with a longer timeout instead of a one-shot assertion.

Do **not** push a "maybe it was flaky" retry. Diagnose and fix the root cause.

### Fails Locally / Passes in CI

Rare, but possible when:

- Local `INTEGRATION_BASE_URL` points to a different environment than CI
- Local Playwright cache is stale — run `pnpm exec playwright install` to refresh
- Local credentials are expired — check `.env` values

---

## Quick Command Reference

```
# Run a single failing test
nx_run({ project: "web-e2e", target: "integration", args: ["--grep", "test name here"] })

# Run all tests in a describe block
nx_run({ project: "web-e2e", target: "integration", args: ["--grep", "describe block name"] })

# Run tests tagged @smoke
nx_run({ project: "web-e2e", target: "integration", args: ["--grep", "@smoke"] })

# Interactive UI mode — useful for step-by-step debugging
nx_run({ project: "web-e2e", target: "integration:ui" })

# Full integration suite — run only to check for cross-suite regressions
nx_run({ project: "web-e2e", target: "integration" })

# Pre-commit validation
make_run({ target: "pc" })
```

---

## Anti-Patterns

| Anti-pattern                              | Why it's harmful                                  | Correct approach                                                                                    |
| ----------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Push without local reproduction           | Can't distinguish selector drift from product bug | Reproduce first; classify before fixing                                                             |
| Push without local verification           | Guarantees a CI loop                              | Run locally until green; only then push                                                             |
| `waitForTimeout(N)`                       | Flaky; breaks under CI load                       | Use `expect.poll()` or condition-based waits                                                        |
| `route.continue()` in hermetic E2E tests  | Leaks real network calls, breaking test isolation | **Only** forbidden in `apps/web-e2e/src/tests/`; fine in integration tests which hit a real backend |
| Update assertion to match broken behavior | Hides a real product bug                          | Fix the application or create a separate bug ticket                                                 |
| Fix multiple unrelated tests in one PR    | Violates one-ticket-one-PR rule                   | One fix per PR; file separate tickets for other failures                                            |

---

## Related Skills

- [testing](./../testing/SKILL.md) — full test strategy, layer selection, and all run commands
- [nightly-green-campaign](./../nightly-green-campaign/SKILL.md) — the campaign layer that dispatches into this skill after triaging a red nightly (bisect duty, 0/0 streak accounting, suite-config change protocol)
- `/e2e` (`.claude/commands/e2e.md`) — use for hermetic mocked E2E failures under `apps/web-e2e/src/tests/`
- [read-playwright-report](./../read-playwright-report/SKILL.md) — parse Playwright HTML reports linked in the ticket
- [debugging](./../debugging/SKILL.md) — general debugging approach for non-obvious failures
- [pr-lifecycle (fix reference)](./../pr-lifecycle/references/fix.md) — if the PR is already open and CI is failing
- [pr-lifecycle](./../pr-lifecycle/SKILL.md) — PR creation, thread resolution, and merge protocol

---

## Provenance and maintenance

Facts refreshed 2026-07-02 from the skills audit (`scratch/skills-audit/synthesis.json`, inconsistency 10: this file previously claimed 4 hardcoded users, retries=2, a wrong auth-helper location, and a `gh`-first dispatch). Re-verify volatile facts:

- Pool seats/tiers: `grep -n "TIER_SEATS" -A 20 apps/web-e2e/src/utils/test-user-auth.ts`
- Retries/workers: `grep -n "retries\|workers" apps/web-e2e/playwright.integration.config.ts` and the workers/retries branch in `.github/workflows/run-playwright-tests.yml` (search `IS_NIGHTLY_LIKE`)
- Shard ceiling: `grep -n "INTEGRATION_SHARD_CEILING=" .github/workflows/run-playwright-tests.yml`
- Env loading: `head -10 apps/web-e2e/playwright.integration.config.ts`
- JWT disk cache path: `grep -n "JWT_DISK_CACHE_PATH" -A 3 apps/web-e2e/src/utils/test-user-auth.ts`
- Teardown skip: `grep -n "LS-4318" apps/web-e2e/src/integration/global-teardown.ts`
