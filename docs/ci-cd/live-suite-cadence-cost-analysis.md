# Live-suite cadence cost analysis (LS-8911)

> **Status: analysis only — no decision made here.** This document is the deliverable for
> [LS-8911](https://bkrupa.atlassian.net/browse/LS-8911), part of the LS-8893 CI/infra cost
> audit. It lays out current cost, options, and a labeled recommendation for two coverage-cadence
> levers. **Both are genuine detection-latency regressions** (a bug on `main` sits undetected
> longer), which is why they are being decided by a human owner rather than applied silently.
> Nothing in this document changes CI configuration — see the companion PR for the doc-only diff.

## Scope boundary

Out of scope for this analysis, and not touched by any recommendation below:

- **Integration shard count (3, `INTEGRATION_SHARD_CEILING` in `run-playwright-tests.yml`)** — an
  empirically-validated ceiling driven by live-backend HTTP 429 throttling (LS-7866/LS-7867), not
  a speed knob. Raising or lowering it needs re-validation against the live backend, which is a
  different question than cadence.
- **Playwright retries/trace/video config** — already documented as deliberately at floor.

## Item 1 — `FULL_SUITE_MIN_INTERVAL_HOURS`

### What it gates

`run-playwright-tests.yml:168` reads `vars.FULL_SUITE_MIN_INTERVAL_HOURS` (default **20h**) in the
`gate` job. It fires on every `Deploy` completion on `main` and debounces to at most one full-suite
**attempt** per interval, mirroring the old `0 3 * * *` nightly cron's once-a-day cost profile
(schedule-free CI policy, [ADR-0014](../decisions/0014-integration-nightly-bisect.md), amended
2026-07-18). Each real attempt runs 9 jobs (`prepare` job matrix, `run-playwright-tests.yml:289-311`):

| #   | Job                       | Shards | Config                                                                                                   |
| --- | ------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| 1-3 | integration               | 3      | live backend, `workers=1`, staggered start, 120 min timeout/shard                                        |
| 4-6 | e2e                       | 3      | hermetic, `workers=4` `retries=2`, all tests incl. `@slow`, 60 min timeout/shard                         |
| 7   | shared-live               | 1      | [ADR-0016](../decisions/0016-test-dependency-injection.md) dual-mode specs, live backend, 60 min timeout |
| 8   | Mobile Chrome `@critical` | 1      | Pixel 5 emulation, chromium engine, 60 min timeout                                                       |
| 9   | Mobile Safari `@critical` | 1      | iPhone 12 emulation, **webkit** engine, 60 min timeout                                                   |

> **Superseded in part (LS-10332, 2026-10-01):** row 8 is now the **full** Mobile Chrome suite on 3
> shards, not one `@critical` shard — see [mobile-e2e-pr-scope.md](mobile-e2e-pr-scope.md). Each real
> attempt therefore runs 11 jobs, and the per-attempt estimate below understates Mobile Chrome by
> roughly a second hermetic e2e sweep (~60 runner-minutes by this document's own assumptions, in
> place of the ~12 listed). The figures in this analysis are left as written.

### Current cost (rough estimate)

I don't have exact Actions-billing runner-minutes for this session (self-hosted runner cost isn't
exposed as a per-job dollar figure in the CI/AWS tools available here), so the figures below are
**derived from the job timeouts, matrix shape, and the shard-weighting/spec-runtime notes already
in the workflow's comments** — not pulled from historical run telemetry. Treat them as
order-of-magnitude, and cross-check against actual Actions run durations
(`ci_view_run_jobs`/billing) before using them in a budget decision.

Assumptions (self-hosted `m6a.xlarge`-class runner per job, per `terraform/runners/variables.tf`):

- Integration shards: bounded by the heaviest spec (~1400s / ~23 min per the LS-7867 comment) plus
  up to 60s of staggered start — call it **~30 min/shard** average → 3 × 30 = **90 min**
- E2E shards (hermetic, 4 workers, full suite incl. `@slow`): **~20 min/shard** → 3 × 20 = **60 min**
- shared-live (1 shard, "small and read-mostly" per its own comment): **~10 min**
- Mobile Chrome `@critical` (bounded add-on, single small spec set): **~12 min**
- Mobile Safari `@critical` (same shape as Mobile Chrome): **~12 min**

**≈ 184 runner-minutes (~3.1 runner-hours) per real attempt.**

| Interval              | Attempts/day | Attempts/month (30d) | Runner-hours/month |
| --------------------- | ------------ | -------------------- | ------------------ |
| 20h (current default) | ~1.2         | ~36                  | ~112               |
| 24h                   | 1.0          | ~30                  | ~93                |
| 48h                   | 0.5          | ~15                  | ~46                |

(Attempts/day = 24 ÷ interval, assuming the repo always has a merge waiting — i.e. the debounce is
the binding constraint, which matches the observed run history: dozens of `Deploy`-triggered
`workflow_run` events per day, nearly all of them debounced to `should-run=false`.)

### Option A — leave at 20h (status quo)

- Cost: baseline (~112 runner-hours/month as estimated above).
- Detection latency: matches the original nightly's cost-parity design point (ADR-0014) — a
  regression merged right after an attempt fires is caught by the _next_ attempt, so worst case is
  just under one interval, i.e. **~20h**.

### Option B — raise to 24h

- Cost: ~17% fewer attempts/month than 20h (36 → 30, ballpark ~19 runner-hours/month saved).
- Detection latency: worst case rises from ~20h to **~24h** (+4h). Directly restores "once per
  calendar day" framing, which reads cleanly, but is a real (if small) widening of the bisect
  window in [ADR-0014](../decisions/0014-integration-nightly-bisect.md#bisect-runbook).

### Option C — raise to 48h

- Cost: ~58% fewer attempts/month than 20h (36 → 15, ballpark ~66 runner-hours/month saved) — the
  largest lever of the two items in this ticket.
- Detection latency: worst case rises to **~48h**, i.e. up to 2 full days of undetected regression
  on `main` before the live suite catches it (vs. bisecting a single day's merges today, per
  ADR-0014's runbook, an owner may now need to bisect across two days of merges).

### Recommendation (not a decision)

I'd lean toward **Option B (24h)** over 48h if the goal is cost trimming without materially
changing the risk posture: it's a modest, easily-explained saving ("once per day" is already close
to true today) with a small, bounded latency cost. 48h roughly doubles the bisect search space
(ADR-0014's runbook) for a savings level that's still small in absolute dollar terms given
self-hosted (not per-minute-billed GitHub-hosted) runners — the real cost signal here is
self-hosted **runner capacity/contention**, not a large AWS bill, so the case for 48h should rest
on evidence that runner capacity (queue depth, scale-up frequency) is the actual constraint, not
just "fewer runs is fewer cost." That evidence isn't in this analysis — worth a follow-up look at
[`terraform/runners/runner-dashboard.tf`](../../terraform/runners/runner-dashboard.tf) metrics
before committing to 48h specifically.

## Item 2 — Mobile Safari dedup (daily → weekly)

### The overlap

- **`run-playwright-tests.yml`** runs a Mobile Safari (iPhone 12 emulation) `@critical` job on
  every full-suite attempt (see Item 1's cadence) — engine: **webkit** under the hood
  (`matrix.engine: webkit`, LS-8502).
- **`cross-browser-e2e.yml`** runs a dedicated **webkit** `@critical` job on its own debounced
  cadence, gated by `vars.CROSS_BROWSER_MIN_INTERVAL_HOURS` (default **168h = weekly**).

Both exercise the same underlying WebKit rendering/JS engine against the same `@critical` spec
set. The difference between them is **viewport + UA emulation** (iPhone 12 mobile viewport/touch
vs. desktop webkit), not the engine — so the daily Mobile Safari job is partially redundant _engine_
coverage layered under the weekly desktop-webkit run, at the cost of an extra self-hosted job on
every full-suite attempt.

### Current cost (rough estimate)

Per the Item 1 estimate, Mobile Safari `@critical` is **~12 min/attempt**. At the current 20h
interval (~36 attempts/month): **~1 self-hosted job/day, ~7.2 runner-hours/month.** This is the
smallest single line item in the 9-job suite — cutting it doesn't move the needle much on its own,
but it's a clean, well-isolated cut if the redundancy argument holds.

### Option A — leave Mobile Safari in the daily full-suite (status quo)

- Cost: baseline (~7.2 runner-hours/month as estimated above), on top of whatever Item 1 decides.
- Detection latency: mobile-viewport-specific WebKit regressions (Safari-only touch/viewport CSS,
  mobile-only layout breakpoints, iOS Safari quirks not exercised by desktop webkit) are caught
  within the full-suite's cadence (~20-48h depending on Item 1).

### Option B — fold Mobile Safari into the weekly `cross-browser-e2e.yml` run

- Cost: removes ~1 self-hosted job/day from the full-suite matrix (~7.2 runner-hours/month at the
  current 20h interval); the weekly cross-browser run picks up a bounded iPhone-12-viewport
  `@critical` pass instead, adding a small amount to that workflow's own footprint.
- Detection latency: mobile-viewport-specific WebKit regressions are now caught on
  `CROSS_BROWSER_MIN_INTERVAL_HOURS`' cadence (default 168h = weekly) instead of the full-suite's
  daily-ish cadence — **up to a 7-day detection window** for a Safari-only mobile-viewport bug,
  vs. ~1-2 days today. This is a materially bigger latency jump than Item 1's 20h→48h move, even
  though the runner-minutes saved are smaller.

### Recommendation (not a decision)

This is the harder tradeoff of the two, and I'd flag it rather than lean hard either way: the
redundancy argument (WebKit engine coverage already exists weekly) is real, but Mobile Safari is
the fund's only source of _mobile-viewport_ WebKit coverage — folding it into the weekly run
doesn't just relax cadence on already-duplicated coverage, it drops the **only** viewport-specific
signal to weekly. Given the job itself is cheap (~7.2 runner-hours/month, the smallest line item
here), the cost saved is small relative to the 7-day latency exposure it buys. If capacity/queue
pressure on the self-hosted runner pool is the actual driver (see the note in Item 1), Item 1's
interval change reaches a bigger saving for a smaller latency cost than this one does — I'd
consider Item 2 lower-priority unless runner capacity is tight enough that every job matters.

## Summary table

| Item                   | Option                             | Runner-hours/month (est.)     | Worst-case detection latency |
| ---------------------- | ---------------------------------- | ----------------------------- | ---------------------------- |
| 1. Full-suite interval | 20h (status quo)                   | ~112                          | ~20h                         |
| 1. Full-suite interval | 24h                                | ~93 (−~19)                    | ~24h                         |
| 1. Full-suite interval | 48h                                | ~46 (−~66)                    | ~48h                         |
| 2. Mobile Safari       | Daily (status quo)                 | ~7.2                          | ~20-48h (tracks Item 1)      |
| 2. Mobile Safari       | Weekly (folded into cross-browser) | ~0 (moves to weekly workflow) | ~168h (7 days)               |

All figures are estimates derived from job timeouts and in-repo comments about spec weight, not
pulled from Actions billing/run-duration telemetry — recommend validating with real run durations
(`ci_view_run_jobs` across a sample of real, non-debounced attempts, or the Actions usage report)
before finalizing a number to put in front of budget stakeholders.

## Decision log

_The repo owner's decision on both items, once made, should be recorded here (or as a follow-up
ADR if either change is adopted) rather than only living in the Jira comment thread._

- Item 1 (`FULL_SUITE_MIN_INTERVAL_HOURS`): **undecided**
- Item 2 (Mobile Safari dedup): **undecided**
