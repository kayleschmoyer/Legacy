# Mobile Chrome E2E scope: PR vs nightly (LS-10332)

**Decision (maintainer, 2026-10-01):** PR CI runs only the affected specs on Mobile Chrome unless
the spec selection escalates to run-all. The once-a-day full-suite run covers the rest.

## Why

LS-9658 (2026-08-23) moved the PR `e2e-mobile` job from "affected specs, one shard, 20 minutes" to
full parity with the chromium `e2e` job (same shard matrix, 45 minutes) on every web/e2e/API
change. The week it landed, runner-hours per PR roughly doubled (1.8–2.3 h → 3.7–8 h) and EC2 spend
went from $231 (July) to $700 (September). PR CI is the majority of self-hosted runner minutes.

LS-9658 fixed a real hole, but a narrower one than full parity: the original LS-9411 gate
**skipped** mobile whenever the selection escalated to run-all, so the broadest changes (app shell,
`lib/shared-components`) got zero mobile-viewport coverage at PR time. Four of six historical "E2E
broken on main" tickets escaped that way. None escaped because a narrow change ran only its
affected specs.

There is no merge-queue CI to move the full run into: `merge-queue.yml` is a custom queue that
merges once PR checks are green, and no workflow triggers on `merge_group`.

## The shape

| Where                                  | Selection                                                  | Mobile Chrome runs                                                           |
| -------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PR — `e2e-mobile` in `ci-pipeline.yml` | run-all (`e2e-affected-run-all == 'true'`)                 | Full hermetic suite, same 3-shard matrix as chromium, 45-minute budget       |
| PR — `e2e-mobile` in `ci-pipeline.yml` | narrow, affected specs mapped (`e2e-affected-specs != ''`) | One shard, 20-minute budget: the `@critical` safety net + the affected specs |
| PR — `e2e-mobile` in `ci-pipeline.yml` | narrow, no affected specs                                  | Skipped (`CI Gate` and `e2e-affected` treat `skipped` as a pass)             |
| Nightly — `run-playwright-tests.yml`   | automated full-suite run (and manual `all`)                | Full suite, no grep filter, 3 shards                                         |

Mobile Safari is unchanged: nightly-only, one shard over `@critical` (locked decision — its flake
history, LS-9328/LS-9409, keeps it off the merge-blocking gate).

## Invariants

- **Never skip `e2e-mobile` on run-all.** The job-level `if` must not carry a
  `e2e-affected-run-all != 'true'` term. `.github/scripts/__tests__/e2e-mobile-gating.test.mjs`
  fails if one is added.
- The LS-9449 promotion (a "narrow" selection of ≥100 spec files becomes run-all) is what keeps the
  narrow mobile shard inside its 20-minute budget. Change the two together.
- A mobile regression that affected-selection misses surfaces on the next nightly, within a day,
  not at PR time. That is the accepted trade.

## Follow-up

Record one week of self-hosted runner minutes before and after this change on LS-10332.
