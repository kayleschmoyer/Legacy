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
   node scripts/modules-pool/link.mjs
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

## Nightly Execution Profile — Why Local Single-Spec Runs Mislead

Integration tests **do not run on PRs**. They run only:

- **Nightly** via `.github/workflows/run-playwright-tests.yml` on cron `0 3 * * *`
- **Manual `workflow_dispatch`** from the Actions tab

A local `--grep` reproduction differs materially from the nightly profile. Even a fully green local single-spec run cannot prove that a fix holds under nightly conditions.

| Property              | Local `--grep` (agent default) | Nightly                                           |
| --------------------- | ------------------------------ | ------------------------------------------------- |
| Specs                 | 1                              | All ~22 `*.integration.spec.ts`                   |
| Shards                | 1                              | 3 (`1/3`, `2/3`, `3/3`)                           |
| Workers/shard         | 1 (`workers: 1`)               | 1                                                 |
| Effective parallelism | 1 Playwright proc              | 3 procs hammering the same live backend           |
| Retries               | 2                              | 2                                                 |
| Backend               | `api.legacy-fantasy.com`       | Same                                              |
| Test users            | 4 shared accounts              | **Same 4 accounts, used by all 3 shards at once** |
| `globalTeardown`      | Runs                           | **Skipped in sharded runs** (LS-4318)             |

### Three failure modes the local profile cannot exercise

1. **Cumulative backend load** ([LS-4353](https://legacysports.atlassian.net/browse/LS-4353)). By the 6th–7th spec in a shard, Lambda / SQS / RDS are under contention and Apollo round-trips slow 5–10×. Deadlines tuned to an isolated 30s draft blow past 200s under load. Symptom: the local single-spec run is green at 30s, nightly times out at 180s on the same phase.
2. **Shared-user state contention** ([LS-4350](https://legacysports.atlassian.net/browse/LS-4350)). Only **4 hardcoded users exist** (`E2E_COMMISSIONER`, `E2E_MANAGER_1/2/3` in `apps/web-e2e/src/utils/test-user-auth.ts`). All 22 specs across all 3 shards mutate `leagueMembers`, `userLeagues`, JWT cache, and OAuth state for these 4 accounts concurrently. Symptom: phase 2 (manager joins league) succeeds, phase 10 (manager re-enters the same league) sees `ForbiddenError` / `League not found` because the `leagueMembers` row isn't queryable yet from the other shard's read path.
3. **Cross-shard write→read lag** ([LS-4318](https://legacysports.atlassian.net/browse/LS-4318)). Nightly skips `globalTeardown` so leagues from earlier specs and other shards sit in the DB throughout the run. Read paths see more rows than local runs ever observe; pagination, ordering, and filter assertions tuned to a single-spec database fail under nightly's accumulated state.

### Implications for this skill

**Phase 1 (reproduce) and Phase 4a (verify) use single-spec runs but cannot prove the fix holds under nightly conditions.** Phase 4b mandates a nightly-shaped verification before push. A green `--grep` is necessary but not sufficient — it confirms the targeted fix, not the absence of cross-spec contention. Skipping Phase 4b is the mechanism by which the repo has accumulated "Nth regression guard" tickets (a fix lands, nightly fails again on a different phase with the same class of bug).

See [`e2e-determinism.md` antipatterns from past regressions](../testing/references/e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog) for the class-of-bug catalog and the patterns that survive nightly.

---

## Workflow

### Phase 1: Reproduce Locally — MANDATORY GATE

> **Precondition for editing any code in this skill: the failure has reproduced locally on your machine.** A CI failure log is the symptom report, not the reproduction — without a local run, you cannot tell whether your fix actually changes the behavior or just changes adjacent code.

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
| Command not found / `tsx` missing            | Run `node scripts/modules-pool/link.mjs` to restore `node_modules`                                 |

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

### Class-of-bug check — fix the pattern, not the phase

Some failures look like a one-off (a single phase times out, a single poll returns null) but are instances of a documented antipattern that recurs across specs and helpers. Fixing only the failing phase produces the "Nth regression guard" cycle this repo has been bleeding from — a fix lands, nightly fails again on a sibling phase or sibling spec with the same class of bug.

When the root cause matches one of the documented class-of-bug antipatterns (catalog in [`e2e-determinism.md` antipatterns from past regressions](../testing/references/e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog)), the agent must:

1. **Grep for the same pattern** in the failing spec, adjacent specs (`apps/web-e2e/src/integration/tests/*.integration.spec.ts`), and shared helpers (`apps/web-e2e/src/integration/helpers/*.ts`). Use a structural pattern (e.g. `expect\.poll\(.*\.draftStatus`, `await page\.goto.*networkidle`) — not just the symptom string.
2. **Either fix all instances in this PR** (preferred when the fix is mechanical — e.g. adding a single null-coalescing guard to every `expect.poll` callback in the file), **OR file a follow-up ticket** that explicitly lists every other instance and link it in the PR description.
3. **Never leave a pattern fix half-applied.** A single-phase fix that leaves five sibling phases with the same antipattern is what produces the regression chain — fix them together or file the follow-up.

Triggers that require the class-of-bug check (current ticket refs):

- **`expect.poll` callback that throws on null/undefined** instead of returning a sentinel ([LS-4353](https://legacysports.atlassian.net/browse/LS-4353)).
- **UI-polling loop** where a backend `expect.poll` would be deterministic ([LS-4321](https://legacysports.atlassian.net/browse/LS-4321), [LS-4344](https://legacysports.atlassian.net/browse/LS-4344)).
- **Phase that proceeds before a state-changing mutation is visible to the read path** ([LS-4350](https://legacysports.atlassian.net/browse/LS-4350)).
- **Per-phase deadline extension** as a substitute for fixing backend-state contention ([LS-4278](https://legacysports.atlassian.net/browse/LS-4278), [LS-4282](https://legacysports.atlassian.net/browse/LS-4282), [LS-4287](https://legacysports.atlassian.net/browse/LS-4287)).

**Do not refactor _unrelated_ test code on the way by.** Fixing all instances of the _same_ class-of-bug _is_ part of this fix — that's not refactoring, it's completing the fix. Unrelated cleanup still belongs in a separate ticket.

---

### Phase 4: Verify — TWO-TIER GATE

> **Precondition for `worktree_push()` in this skill: Phase 4a and Phase 4b are both green.** A green single-spec run alone does not prove the fix holds under nightly's cumulative load — see Phase 4b for the full-suite gate.

A green single-spec local run confirms the _targeted_ fix but cannot prove the fix holds under nightly's cumulative load, shared-user contention, and cross-shard lag (see [Nightly Execution Profile](#nightly-execution-profile--why-local-single-spec-runs-mislead) above). Both gates are mandatory.

#### Phase 4a — Local single-spec confirmation

Re-run the exact test that was failing:

```
nx_run({ project: "web-e2e", target: "integration", args: ["--grep", "<same test name>"] })
```

The test must **pass** before continuing. If it fails, iterate — debug, fix, re-run. Do not push a broken fix.

After the target test passes, run the full describe block to catch same-file regressions:

```
nx_run({ project: "web-e2e", target: "integration", args: ["--grep", "<describe block name>"] })
```

If any sibling tests in the same file now fail that were not failing before your change, investigate and fix before continuing to Phase 4b.

#### Phase 4b — Nightly-shaped verification (MANDATORY before push)

A green Phase 4a is not sufficient. Before push, produce a green run under conditions that approximate nightly: the full integration suite, sharded, against the live backend.

**Primary path — dispatch the nightly workflow on this branch:**

```
gh workflow run run-playwright-tests.yml --ref <branch> \
  -f test-suite=integration \
  -f shard-total=3 \
  -f retries=2
```

Do **not** pass a `test-file` filter — the whole integration suite must run. Wait for the run to deploy its HTML report (use `/read-playwright-report` once the run completes), then:

- Confirm **all** touched specs are green across all 3 shards.
- Confirm sibling specs in the same file are green.
- If any spec fails with a class-of-bug pattern (see Phase 3 — Class-of-bug check), return to Phase 3 and treat it as part of this fix.
- Paste the report URL into the PR body under `## Playwright Evidence`.

**Fallback path (only when `workflow_dispatch` is unavailable — e.g. CI outage, missing permissions):** run the affected spec preceded by 2–3 unrelated integration specs locally in one Playwright invocation, e.g.:

```
pnpm exec nx integration web-e2e -- \
  apps/web-e2e/src/integration/tests/full-season-ui.integration.spec.ts \
  apps/web-e2e/src/integration/tests/<unrelated-1>.integration.spec.ts \
  apps/web-e2e/src/integration/tests/<your-fixed-spec>.integration.spec.ts
```

This approximates sequential-load conditions but does **not** reproduce sharded contention or shared-user cross-shard concurrency. Use only when the primary path is blocked, and explicitly note in the PR body that nightly-shaped verification fell back to local sequential loading and why.

> Phase 4a catches same-file regressions in 60–90 seconds. Phase 4b catches cross-spec contention that would otherwise land as a nightly-only failure 6–8 hours after merge. Skipping Phase 4b is the mechanism by which the repo has accumulated "Nth regression guard" tickets.

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
