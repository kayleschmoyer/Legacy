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

| Policy                                     | One-line content                                                                                                                                                                                                                  | Home                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0/0 maintenance                            | Activates after 3 consecutive clean nights (closes epic LS-4401); from then on **any** new failure _or flake_ is P0 — ticket within 24h, fixed next business day or the introducing PR reverted; infra interruptions count        | [zero-zero-maintenance-policy.md](../testing/references/zero-zero-maintenance-policy.md)                                                                                                                                                                                               |
| Nightly + bisect, no per-merge integration | The nightly is the deliberate backstop; a regression may live on `main` up to ~24h; attribution is manual bisection                                                                                                               | [ADR-0014](../../../docs/decisions/0014-integration-nightly-bisect.md)                                                                                                                                                                                                                 |
| Shard ceiling                              | `INTEGRATION_SHARD_CEILING` (currently 3), workers pinned to 1/shard, staggered starts; raising requires re-validation (see [Suite-config change protocol](references/wrong-paths-and-protocols.md#suite-config-change-protocol)) | env block + comments in `.github/workflows/run-playwright-tests.yml` (search `INTEGRATION_SHARD_CEILING`); mechanics in [e2e-determinism.md § Integration concurrency ceiling](../testing/references/e2e-determinism.md#integration-concurrency-ceiling--429-backoff-ls-7866--ls-7867) |
| No retries in integration                  | `retries: 0` in both configs — retries previously hid most real flake from CI signal (measured share recorded in the config comment)                                                                                              | comment above `retries` in `apps/web-e2e/playwright.integration.config.ts`; policy text in [e2e-determinism.md lever 10](../testing/references/e2e-determinism.md#10-failure-forensics-on-demand-not-retained-in-ci)                                                                   |

## Triage: the six phases

Full procedure — every tool call, log-search pattern, decision table, and remediation branch: **[references/triage-phases.md](references/triage-phases.md)**. The shape of it:

1. **Get the failing run and its report** — identify the run, pull the report, list the failed/flaked specs.
2. **Route by suite** — hermetic e2e failures and live integration failures diverge here; a hermetic failure has no backend to blame.
3. **Classify the integration failure** — run-level `HTTP 429` sweep first (a 429-dominated run is not a set of discrete spec bugs), then match each failure against the six-antipattern class-of-bug catalog in [e2e-determinism.md](../testing/references/e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog), then discriminating experiments to separate backend flake from spec bug from product regression.
4. **Bisect the day's merges** (the ADR-0014 duty) — verify every candidate with `git merge-base --is-ancestor <sha> <passing-head>`; a candidate already in the passing run is exonerated by construction.
5. **Remediate** — fix the pattern, not the phase: grep the structural pattern across the failing spec, its siblings, and shared helpers, and fix every instance or file a follow-up listing them.
6. **Close the loop** — measured, never judged by eye.

## Fenced-off wrong paths, protocols, and the ledger

The remediations that look right and are not (retries, deadline extensions, raising the shard ceiling to "fix" contention), the re-validation protocol any suite-config change must pass, and the open-workstream ledger: [references/wrong-paths-and-protocols.md](references/wrong-paths-and-protocols.md).

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
- Ledger query tool (LS-9757/LS-9758): the `query-e2e-ledger.mjs` invocation in Phase 4 is verified against the shipped tool (PR #7413) — re-verify against [testing § E2E Ledger](../testing/references/e2e-ledger.md) and the script itself if its interface changes
