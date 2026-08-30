---
name: nightly-green-campaign
description: "Operational playbook for keeping the nightly live-backend Playwright suite at 0 failures / 0 flakes: triage a red nightly, bisect the day's merges, classify against the known failure classes, fix the pattern, and validate suite-config changes. Load when: a nightly run-playwright-tests.yml run failed, tracking or reporting the 0/0 streak, proposing a change to INTEGRATION_SHARD_CEILING, retries, sharding, or global setup/teardown, or deciding whether a nightly failure is backend flake vs spec bug vs product regression."
metadata:
  scope: 'apps/web-e2e/**, .github/workflows/run-playwright-tests.yml'
---

# Skill: Nightly Green Campaign

The campaign layer for the repo's hardest live problem: keeping the nightly Playwright run — the full live-backend integration suite (every `*.integration.spec.ts` under `apps/web-e2e/src/integration/tests/`; ~186 tests as of run [27216379406](https://github.com/bkrupa/legacy-sports/actions/runs/27216379406)) plus the full hermetic e2e suite — at **0 failed / 0 flaked**. This skill is the triage-and-decision playbook. It does NOT teach test-writing: [testing](../testing/SKILL.md) is the how-to home, [fix-integration-tests](../fix-integration-tests/SKILL.md) is the per-ticket fix workflow, and [e2e-determinism.md](../testing/references/e2e-determinism.md) owns the determinism levers and the class-of-bug catalog.

**Glossary** (defined once): _nightly_ = the automated full-suite run of `.github/workflows/run-playwright-tests.yml` against `main` — a `workflow_run` fired when Deploy completes on main, debounced by the workflow's `gate` job to at most one attempt per `FULL_SUITE_MIN_INTERVAL_HOURS` (repo var, default 20h); the former `0 3 * * *` cron was removed under the schedule-free CI policy, and the name "nightly" is retained because the cadence on an active repo is still ~one run per day. Runs both suites sharded. _Shard_ = one parallel Playwright process in that run; integration shards each hammer the one shared live backend (`api.legacy-fantasy.com`). _0/0_ = a nightly report showing 0 failed and 0 flaked (flakes count the same as failures). _Bisect_ = attributing a nightly regression to one of the day's merge commits.

**Scope note:** `run:integration` PR-label runs (`run-integration-tests.yml`) execute the same specs against the same shared backend, so their failures triage with THIS skill's phases too — with two differences: (1) evidence comes from raw CI logs, not a report — those runs publish no `pr-<N>` GH-Pages report (see [read-playwright-report § Report Location](../read-playwright-report/SKILL.md#report-location)); use `ci_get_logs(jobName: "Run Integration Suite", errorSummary: true)`. (2) The bisect window is the PR's base..head against the last green run's actual tested SHA. Verify candidate commits with `git merge-base --is-ancestor <sha> <passing-head>` before naming them — a candidate already contained in the passing run is exonerated by construction (LS-8310's original window made exactly this error).

## When NOT to use this skill

| Situation                                                              | Go to instead                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A single hermetic e2e spec failing in PR CI                            | [testing](../testing/SKILL.md) (Critical Rules) + [ci-failure-prevention.md](../testing/references/ci-failure-prevention.md) |
| Writing new specs, choosing test layers, run commands                  | [testing](../testing/SKILL.md)                                                                                               |
| Downloading/parsing a Playwright report                                | [read-playwright-report](../read-playwright-report/SKILL.md)                                                                 |
| Implementing the fix for one failing integration spec (ticket in hand) | [fix-integration-tests](../fix-integration-tests/SKILL.md)                                                                   |

## Standing policies (homes — link, don't restate)

| Policy                                     | One-line content                                                                                                                                                                                                           | Home                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0/0 maintenance                            | Activates after 3 consecutive clean nights (closes epic LS-4401); from then on **any** new failure _or flake_ is P0 — ticket within 24h, fixed next business day or the introducing PR reverted; infra interruptions count | [zero-zero-maintenance-policy.md](../testing/references/zero-zero-maintenance-policy.md)                                                                                                                                                                                               |
| Nightly + bisect, no per-merge integration | The nightly is the deliberate backstop; a regression may live on `main` up to ~24h; attribution is manual bisection                                                                                                        | [ADR-0014](../../../docs/decisions/0014-integration-nightly-bisect.md)                                                                                                                                                                                                                 |
| Shard ceiling                              | `INTEGRATION_SHARD_CEILING` (currently 3), workers pinned to 1/shard, staggered starts; raising requires re-validation (see [Suite-config change protocol](#suite-config-change-protocol))                                 | env block + comments in `.github/workflows/run-playwright-tests.yml` (search `INTEGRATION_SHARD_CEILING`); mechanics in [e2e-determinism.md § Integration concurrency ceiling](../testing/references/e2e-determinism.md#integration-concurrency-ceiling--429-backoff-ls-7866--ls-7867) |
| No retries in integration                  | `retries: 0` in both configs — retries previously hid most real flake from CI signal (measured share recorded in the config comment)                                                                                       | comment above `retries` in `apps/web-e2e/playwright.integration.config.ts`; policy text in [e2e-determinism.md lever 10](../testing/references/e2e-determinism.md#10-failure-forensics-on-demand-not-retained-in-ci)                                                                   |

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

**Expect:** the agent-md `summary.md` — top-line totals plus full detail (location, error, snippet) for every failure and flake. Parsing detail and shell fallbacks: [read-playwright-report](../read-playwright-report/SKILL.md).

Branches:

- **`0 total`** → this is not a pass. If every test is `skipped` from a clearly-attributable global infra failure, the run is "no data" and does not break the streak (Rule 3 exception in the [0/0 policy](../testing/references/zero-zero-maintenance-policy.md)); otherwise treat as a suite failure.
- **No report deployed** → the `deploy-report` job itself failed; read job logs via `ci_get_logs(runId: <run_id>)` / `ci_view_run_jobs`. A >100 MB artifact on gh-pages is the known killer (LS-4537 — see [Fenced-off wrong paths](#fenced-off-wrong-paths)).
- **Report older than ~10 nightlies is gone** — the deploy step prunes to the 10 most recent `nightly-*` reports. Pull evidence promptly; don't plan a triage around a 2-week-old report URL.
- **Hosted CI MCP server unavailable** → `gh run list --workflow run-playwright-tests.yml --limit 5` and the `gh api` fetch in [read-playwright-report](../read-playwright-report/SKILL.md).

### Phase 2 — Route by suite

The nightly matrix runs **both** suites. Each failing test's project/file tells you which:

- **Hermetic e2e failure** (`apps/web-e2e/src/tests/`): first check the #1 class — a flag-gated route asserted without seeding: missing `page.addInitScript()` setting `window.__gbSeededFeatures` (the dominant class by a wide margin; current tally in the failure table of [ci-failure-prevention.md](../testing/references/ci-failure-prevention.md); rule home: [testing SKILL Critical Rule 2](../testing/SKILL.md#critical-rules)). If it's not flag seeding, it's a merged regression → continue to Phase 4 (bisect) — hermetic specs have no backend to blame.
- **Integration failure** (`apps/web-e2e/src/integration/tests/`): continue to Phase 3.

### Phase 3 — Classify the integration failure

**3a. Run-level 429 sweep first, before reading any individual spec.** Search the run's logs for rate-limiting:

```
ci_search_logs(runId: <run_id>, pattern: "HTTP 429", contextBefore: 5, contextAfter: 5)
```

(`failedOnly` defaults to `true` — desirable here; the context params are `contextBefore`/`contextAfter`, default 3.)

**If the error log is dominated by 429s** and the failing set is a _shifting_ collection of specs with "Failed to fetch" / "null teamId" / opaque `Received: null` — the specs are 429 victims, not discrete bugs (canonical run [27186006949](https://github.com/bkrupa/legacy-sports/actions/runs/27186006949): 39× HTTP 429 across ~9 "failing" specs). Do not debug the specs. Branch to antipattern #6 remediation in [e2e-determinism.md](../testing/references/e2e-determinism.md#6-http-429-from-the-shared-live-backend-masquerading-as-spec-failures) and check whether a recent merge added a raw `fetch`/live call bypassing `fetchWithBackoff`, or changed sharding/stagger config.

**3b. Otherwise, match each failure against the class-of-bug catalog** — the six antipatterns in [e2e-determinism.md § Antipatterns from past regressions](../testing/references/e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog) (names only here; symptoms, why-the-obvious-fix-is-wrong, and right fixes live there):

1. `expect.poll` callback throws instead of returning
2. UI-polling loops racing Apollo cache hydration
3. Phase proceeds before a state-changing mutation is visible to the read path
4. Per-phase deadline extension as a substitute for fixing backend-state contention
5. `expect.poll` succeeding with bad data
6. HTTP 429 from the shared live backend masquerading as spec failures

**3c. Discriminating experiments** — when the class isn't obvious, these signals separate backend-flake from spec-bug from product regression:

| Observation                                                                                                                                 | Verdict                                                 | Next move                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run log dominated by `HTTP 429`; failing set shifts between runs                                                                            | Backend rate exhaustion (shared-backend flake)          | 3a above — fix the call site/concurrency, not the specs                                                                                                                                                |
| Early phase's mutation succeeded, later phase gets `ForbiddenError` / `League not found` — only under nightly load, local single-spec green | Shared-user write→read lag (antipattern #3, LS-4350)    | Add the visibility poll in the _mutation_ phase; per-spec user pool is the real fix ([ledger](#open-workstream-ledger))                                                                                |
| Test stdout is opaque (`picksAutoMade=n/a`, silent stall) but the backend clearly acted                                                     | Error swallowed client-side; truth is in Lambda logs    | [cloudwatch-archaeology](../cloudwatch-archaeology/SKILL.md) — precedent LS-4295: "stuck at pick 10" was really picks 1–13 succeeding then `ForbiddenError` on every nudge, visible ONLY in CloudWatch |
| `expect.poll` resolved but a downstream assertion on the same data fails                                                                    | **Product regression**, not a test bug (antipattern #5) | Phase 4 bisect, then [debugging](../debugging/SKILL.md); never add fallback/refetch logic to the spec                                                                                                  |
| Same phase times out across several specs; timings 5–10× local                                                                              | Cumulative backend contention (antipattern #4)          | Do not bump deadlines — identify the contention axis or escalate ([ledger](#open-workstream-ledger))                                                                                                   |
| Spec is green locally at every profile, red only in the nightly report                                                                      | Cross-shard/accumulated-state effect                    | Read the nightly-vs-local profile table in [fix-integration-tests § Nightly Execution Profile](../fix-integration-tests/SKILL.md#nightly-execution-profile--why-local-single-spec-runs-mislead)        |

### Phase 4 — Bisect the day's merges (ADR-0014 duty)

Full runbook home: [ADR-0014 § Bisect runbook](../../../docs/decisions/0014-integration-nightly-bisect.md#bisect-runbook). Compact form:

> **A durable per-test S3 ledger now exists** ([testing § E2E Ledger](../testing/references/e2e-ledger.md), LS-9757) — `node .github/scripts/e2e-ledger/query-e2e-ledger.mjs --spec <spec>` returns a spec's full pass/fail/flaky timeline by direct lookup. It is not yet wired into this phase (LS-9758, follow-up); the manual `git log` + surface-map procedure below is still the current bisect path.

```bash
git log --first-parent --oneline <last-green-nightly-sha>..<failing-nightly-sha>
```

**Expect:** one squash commit per merged PR (PR number in the subject). Narrow candidates by matching the failing specs' globs in `apps/web-e2e/src/integration/integration-surface-map.json` against each commit's changed files; confirm by running the failing spec against the candidate. If no PR is cleanly attributable, the 0/0 policy names the most recent merge touching the affected area as the default revert candidate.

Branch: **the clone may be shallow** in cloud sessions (grafted history) — if `git log` shows a graft boundary before the last green SHA, fetch more history (`git fetch --deepen=50 origin main`) before trusting the merge list.

### Phase 5 — Remediate

Hand the fix itself to [fix-integration-tests](../fix-integration-tests/SKILL.md) (reproduce → diagnose → targeted fix → two-tier verification). Two campaign rules bind every fix:

1. **Fix the pattern, not the phase.** If the root cause matches a catalog class, grep for the same structural pattern across the failing spec, sibling specs, and shared helpers, and fix every instance or file a follow-up listing them — the procedure is [fix-integration-tests § Class-of-bug check](../fix-integration-tests/SKILL.md#class-of-bug-check--fix-the-pattern-not-the-phase). Half-applied pattern fixes are how the repo accumulated the 10-ticket `waitForSeasonActive` chain (LS-4237→LS-4353).
2. **Regression-search after every fix** (mandated repo-wide by commit `1b5b610`, PR #5672): `Grep` for specs referencing the changed route, component, or GraphQL operation; run them locally; update any that assert the old behavior in the same PR. Home: [testing SKILL Critical Rule 3](../testing/SKILL.md#critical-rules), last bullet.

New-spec additions that fall out of a fix are pre-validated per 0/0 policy Rule 4 (5 consecutive local passes) and must register in the surface maps ([testing § New-Spec Registration Contract](../testing/SKILL.md#new-spec-registration-contract-surface-maps)) and, if heavy, in `integration-shard-weights.json`.

### Phase 6 — Close the loop (measured, never judged by eye)

- Success = the **next nightly report reads 0 failed / 0 flaked** in `summary.md` totals. A "looks fine" scan of the HTML report is not evidence; flakes appear in the totals and count as failures.
- Update streak accounting per the [0/0 policy tracking table](../testing/references/zero-zero-maintenance-policy.md#tracking-and-reporting) (comment the running streak on LS-4401; non-zero → per-run epic + P0).
- For a pre-merge nightly-shaped check of the fix branch, use the `ci_dispatch_workflow` call in [fix-integration-tests Phase 4b](../fix-integration-tests/SKILL.md#phase-4b--nightly-shaped-verification-mandatory-before-push) (`waitForCompletion: true` is correct there — non-PR dispatch runs emit no push notification).

## Fenced-off wrong paths

Each of these was tried, made things worse, and is now fenced. If your remediation plan matches a row, stop.

| Tempting move                                                                                          | What actually happened                                                                                                                                         | Fence                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch the one failing phase of `waitForSeasonActive` (timeout bump, one more reload, one guarded poll) | 10 consecutive tickets, LS-4237→LS-4353 — each single-phase fix let the same class re-fail the next night on a sibling phase                                   | Class-of-bug check is mandatory (Phase 5 rule 1); antipatterns #1/#2 in [e2e-determinism.md](../testing/references/e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog)                                    |
| Add retries to "fix" flake                                                                             | 2 retries hid most real flake from CI signal (measured share in the config comment)                                                                            | `retries: 0` in both Playwright configs (comment in `playwright.integration.config.ts` is the record); the workflow adds no `--retries` for integration                                                                            |
| Raise the shard count to speed the suite up                                                            | 3 unstaggered shards produced a 39× HTTP 429 cascade (run 27186006949, LS-7866); collapsing to 1 shard then blew the 120-min ceiling at 69/186 tests (LS-7867) | `INTEGRATION_SHARD_CEILING` clamp in the workflow (its env block holds the current value); raise only via the [Suite-config change protocol](#suite-config-change-protocol)                                                        |
| Turn on `trace: 'retain-on-failure'` in CI for forensics                                               | A single trace zip exceeded GitHub's 100 MB per-file gh-pages limit and broke report deploys (LS-4537)                                                         | `trace: 'off'` in both configs; reproduce locally with `nx_run_e2e_specs(..., withTracing: true)` instead — [e2e-determinism lever 10](../testing/references/e2e-determinism.md#10-failure-forensics-on-demand-not-retained-in-ci) |
| Bump a per-phase deadline because "the backend was slow"                                               | Deadline creep from 2→10 min while nightly stayed red; the contention is unbounded by the test's timeout                                                       | Antipattern #4: name the contention axis or escalate to the [ledger](#open-workstream-ledger) items                                                                                                                                |

## Suite-config change protocol

Applies to any change to `INTEGRATION_SHARD_CEILING`, stagger, workers, `playwright.integration.config.ts`, `integration-shard-weights.json`, `shard-partition.ts`, or global setup/teardown.

1. **Normal PR review** — no suite-config change ships outside the standard PR flow ([pr-lifecycle](../pr-lifecycle/SKILL.md)).
2. **Ceiling raises are validated BEFORE merge**: dispatch `run-playwright-tests.yml` with `test-suite=integration` at the proposed count and confirm **0 429-driven failures across ≥2 consecutive runs** — this is the raise protocol recorded in the workflow's own `INTEGRATION_SHARD_CEILING` comment block (the SSOT). Note the workflow clamps `shard-total` to the ceiling, so the validation dispatch must come from the branch that raises the constant.
3. **All other suite-config changes are observed AFTER merge**: the change is not "done" until **2 consecutive nightly reports show 0 failed / 0 flaked**. Track this as an explicit task; a single clean night is statistical noise.
4. Success is read from report totals (`summary.md` via `ci_get_playwright_report`), never judged by eye.

## Open-workstream ledger

Structural fixes that would shrink the whole failure surface. Each is OPEN — cite the ticket instead of re-proposing the idea.

| Item                                        | Status              | What closes it                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-spec teardown (LS-4356)                 | OPEN                | Every integration spec deletes its own leagues **by ID** in its `afterAll`; `globalTeardown` then reverts to an all-modes orphan safety net. Doctrine: [integration-testing.md § Test Isolation](../testing/references/integration-testing.md#7-test-isolation--per-spec-setupteardown-required) |
| Per-spec user pool (LS-4357)                | OPEN                | JIT-registered ephemeral users per spec replace the shared 14-seat pool defaults — the only full fix for cross-shard shared-user contention (today's dominant nightly failure mode). Until then, mitigation is the write→read visibility pattern (antipattern #3)                                |
| Fastest-shard teardown workaround (LS-4318) | WORKAROUND IN PLACE | Sharded runs skip `globalTeardown`'s league sweep (the fastest shard was deleting leagues still in use by slower shards); the next run's `globalSetup` sweeps instead — see the LS-4318 comment in `apps/web-e2e/src/integration/global-teardown.ts`. Superseded when LS-4356 lands              |

## Related skills

- [testing](../testing/SKILL.md) — test-writing home, what-gates-merge matrix, tiered test-user model, surface-map contract
- [fix-integration-tests](../fix-integration-tests/SKILL.md) — the per-ticket fix workflow this campaign dispatches into
- [read-playwright-report](../read-playwright-report/SKILL.md) — report retrieval/parsing mechanics
- [cloudwatch-archaeology](../cloudwatch-archaeology/SKILL.md) — backend truth when test stdout lies
- [debugging](../debugging/SKILL.md) — product-regression root-causing after a bisect

## Provenance and maintenance

Created 2026-07-02 from the skills audit (`scratch/skills-audit/synthesis.json`, hardest-problem candidate #1: nightly live-backend integration determinism — doctrine existed across 6+ documents with no operational campaign playbook). Re-verify volatile facts:

- Shard ceiling + raise protocol: `grep -n "INTEGRATION_SHARD_CEILING" .github/workflows/run-playwright-tests.yml`
- Nightly trigger + suites: `grep -n "workflow_run\|FULL_SUITE_MIN_INTERVAL_HOURS\|Nightly" .github/workflows/run-playwright-tests.yml | head`
- Report naming/pruning: search `DEST_DIR: playwright-report/` and `Pruning old` in the same workflow
- Retries policy: `grep -n -B2 "retries" apps/web-e2e/playwright.integration.config.ts`
- Spec inventory: `ls apps/web-e2e/src/integration/tests/`
- 0/0 activation gate (3 clean nights) and P0 rule: `.agents/skills/testing/references/zero-zero-maintenance-policy.md`
- Teardown skip: `grep -n "LS-4318" apps/web-e2e/src/integration/global-teardown.ts`
- Regression-search mandate: `git show 1b5b610 --stat` and testing SKILL Critical Rule 3
- Flag-seeding failure share (19/22 at time of writing): failure table in `.agents/skills/testing/references/ci-failure-prevention.md`
- Open tickets LS-4356 / LS-4357: check Jira before citing as still OPEN
