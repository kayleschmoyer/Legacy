# Nightly Triage — The Six Phases

> Loaded from [nightly-green-campaign SKILL](../SKILL.md).

## Triage: numbered phases

Run these in order. Each phase states the expected observation and where to branch if you see something else.

### Phase 1 — Get the failing run and its report

```
ci_list_runs(workflow: "run-playwright-tests.yml", limit: 5)
```

**Expect:** roughly one `workflow_run`-event full-suite run per day on `main` (none on days with no merges); note the failing run's `run_id` and head SHA, and the most recent green nightly's SHA (you need both for Phase 4).

```
ci_get_playwright_report(runId: <run_id>)   # auto-expands to the "nightly-<run_id>" report
```

**Expect:** the agent-md `summary.md` — top-line totals plus full detail (location, error, snippet) for every failure and flake. Parsing detail and shell fallbacks: [read-playwright-report](../../read-playwright-report/SKILL.md).

Branches:

- **`0 total`** → this is not a pass. If every test is `skipped` from a clearly-attributable global infra failure, the run is "no data" and does not break the streak (Rule 3 exception in the [0/0 policy](../../testing/references/zero-zero-maintenance-policy.md)); otherwise treat as a suite failure.
- **No report deployed** → the `deploy-report` job itself failed; read job logs via `ci_get_logs(runId: <run_id>)` / `ci_view_run_jobs`. A >100 MB artifact on gh-pages is the known killer (LS-4537 — see [Fenced-off wrong paths](#fenced-off-wrong-paths)).
- **Report older than ~10 nightlies is gone** — the deploy step prunes to the 10 most recent `nightly-*` reports. Pull evidence promptly; don't plan a triage around a 2-week-old report URL.
- **Hosted CI MCP server unavailable** → `gh run list --workflow run-playwright-tests.yml --limit 5` and the `gh api` fetch in [read-playwright-report](../../read-playwright-report/SKILL.md).

### Phase 2 — Route by suite

The nightly matrix runs **both** suites. Each failing test's project/file tells you which:

- **Hermetic e2e failure** (`apps/web-e2e/src/tests/`): first check the #1 class — a flag-gated route asserted without seeding: missing `page.addInitScript()` setting `window.__gbSeededFeatures` (the dominant class by a wide margin; current tally in the failure table of [ci-failure-prevention.md](../../testing/references/ci-failure-prevention.md); rule home: [testing SKILL Critical Rule 2](../../testing/SKILL.md#critical-rules)). If it's not flag seeding, it's a merged regression → continue to Phase 4 (bisect) — hermetic specs have no backend to blame.
- **Integration failure** (`apps/web-e2e/src/integration/tests/`): continue to Phase 3.

### Phase 3 — Classify the integration failure

**3a. Run-level 429 sweep first, before reading any individual spec.** Search the run's logs for rate-limiting:

```
ci_search_logs(runId: <run_id>, pattern: "HTTP 429", contextBefore: 5, contextAfter: 5)
```

(`failedOnly` defaults to `true` — desirable here; the context params are `contextBefore`/`contextAfter`, default 3.)

**If the error log is dominated by 429s** and the failing set is a _shifting_ collection of specs with "Failed to fetch" / "null teamId" / opaque `Received: null` — the specs are 429 victims, not discrete bugs (canonical run [27186006949](https://github.com/bkrupa/legacy-sports/actions/runs/27186006949): 39× HTTP 429 across ~9 "failing" specs). Do not debug the specs. Branch to antipattern #6 remediation in [e2e-determinism.md](../../testing/references/e2e-determinism.md#6-http-429-from-the-shared-live-backend-masquerading-as-spec-failures) and check whether a recent merge added a raw `fetch`/live call bypassing `fetchWithBackoff`, or changed sharding/stagger config.

**3b. Otherwise, match each failure against the class-of-bug catalog** — the six antipatterns in [e2e-determinism.md § Antipatterns from past regressions](../../testing/references/e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog) (names only here; symptoms, why-the-obvious-fix-is-wrong, and right fixes live there):

1. `expect.poll` callback throws instead of returning
2. UI-polling loops racing Apollo cache hydration
3. Phase proceeds before a state-changing mutation is visible to the read path
4. Per-phase deadline extension as a substitute for fixing backend-state contention
5. `expect.poll` succeeding with bad data
6. HTTP 429 from the shared live backend masquerading as spec failures

**3c. Discriminating experiments** — when the class isn't obvious, these signals separate backend-flake from spec-bug from product regression:

| Observation                                                                                                                                 | Verdict                                                 | Next move                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run log dominated by `HTTP 429`; failing set shifts between runs                                                                            | Backend rate exhaustion (shared-backend flake)          | 3a above — fix the call site/concurrency, not the specs                                                                                                                                                   |
| Early phase's mutation succeeded, later phase gets `ForbiddenError` / `League not found` — only under nightly load, local single-spec green | Shared-user write→read lag (antipattern #3, LS-4350)    | Add the visibility poll in the _mutation_ phase; per-spec user pool is the real fix ([ledger](#open-workstream-ledger))                                                                                   |
| Test stdout is opaque (`picksAutoMade=n/a`, silent stall) but the backend clearly acted                                                     | Error swallowed client-side; truth is in Lambda logs    | [cloudwatch-archaeology](../../cloudwatch-archaeology/SKILL.md) — precedent LS-4295: "stuck at pick 10" was really picks 1–13 succeeding then `ForbiddenError` on every nudge, visible ONLY in CloudWatch |
| `expect.poll` resolved but a downstream assertion on the same data fails                                                                    | **Product regression**, not a test bug (antipattern #5) | Phase 4 bisect, then [debugging](../../debugging/SKILL.md); never add fallback/refetch logic to the spec                                                                                                  |
| Same phase times out across several specs; timings 5–10× local                                                                              | Cumulative backend contention (antipattern #4)          | Do not bump deadlines — identify the contention axis or escalate ([ledger](#open-workstream-ledger))                                                                                                      |
| Spec is green locally at every profile, red only in the nightly report                                                                      | Cross-shard/accumulated-state effect                    | Read the nightly-vs-local profile table in [fix-integration-tests § Nightly Execution Profile](../../fix-integration-tests/references/nightly-profile.md)                                                 |

### Phase 4 — Bisect the day's merges (ADR-0014 duty)

Full runbook home: [ADR-0014 § Bisect runbook](../../../../docs/decisions/0014-integration-nightly-bisect.md#bisect-runbook), which documents the **ledger query ([testing § E2E Ledger](../../testing/references/e2e-ledger.md), LS-9757) as the primary method** and the manual `git log --first-parent` walk as the fallback for when the ledger lacks data. Primary method:

```bash
node .github/scripts/e2e-ledger/query-e2e-ledger.mjs --spec <failing-spec-path> --json
```

Returns `{ spec, records: [...] }`, each record shaped `{sha, prNumber, timestamp, spec, testName, status, retryCount, relatedToDiff}`, oldest to newest. The first `failed`/`flaky` record after a run of `passed` records is the introducing commit — no need to enumerate every merge in the window. Requires AWS credentials with read access to `legacy-sports-dev-ci-artifacts` in the environment.

Fall back to the manual runbook only when the ledger has no data for the failing spec (e.g. a brand-new spec with no history yet):

```bash
git log --first-parent --oneline <last-green-nightly-sha>..<failing-nightly-sha>
```

**Expect:** one squash commit per merged PR (PR number in the subject). Narrow candidates by matching the failing specs' globs in `apps/web-e2e/src/integration/integration-surface-map.json` against each commit's changed files; confirm by running the failing spec against the candidate. If no PR is cleanly attributable, the 0/0 policy names the most recent merge touching the affected area as the default revert candidate.

Branch: **the clone may be shallow** in cloud sessions (grafted history) — if `git log` shows a graft boundary before the last green SHA, fetch more history (`git fetch --deepen=50 origin main`) before trusting the merge list.

### Phase 5 — Remediate

Hand the fix itself to [fix-integration-tests](../../fix-integration-tests/SKILL.md) (reproduce → diagnose → targeted fix → two-tier verification). Two campaign rules bind every fix:

1. **Fix the pattern, not the phase.** If the root cause matches a catalog class, grep for the same structural pattern across the failing spec, sibling specs, and shared helpers, and fix every instance or file a follow-up listing them — the procedure is [fix-integration-tests § Class-of-bug check](../../fix-integration-tests/references/workflow.md#class-of-bug-check--fix-the-pattern-not-the-phase). Half-applied pattern fixes are how the repo accumulated the 10-ticket `waitForSeasonActive` chain (LS-4237→LS-4353).
2. **Regression-search after every fix** (mandated repo-wide by commit `1b5b610`, PR #5672): `Grep` for specs referencing the changed route, component, or GraphQL operation; run them locally; update any that assert the old behavior in the same PR. Home: [testing SKILL Critical Rule 3](../../testing/SKILL.md#critical-rules), last bullet.

New-spec additions that fall out of a fix are pre-validated per 0/0 policy Rule 4 (5 consecutive local passes) and must register in the surface maps ([testing § New-Spec Registration Contract](../../testing/SKILL.md#new-spec-registration-contract-surface-maps)) and, if heavy, in `integration-shard-weights.json`.

### Phase 6 — Close the loop (measured, never judged by eye)

- Success = the **next nightly report reads 0 failed / 0 flaked** in `summary.md` totals. A "looks fine" scan of the HTML report is not evidence; flakes appear in the totals and count as failures.
- Update streak accounting per the [0/0 policy tracking table](../../testing/references/zero-zero-maintenance-policy.md#tracking-and-reporting) (comment the running streak on LS-4401; non-zero → per-run epic + P0).
- For a pre-merge nightly-shaped check of the fix branch, use the `ci_dispatch_workflow` call in [fix-integration-tests Phase 4b](../../fix-integration-tests/references/workflow.md#phase-4b--nightly-shaped-verification-mandatory-before-push) (`waitForCompletion: true` is correct there — non-PR dispatch runs emit no push notification).
