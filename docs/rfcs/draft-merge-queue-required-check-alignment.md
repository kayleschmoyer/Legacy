# Align merge-queue required-check evaluation and eliminate cancelled-duplicate stalls (LS-7988)

## Status

Draft

## Problem

Pull requests that are genuinely green — every one of the eight required status
checks reporting `success` on the current head SHA — intermittently fail to merge
and present to humans as "stuck". The failure rate rises sharply during periods
of high `main` throughput (observed: 4 base advances in ~15 minutes, ~10
concurrency-cancelled merge-queue runs in the same window).

Root-cause analysis found **three independent readers of required-check state
that do not agree**:

1. **The merge-queue processor** (`.github/scripts/merge-queue-processor.js`).
   `validateStatusChecks` filters check runs to the names branch protection
   actually requires, then deduplicates **latest-completed-run-per-name** (keeping
   the most recent run, so a later `success` supersedes an earlier `cancelled`).
   This reader is **correct** — it logs `✅ PR #N is ready for merge`.

2. **GitHub's merge-API ruleset evaluator** (the thing that actually gates
   `PUT /pulls/{n}/merge`). When a required check NAME has more than one run on a
   SHA and one of them is `cancelled`, GitHub's evaluator can latch onto the
   cancelled run even though the latest run for that name succeeded. It returns:

   ```
   405 Repository rule violations found
   Required status check "🚀 CI Pipeline / lint" is cancelled.
   ```

   The processor cannot dedup this away — the divergence is server-side. The PR is
   green by every reasonable reading yet un-mergeable.

3. **The MCP triage tooling** (`github_pr_dashboard`, `github_pr_why_blocked`).
   These count stale duplicate runs and non-required checks, so a fully-green PR is
   reported as `CI_FAILING` (e.g. `No Merge Conflicts ×2`, `🔐 SHA Sanity Check`,
   `review`, `Summarize & Report` listed as "failing" when none are required and
   the latest of each is `success`). This is the surface humans look at first, so
   it is the source of distrust in the queue.

### Why the duplicate/cancelled runs exist

The required-check NAMES are the granular CI Pipeline jobs themselves
(`🚀 CI Pipeline / lint|format|build|test|custom-checks`), plus `bot-review`
(a commit **status**, not a check run), `No Merge Conflicts`, and
`Verify All Migrations Applied`. Two mechanisms create multiple terminal runs of
the same required NAME on a single head SHA:

- **Concurrency cancellation.** `concurrency: cancel-in-progress: true` (at the
  orchestrator level for CI Pipeline, and in `check-conflicts.yml`) cancels an
  in-flight run when a newer trigger arrives. The cancelled run leaves a terminal
  `cancelled` check-run for a **required** name. To GitHub's gate, a cancelled
  required check is indistinguishable from a failure.
- **Base-push re-checks.** `No Merge Conflicts` is re-posted on every `main`
  advance by the base-push sweep, creating fresh check-runs of the same name on
  the same head SHA (observed re-firing at 05:23 and 05:41 on one PR).

The common denominator is **multiple terminal runs of one required-check name on
one SHA**. That ambiguity is what GitHub's evaluator and the dashboard tooling
both mishandle.

## Goals

- A PR whose latest run of every required check is `success` is mergeable by the
  queue **deterministically**, regardless of how many superseded/cancelled runs of
  those names exist on the SHA.
- A required check briefly in a transient state (registering, in-progress, or
  cancelled-pending-replacement) results in a **re-queue**, never a
  `🚫 Cannot Merge` / `Processing Error` comment.
- Human-facing triage (`github_pr_dashboard` / `github_pr_why_blocked`) reflects
  the same required-check verdict the merge queue uses — no false-red.
- No regression in real-failure detection: a genuinely failing or genuinely
  unmergeable PR is still blocked and reported.

## Non-goals

- Building a true **rebase merge train** (serialize: rebase head-of-queue onto
  main → CI once → merge → repeat). That addresses throughput/starvation and is a
  separate, larger initiative; this RFC only addresses required-check _state
  alignment_.
- Changing the set of quality gates (what is tested) or the code-owner / security
  review gates. Those blocks are correct and out of scope.
- Removing `concurrency: cancel-in-progress`. Cancelling in-flight runs is the
  right compute-cost behaviour; we instead remove its ability to **pollute the
  required-check surface**.

## Proposal

A four-phase plan, smallest-risk first. Each phase is an independently
reviewable, independently shippable PR.

### Phase 1 — Reclassify transient/cancelled required-check 405 as pending (LS-7989)

`performMerge` already maps the **aggregate** 405 message
(`N of M required status checks are expected | have not succeeded`) to a transient
pending state: log, set `hasPendingPRs`, return, re-queue — no error comment
(LS-4181/LS-4184). GitHub's **single-check** message shape
(`Required status check "X" is cancelled.`) does not match the existing regex, so
it falls through to the hard-fail path.

Widen the transient-405 predicate to also match the single-check shape:

```
Required status check "<name>" is (expected|pending|queued|in_progress|cancelled)
```

When matched, take the same fast path as the aggregate case. All other 405 causes
(e.g. `Pull Request is not mergeable`) continue to propagate as real errors.

This is a band-aid, not a cure — it stops the **misclassification** (scary
"Cannot Merge" on a green PR) and lets the queue self-heal on the next trigger,
but it does not remove the underlying duplicate-name ambiguity. It is shipped
first because it is one-file, fully unit-tested, and immediately relieves the most
visible symptom.

### Phase 2 — Single aggregator `CI Gate` required check (the durable fix)

Replace the eight granular required checks with **one** required check, `CI Gate`,
posted exactly once per head SHA by the existing `summarize` job at the end of the
CI Pipeline. The granular jobs (`lint`, `format`, …) remain as **informational**
check runs; `CI Gate` is computed from their real results and is the only name
branch protection requires.

Why this is the root-cause fix:

- Only **one** required-check name exists, posted **once** per SHA → GitHub's
  evaluator has no duplicate to mis-pick, and a cancelled granular job can never
  poison the gate.
- The gate is posted idempotently for the **current** head SHA only (it carries a
  SHA-currency guard; if head advanced, it no-ops rather than posting a stale
  verdict).
- `bot-review`, `No Merge Conflicts`, and `Verify All Migrations Applied` are
  evaluated and folded into the gate result, so the gate is a faithful rollup.

Migration is staged (see Rollout) to avoid stalling the open-PR fleet.

### Phase 3 — Idempotent base-push conflict re-check

Make the base-push `No Merge Conflicts` sweep reuse the existing check-run id for
`(sha, "No Merge Conflicts")` — or share a concurrency group with the
`synchronize`-triggered run — so at most one terminal run of that name exists per
SHA. Removes the `No Merge Conflicts ×2` duplicates that both GitHub's evaluator
and the dashboard trip over. (Largely subsumed by Phase 2 if `No Merge Conflicts`
is folded into `CI Gate`, but valuable independently and lower-risk.)

### Phase 4 — Align the MCP triage tooling

Port the processor's `validateStatusChecks` logic (filter to required names +
latest-completed-per-name dedup) into `github_pr_dashboard` and
`github_pr_why_blocked` so the human-facing surface reports the same verdict the
queue uses. No merge-behaviour change; eliminates the false-red that drives
distrust.

## Alternatives Considered

### Alternative A: Make the processor "fix" the cancelled checks (re-run them) before merging

Have the queue detect a cancelled required check and dispatch a re-run, then wait.

**Why rejected**: adds latency and API load on every queue pass, races the same
churn that caused the cancellation, and still leaves the dashboard false-red. It
treats the symptom (cancelled run) rather than the cause (multiple required runs
per name). Phase 2 removes the cause outright.

### Alternative B: Disable `cancel-in-progress` so no run is ever cancelled

Let every triggered run finish, so no `cancelled` terminal states are produced.

**Why rejected**: large compute-cost regression (every superseded push runs full
CI to completion) and it does not address the base-push duplicate `No Merge
Conflicts` runs, which are `success`-but-duplicated rather than cancelled. Phase 2
tolerates cancellation safely instead of paying to avoid it.

### Alternative C: Force-push a locally-batched integration branch over `main`

Merge ready PRs into one local branch and push over `main`, bypassing the ruleset.

**Why rejected**: bypasses the code-owner and security gates the ruleset exists to
enforce, breaks per-PR merge-event automation (Jira sync, branch cleanup,
post-merge integration validation), and cannot resolve the conflict/review-blocked
PRs anyway. The legitimate form of "batch and land once" is a rebase merge train
(an explicit non-goal here).

## Risks

| Risk                                                                  | Likelihood | Impact | Mitigation                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 re-queues a _legitimately_ cancelled check that never re-runs | Low        | Low    | Re-queue only changes UX from hard-fail to "pending"; bounded self-retry (one-shot) avoids loops; base-push/push re-triggers CI. Phase 2 removes the case.                                                    |
| Phase 2 ruleset cutover stalls the open-PR fleet                      | Medium     | High   | Staged migration: add `CI Gate` as informational first, verify it posts reliably on every PR, then flip required-set in one `apply-ruleset.sh` run during a quiet window. Documented rollback (re-add the 8). |
| `CI Gate` SHA-currency guard mis-fires and never posts                | Low        | High   | Unit-test the guard; keep the 8 granular checks as informational during bake-in so a missing gate is visible without blocking everything.                                                                     |
| Widened 405 regex over-matches a real failure message                 | Low        | Medium | Anchor on the literal `Required status check ... is <state>` GitHub shape; regression test asserts `Pull Request is not mergeable` still hard-fails.                                                          |
| Phase 4 tooling change diverges from processor logic over time        | Low        | Low    | Extract the shared evaluation into one documented helper referenced by both; cross-link in code comments.                                                                                                     |

## Test Plan

- **Phase 1**: `node:test` cases in
  `.github/scripts/__tests__/merge-queue-processor.test.mjs`:
  - 405 `Required status check "X" is cancelled.` → merge attempted, **no**
    `Merge Queue Processing Error` comment, no throw, `hasPendingPRs` path taken.
  - 405 `Required status check "X" is expected.` → same.
  - Regression: 405 `Pull Request is not mergeable` still posts a Processing Error
    comment (unchanged).
  - Regression: aggregate `N of M required status checks are expected` path
    unchanged.
- **Phase 2**: golden-path test that `CI Gate` posts `success` iff all folded
  inputs pass; SHA-currency guard no-ops when head advanced; dry-run merge-queue
  pass against a `CI Gate`-only ruleset merges a green PR with cancelled granular
  duplicates present.
- **Phase 3**: assert a second base-push sweep updates the existing check-run id
  rather than creating a new one (single terminal run per name per SHA).
- **Phase 4**: tooling unit test feeding duplicate + non-required runs asserts the
  reported verdict matches the processor's.

## Rollout

- **Phase 1**: ship behind no flag — pure error-classification change, reversible
  by revert. Validate via the live merge-queue on the next green PR.
- **Phase 2** (staged, owner-gated because it edits `.github/ruleset.json`):
  1. Land `CI Gate` as an **informational** check (not required). Bake for N days;
     confirm it posts `success`/`failure` correctly on a sample of PRs.
  2. Edit `ruleset.json` to require `CI Gate` **in addition to** the 8 (additive).
     Apply via `scripts/apply-ruleset.sh` (owner action, post-merge). Confirm no
     fleet-wide stall.
  3. Edit `ruleset.json` to require **only** `CI Gate` (+ `bot-review`,
     `No Merge Conflicts`, `Verify All Migrations Applied` as desired). Apply
     during a quiet window.
  - **Rollback**: re-add the 8 granular names to `ruleset.json` and re-run
    `apply-ruleset.sh`. The granular checks remain posted throughout, so rollback
    is immediate.
- **Phase 3 / Phase 4**: independent, low-risk, ship when convenient.

All `.github/`-touching phases require human code-owner approval per the Protect
Main ruleset; bot approval is insufficient.

## Open Questions

- Should `bot-review`, `No Merge Conflicts`, and `Verify All Migrations Applied`
  be folded **into** `CI Gate` (one required check total) or kept as separate
  required checks alongside it? Folding minimises duplicate-name surface but
  concentrates all gating logic in one job; keeping them separate is simpler but
  retains some multi-name surface (these names rarely duplicate, however).
- Does GitHub's evaluator exhibit the same cancelled-latch behaviour for **commit
  statuses** (`bot-review`) as for check runs? If so, Phase 2 should fold
  `bot-review` into the gate too.
- Is a short post-merge "settle" debounce on the queue (skip a pass if `main`
  advanced < N seconds ago) worth adding to reduce churn-induced cancellations,
  or does Phase 2 make it unnecessary?
