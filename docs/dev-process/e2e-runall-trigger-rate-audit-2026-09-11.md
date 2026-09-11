# E2E `runAllWhenChanged` trigger-rate audit (LS-8905)

**Date**: 2026-09-11
**Ticket**: [LS-8905](https://bkrupa.atlassian.net/browse/LS-8905) (parent epic [LS-8893](https://bkrupa.atlassian.net/browse/LS-8893))
**Scope**: Step 1 measurement only — no glob configuration changed by this ticket.

## Background

`apps/web-e2e/src/e2e-surface-map.json`'s `runAllWhenChanged` list escalates a PR's E2E
selection to the full 182-spec, 3-shard suite whenever a changed file matches one of its
patterns. LS-8905 was opened to measure, with real data, how often that escalation
actually fires — before anyone spends a PR narrowing the globs further.

**This measurement was already partially acted on.** A preliminary finding was recorded
as a comment on LS-8905 on 2026-08-02 (20 sampled CI runs over ~6 days, classified by
job-name/title inspection: 55% full-suite, 15% narrow, 30% skipped — 79% of runs that
triggered E2E at all went full-suite). That comment explicitly flagged its own
limitations (small sample, short window, no per-glob attribution) and recommended a
follow-up. The follow-up, **[LS-8920](https://bkrupa.atlassian.net/browse/LS-8920)
"Narrow e2e-surface-map.json runAllWhenChanged globs to cut full-suite trip rate,"
already merged 2026-08-11** ([PR #7059](https://github.com/bkrupa/legacy-sports/pull/7059)):
it re-measured against ~70 PRs' actual diffs, found `lib/shared-components/src/**` as
the dominant driver (12/70, 17.1%), and replaced the blanket glob with per-directory
entries — dropping run-all status only for the 10 feature subfolders confirmed to have
adequate per-spec coverage, re-validating trip rate fell 27.1% → 17.1%.

Since then, **[LS-9787](https://bkrupa.atlassian.net/browse/LS-9787)** (interim
mitigation ahead of the graph-derived selection flip) added several `apps/web-e2e/src/**`
test-infra directories back into `runAllWhenChanged`, plus a few zero-cost subfolder
restores, measured to move the trip rate 22.5% → 23.8% on its own 80-PR sample.

So this ticket's original question — "should we narrow the globs?" — was already acted
on once (LS-8920) and partially reversed once (LS-9787) since it was opened. What follows
is a fresh, independent re-measurement of the **current** configuration, run per this
ticket's own AC (~4 weeks of real PRs, using actual diffs rather than titles), to confirm
where things stand today and inform whether _further_ narrowing is worth pursuing.

**LS-9824 / LS-9996 progress check** (per this ticket's own note): the graph-derived
surface-map flip has **not landed**. As of LS-9996's 2026-09-10 status comment, the
clean-audit streak is at 0 (reset by a real under-selection finding in
`lib/shared-components/src/features/elite-draft/**`, filed as LS-10056 and still open).
This measurement is therefore live, working context — not moot historical record.

## Method

- **Sample**: the 500 most-recently-merged PRs in `bkrupa/legacy-sports` as of
  2026-09-11, spanning `mergedAt` ≈ 2026-08-22 to 2026-09-11 (~20 days). The PR-list API
  call caps at 500 results per call; at this repo's merge velocity that window is
  narrower than the nominal "4 weeks" the AC asked for, not a full 28 days. Treated as
  the best available approximation rather than re-paginating past the cap.
- **Data source**: `github_pr_files` (batched changed-file-name fetch, 50 PRs/call, 10
  calls) against each PR's actual merged diff — not orchestrator run logs/titles. This
  directly answers "did this PR touch a path that matches `runAllWhenChanged`" without
  depending on whether a given run happened to skip, retry, or get cancelled.
- **Glob set**: the current, full `runAllWhenChanged` array in
  `apps/web-e2e/src/e2e-surface-map.json` (49 patterns as of this measurement — already
  reflecting both LS-8920's narrowing and LS-9787's widening). `dir/**` matched any file
  under that prefix; `dir/*.ext` matched only direct children; exact paths matched
  exactly.
- Every changed file of every PR was checked against every pattern; a PR counts as
  "tripped" if **any** file matched **any** pattern.

## Results

**92 of 500 merged PRs (18.4%) touched a `runAllWhenChanged` path** and would escalate to
the full 182-spec, 3-shard E2E run. The remaining 408 (81.6%) would not.

This lands close to LS-8920's own post-narrowing re-validation figure (17.1% on its
70-PR sample) — consistent with LS-9787's widening (a few added directories) pushing the
rate up only slightly, not undoing LS-8920's work. It is far below the pre-LS-8920
baseline (55% of all triggering runs, 79% of runs where E2E ran at all).

### Bucket breakdown (of the 92 tripped PRs; a PR can land in multiple buckets)

| Bucket                             | Tripped PRs | Share of all 500 PRs |
| ---------------------------------- | ----------: | -------------------: |
| `lambdas/db/src/schema/**`         |          41 |                 8.2% |
| `lib/shared-components/src/**`     |          24 |                 4.8% |
| `apps/web-e2e/src/**` (test infra) |          22 |                 4.4% |
| `apps/web/src/app/**`              |           8 |                 1.6% |
| `apps/web/src/lib/**`              |           4 |                 0.8% |
| `apps/web/src/context/**`          |           0 |                   0% |
| `apps/web/src/api/**`              |           0 |                   0% |
| other                              |           0 |                   0% |

Schema changes and E2E-infra changes together account for ~68% of trips (63/92), and
both are arguably _correct_ escalation triggers rather than blast-radius inflation:

- **GraphQL schema changes** (`lambdas/db/src/schema/**`) can affect any query/mutation
  in the app by construction — there's no obviously-safe narrower glob here.
- **E2E test-infra changes** (`apps/web-e2e/src/{pages,fixtures,mocks,support,...}/**`)
  can silently break spec collection or mocking across the whole suite; running
  everything when the harness itself changes is the point, not overhead.

`lib/shared-components/src/**` (24 trips) already went through one narrowing pass in
LS-8920, which deliberately kept the remaining entries broad only for genuinely
cross-cutting primitives and features with no dedicated per-spec coverage yet.
`apps/web/src/app/**` and `apps/web/src/lib/**` are minor contributors (12 trips
combined, 2.4% of all PRs) — too small a share to justify a narrowing pass on their own.

## Tradeoff assessment (per AC)

Narrowing `runAllWhenChanged` further would reduce full-suite runs somewhat, but the
residual trip rate is already modest (18.4%, most of it schema/test-infra changes that
arguably _should_ run everything). The genuinely discretionary category
(`shared-components`) was already narrowed once in LS-8920 with an explicit
coverage-preserving methodology (kept broad only where no per-spec coverage existed).
Squeezing further here risks the failure mode this whole system exists to prevent —
under-selection silently missing a shared-component regression — for a shrinking payoff,
and that risk is not fully backstopped: the always-on `@critical` shard (43 spec files,
122 tests) and the ~20h post-deploy full suite catch regressions _eventually_, not before
merge, which is the gap [ADR 0012](../decisions/0012-pr-ci-e2e-coverage.md) was written
to close in the first place.

More importantly, a manual-glob narrowing pass is the wrong tool at this point in the
project's timeline: **LS-9824/LS-9996** are actively driving toward replacing this whole
mechanism with graph-derived, per-spec-accurate selection, which removes the
precision/coverage tradeoff entirely instead of trading it off by hand. That work is
mid-flight (blocked on LS-10056, a real elite-draft under-selection finding, before the
clean-audit streak can resume).

## Recommendation

**Do not file a new glob-narrowing follow-up ticket at this time.** The current 18.4%
trip rate is a reasonable operating point, dominated by two categories
(schema, e2e-infra) that should reasonably remain broad. Let LS-9824/LS-9996 land instead
— once the graph-derived map replaces the hand-maintained one, this entire
glob-precision question becomes moot by construction rather than by further manual
tuning.

## Provenance

- 2026-08-02: preliminary 20-run sample recorded as a comment on LS-8905 (methodology
  limitations noted inline).
- 2026-08-11: LS-8920 merged (PR #7059) — narrowed `lib/shared-components/src/**` based
  on a 70-PR diff-attributed sample; trip rate 27.1% → 17.1% on that sample.
- LS-9787: added `apps/web-e2e/src/**` test-infra dirs and three feature-subfolder
  restores back into `runAllWhenChanged` as an interim under-selection mitigation ahead
  of the graph-derived flip; measured 22.5% → 23.8% on an 80-PR sample.
- 2026-09-11 (this document): independent 500-PR re-measurement of the current
  configuration using exact diffs; 18.4% trip rate.
