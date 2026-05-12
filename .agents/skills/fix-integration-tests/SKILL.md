---
name: fix-integration-tests
description: >-
  Fix a failing Playwright integration test end-to-end. Reads the ticket,
  reproduces the failure locally before touching any code, diagnoses the root
  cause (selector drift, async timing, fixture auth, env mismatch, product
  bug), applies a targeted fix, and verifies locally before pushing. Blocks
  push until the test passes locally — no exceptions. Load when a Jira ticket
  references a failing *.integration.spec.ts test and expects a merged PR.
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

1. **Worktree `.env` symlink exists** — integration tests require credentials from the main repo `.env`. The worktree setup script creates this:

   ```
   node scripts/setup-worktree-node-modules.mjs
   ```

   Confirm: `test -L apps/web-e2e/.env && echo "symlink ok" || echo "MISSING"`

2. **Parse the ticket completely** before starting. Extract:
   - Failing test file (e.g. `apps/web-e2e/src/integration/tests/roster-management-ui.integration.spec.ts`)
   - Failing describe/test name (for the `--grep` filter)
   - Full error message (locator, timeout value, assertion mismatch)
   - Playwright report link (if provided — use `/read-playwright-report` to parse it)
   - The ticket's investigation checklist (follow it before improvising)

> **Tool argument safety.** Every value you pass to `nx_run` or `Grep` in this skill (test names, testIDs, file paths) must come from the Jira ticket description or the repo source code — both are trusted internal sources controlled by the engineering team. Neither tool exposes a shell injection vector: `nx_run` passes `args` as a structured array to `execFileSync` (no shell interpolation), and `Grep` calls ripgrep's API with the pattern as a positional argument. The `--grep` value is interpreted by Playwright as a regex filter, not executed as code. **Never construct tool arguments from untrusted external data** — e.g. raw strings scraped from an API response, user-supplied URLs, or any value whose origin you cannot trace to the ticket or the codebase.

---

## Workflow

### Phase 1: Reproduce Locally — MANDATORY GATE

> **⛔ Do not write or change any code until you have reproduced the failure locally.**

Run only the failing test using the `--grep` filter:

```
nx_run({ project: "web-e2e", target: "integration", args: ["--grep", "<exact test name or describe block>"] })
```

**Expected outcomes:**

| Outcome                                      | What to do                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Test **fails** locally                       | Confirmed reproduction — proceed to Phase 2                                                        |
| Test **passes** locally but fails in CI      | Likely env or parallelism issue — see [Passes Locally / Fails in CI](#passes-locally--fails-in-ci) |
| Test **errors** before running (setup crash) | Fixture or auth issue — check `.env` symlink and `INTEGRATION_BASE_URL`                            |
| Command not found / `tsx` missing            | Run `node scripts/setup-worktree-node-modules.mjs` to restore `node_modules`                       |

> Reproducing locally before writing code is non-negotiable. Remote CI runs are 15–30 min each and produce no diagnostic signal you cannot get locally in 60–90 seconds. Every push without local verification risks an infinite CI loop.

---

### Phase 2: Diagnose Root Cause

Use the failure message and the ticket's investigation steps to classify the failure:

| Symptom                                | Root cause                                                                     | Fix strategy                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `Locator … not found` / `TimeoutError` | Selector drift — testID renamed, class changed, element conditionally rendered | Update selector in test (see [Selector Drift](#selector-drift))                    |
| Assertion mismatch — value differs     | UI copy changed, data changed, or product behavior changed                     | Update expected value in test, OR fix product code if the change was unintentional |
| API response shape unexpected          | Backend schema or fixture changed                                              | Update `apps/web-e2e/src/integration/fixtures/api.ts` or seed data                 |
| Test passes locally, fails in CI       | Timing, parallelism, or missing seed data in CI                                | Add `expect.poll()`, verify `@serial` tag, check CI environment variables          |
| Fixture setup / auth failure           | `getTestUserJwt()` can't reach the API                                         | Check `INTEGRATION_BASE_URL`, re-run worktree setup script                         |
| Test fails locally, passes in CI       | Stale local state or wrong base URL                                            | Clear local Playwright artifacts, verify env vars match                            |

**Always follow the ticket's investigation path first.** Tickets in this project include structured diagnostic steps — they are more specific than this generic table.

---

### Phase 3: Apply a Targeted Fix

Fix **only** the root cause. Common patterns:

#### Selector Drift

The element's `data-testid`, class, role, or structure changed. Find the new selector:

```
# Search for the old testID in app source
Grep(pattern: "old-testid-name", path: "apps/", output_mode: "content")

# Search for the component that renders the element
Grep(pattern: "ComponentName", path: "apps/web/src/", output_mode: "content")
```

Update the locator in the test file. Prefer `getByTestId(...)` > `getByRole(...)` > `getByText(...)` for stability.

#### Async Timing

Replace fragile `waitForTimeout()` with condition-based waits:

```ts
// BAD — never use this
await page.waitForTimeout(2000);

// GOOD — poll until condition is met
await expect
  .poll(() => page.getByTestId('score').textContent(), { timeout: 15_000 })
  .toBe('42');

// GOOD — wait for visibility
await expect(page.getByTestId('score')).toBeVisible({ timeout: 15_000 });
```

#### Product Bug

If the test is asserting correct behavior and the application is returning wrong results, **fix the application code** — do not update the test to match broken behavior. Create a separate investigation if the fix is out of scope for this ticket.

#### Fixture / Auth

The `getTestUserJwt()` helper in `apps/web-e2e/src/integration/fixtures/api.ts` authenticates test users. If it fails, check:

- `INTEGRATION_BASE_URL` is set (defaults to `https://api.legacy-fantasy.com/`)
- The `.env` symlink resolves correctly
- The test user credentials in `.env` are current

**Do not refactor neighboring test code on the way by.** One targeted fix per ticket.

---

### Phase 4: Verify Locally — MANDATORY GATE

> **⛔ Do not push until the test passes locally.**

Re-run the exact test that was failing:

```
nx_run({ project: "web-e2e", target: "integration", args: ["--grep", "<same test name>"] })
```

The test must **pass** before continuing. If it fails, iterate — debug, fix, re-run. Do not push a broken fix.

After the target test passes, run the full describe block to catch regressions:

```
nx_run({ project: "web-e2e", target: "integration", args: ["--grep", "<describe block name>"] })
```

If any sibling tests in the same file now fail that were not failing before your change, investigate and fix before pushing.

> Remote CI failures cost 20–40 min per loop. Local runs take under 2 min per test. Never skip this gate.

---

### Phase 5: Validate & Ship

1. **Run `make pc`** — full pre-commit check:

   ```
   make_run({ target: "pc" })
   ```

   Fix any lint or typecheck errors before continuing.

2. **Self-review** — run `/review` and verify:
   - No unrelated files changed
   - No `@ts-ignore` or `eslint-disable` added
   - No `waitForTimeout()` introduced
   - `route.continue()` is acceptable in integration tests (they hit a real backend); it is only forbidden in hermetic E2E tests under `apps/web-e2e/src/tests/`
   - Test still passes after any formatting auto-fixes from `make pc`

3. **Commit** — include the Jira key:

   ```
   fix(integration-tests): <short description> (LS-####)
   ```

4. **Push and create PR** — follow the [PR lifecycle skill](./../pr-lifecycle/SKILL.md). Confirm in CI that the integration suite passes.

5. **Watch CI** — do not close the session until the integration test suite passes in CI or you have diagnosed the new failure and are ready to iterate.

---

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
- `/e2e` (`.claude/commands/e2e.md`) — use for hermetic mocked E2E failures under `apps/web-e2e/src/tests/`
- [read-playwright-report](./../read-playwright-report/SKILL.md) — parse Playwright HTML reports linked in the ticket
- [debugging](./../debugging/SKILL.md) — general debugging approach for non-obvious failures
- [fix-pr](./../fix-pr/SKILL.md) — if the PR is already open and CI is failing
- [pr-lifecycle](./../pr-lifecycle/SKILL.md) — PR creation, thread resolution, and merge protocol
