# Fix-Integration-Tests Workflow — Phases 1 to 6

> Loaded from [fix-integration-tests SKILL](../SKILL.md).

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

Test users authenticate via `loginAs(tier, seat)` / `getTestUserJwt()` in `apps/web-e2e/src/utils/test-user-auth.ts`, consumed by the fixtures in `apps/web-e2e/src/integration/fixtures/api.ts` (`premiumJwt`, `freeJwt`, `adminJwt`, …). If auth fails, check:

- `INTEGRATION_BASE_URL` is set (defaults to `https://api.legacy-fantasy.com/`)
- The worktree root `.env` resolves and `E2E_POOL_PASSWORD` (plus legacy `E2E_COMMISSIONER_*` / `E2E_MANAGER_*`) values are current
- The cross-process JWT disk cache is not stale — delete `$TMPDIR/legacy-sports-integration-jwts.json` and retry (expired JWTs normally fall through, but a corrupt file won't)

### Class-of-bug check — fix the pattern, not the phase

Some failures look like a one-off (a single phase times out, a single poll returns null) but are instances of a documented antipattern that recurs across specs and helpers. Fixing only the failing phase produces the "Nth regression guard" cycle this repo has been bleeding from — a fix lands, nightly fails again on a sibling phase or sibling spec with the same class of bug.

When the root cause matches one of the documented class-of-bug antipatterns (catalog in [`e2e-determinism.md` antipatterns from past regressions](../../testing/references/e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog)), the agent must:

1. **Grep for the same pattern** in the failing spec, adjacent specs (`apps/web-e2e/src/integration/tests/*.integration.spec.ts`), and shared helpers (`apps/web-e2e/src/integration/helpers/*.ts`). Use a structural pattern (e.g. `expect\.poll\(.*\.draftStatus`, `await page\.goto.*networkidle`) — not just the symptom string.
2. **Either fix all instances in this PR** (preferred when the fix is mechanical — e.g. adding a single null-coalescing guard to every `expect.poll` callback in the file), **OR file a follow-up ticket** that explicitly lists every other instance and link it in the PR description.
3. **Never leave a pattern fix half-applied.** A single-phase fix that leaves five sibling phases with the same antipattern is what produces the regression chain — fix them together or file the follow-up.

Triggers that require the class-of-bug check (current ticket refs):

- **`expect.poll` callback that throws on null/undefined** instead of returning a sentinel ([LS-4353](https://bkrupa.atlassian.net/browse/LS-4353)).
- **UI-polling loop** where a backend `expect.poll` would be deterministic ([LS-4321](https://bkrupa.atlassian.net/browse/LS-4321), [LS-4344](https://bkrupa.atlassian.net/browse/LS-4344)).
- **Phase that proceeds before a state-changing mutation is visible to the read path** ([LS-4350](https://bkrupa.atlassian.net/browse/LS-4350)).
- **Per-phase deadline extension** as a substitute for fixing backend-state contention ([LS-4278](https://bkrupa.atlassian.net/browse/LS-4278), [LS-4282](https://bkrupa.atlassian.net/browse/LS-4282), [LS-4287](https://bkrupa.atlassian.net/browse/LS-4287)).

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

**Primary path — dispatch the nightly workflow on this branch (MCP):**

```
ci_dispatch_workflow(
  workflow: "run-playwright-tests.yml",
  ref: "<branch>",
  inputs: { "test-suite": "integration", "shard-total": "3" },
  waitForCompletion: true,
  timeoutSeconds: 3600
)
```

`waitForCompletion: true` is correct here — this is a non-PR `workflow_dispatch` run with no push notification. Shell fallback only if the CI MCP server is unavailable: `gh workflow run run-playwright-tests.yml --ref <branch> -f test-suite=integration -f shard-total=3`. Notes:

- Do **not** pass a `test-file` filter — the whole integration suite must run.
- The `retries` input is ignored for the integration suite (it always runs at the config's `retries: 0`); `shard-total` above 3 is clamped to `INTEGRATION_SHARD_CEILING`.
- If a PR is already open, adding the **`run:integration` label** instead runs the specs the surface map selects for the PR and posts `<integration-results>` evidence the reviewer bot parses — good for evidence, but it is _not_ the full-suite nightly-shaped gate this phase requires.

Once the run completes, read the report (use [read-playwright-report](../../read-playwright-report/SKILL.md) / `ci_get_playwright_report`), then:

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

4. **Push and create PR** — follow the [PR lifecycle skill](../../pr-lifecycle/SKILL.md). Confirm in CI that the integration suite passes.

5. **Watch CI** — do not close the session until the integration test suite passes in CI or you have diagnosed the new failure and are ready to iterate.

---
