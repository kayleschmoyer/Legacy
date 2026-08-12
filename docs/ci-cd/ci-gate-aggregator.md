# CI Gate aggregator (LS-7991, Phase 2 of LS-7988)

## Why

Branch protection historically required the **5 granular** `🚀 CI Pipeline /
{lint,format,build,test,custom-checks}` check **runs** (plus `e2e-affected`)
directly. Because the granular CI jobs _are_ the required names, `concurrency:
cancel-in-progress` and base-push re-triggers leave **multiple terminal runs of
one required name** on a single head SHA — including `cancelled` ones. GitHub's
merge-API ruleset evaluator can latch onto a stale/cancelled duplicate and
return `405 Repository rule violations found — Required status check "X" is
cancelled`, blocking a **genuinely-green** PR. The merge-queue processor dedups
this away locally (`validateStatusChecks` keeps the latest run per name), but it
cannot fix GitHub's server-side gate. Duplicate-required-name ambiguity is the
root cause (see LS-7988 RCA).

## Fix

Introduce ONE aggregator, **`CI Gate`**, posted exactly once per head SHA by the
CI Pipeline `summarize` job, folding the real results of the granular jobs
(`lint, test, build, custom-checks, lockfile-check, e2e`). The granular
jobs remain as **informational** check runs.

> **LS-8901 update:** the standalone `format` job was merged into `lint` (one
> checkout + `pnpm install` instead of two) — the format check now runs as a
> second step inside the `lint` job rather than as its own granular job/gate
> input. See `GATE_INPUT_JOBS` in `.github/scripts/ci-gate.js`.

`CI Gate` is a **commit status** (like `bot-review`), not a check run, on
purpose:

- GitHub evaluates the **latest status per context** (by `created_at`) — there
  is no "cancelled" status state, so a duplicate cannot poison the gate.
- A `summarize` job killed mid-run posts **nothing** (the job is `always() &&
!cancelled()`), rather than leaving a terminal `cancelled` row.

Computation and the SHA-currency guard live in
[`.github/scripts/ci-gate.js`](../../.github/scripts/ci-gate.js) (unit-tested in
`.github/scripts/__tests__/ci-gate.test.mjs`). The **SHA-currency guard**
re-reads the PR's live head and **no-ops** (posts nothing) if the head advanced
past the SHA this run evaluated, so a slow stale run never posts a verdict.

`CI Gate` folds the same job set as `overall-status`
([`collect-results`](../../.github/actions/collect-results/action.yml)):
`success`/`skipped` pass; `failure`/`timed_out`/missing fail. One deliberate
divergence (LS-8219): **`cancelled` is excluded from the gate verdict** — a
cancelled granular job is a superseded/duplicate run (concurrency-cancel,
post-merge SIGINT), and folding it as failure let a cancelled post-merge
duplicate latch a fresh red `CI Gate` onto a SHA whose gating run was already
green. `collect-results` still treats cancelled as failure for the in-run
`overall-status`; see `GATE_INPUT_JOBS` and `isCancelled` in
[`ci-gate.js`](../../.github/scripts/ci-gate.js).

## Verdict recency (LS-9378)

Latest-status-wins is what makes a commit status immune to cancelled duplicates
(above) — but it cuts both ways. `results` reflects only the **posting run's**
view of the pipeline, so **re-running an older run replays its stale verdict over
a newer one**. The SHA-currency guard does not catch this: it only checks that
the PR _head SHA_ has not advanced, and in this failure mode the SHA never moves
— only the verdict does.

This landed a red PR. On PR #7006 (head `735d003`):

| Run                   | Verdict                                     | Posted           |
| --------------------- | ------------------------------------------- | ---------------- |
| `31462018381` (newer) | `failure` — E2E Shard 3/3                   | 2026-08-11 05:51 |
| `31458492265` (older) | `success` — re-run ~35h later, overwrote it | 2026-08-12 16:46 |

The older run's `Restore Merge Label on Success` job also re-applied
`merge-when-ready`; the merge followed 17 minutes later.

**The invariant now enforced by `assertSuccessIsCurrent`:**

> A `failure` verdict may **always** be posted — turning a SHA red is never
> unsafe. A `success` verdict must **prove it is the newest word on the SHA**.

Two checks gate the success path, both **fail-closed** (when recency cannot be
established, success is withheld — and a missing `CI Gate` blocks the merge on
its own, so withholding is the safe direction):

- **(A) superseded-run** — refuse if any CI run for the SHA has a run id greater
  than this run's **and will actually post a verdict**. Runs concluding
  `skipped`/`cancelled`/`neutral` never reach the summarize post step and are
  ignored: the orchestrator emits an extra scoped-out run per `pull_request`
  label event (`bot:ready-for-review`, the `CI:` result labels), which can carry
  a higher run id than the real gating run, and counting it would make the real
  run withhold while the label run posts nothing — stranding the SHA with **no**
  gate at all. An in-flight run (`conclusion: null`) does supersede; it has not
  finished and is still expected to post.
- **(B) newer-failure-posted** — refuse if an existing `CI Gate` failure status on
  the SHA was posted by a newer run (run id parsed from `target_url`). Redundant
  with (A) when the runs listing is complete, but survives pagination and API lag.

Run **ids** are compared rather than timestamps: a run id is assigned once at
creation and is immutable and monotonic across re-run attempts, whereas
re-running a run moves its timestamps and can make an older run look newer.

## Consumers must read `CI Gate`, not run conclusions

Anything gating on "did CI pass" must read this status, not workflow-run
conclusions — otherwise it disagrees with the merge gate by construction. Run
conclusions are the noisy signal `CI Gate` exists to replace: a run whose only
cancelled job is non-gating (e.g. `Deploy Playwright Report` under
concurrency-cancel) concludes `cancelled` even though every gate input passed.

`verify-ci` in
[`upload-lambdas.yml`](../../.github/workflows/upload-lambdas.yml) reads the gate
on the resolved PR head SHA (LS-9378), falling back to run conclusions only when
no gate status exists — expected solely for commits with no associated PR, since
the gate is PR-scoped.

## Staged ruleset migration (owner-gated)

`.github/ruleset.json` only takes effect when **@bkrupa** runs
`bash scripts/apply-ruleset.sh`. Each apply is the cutover for that stage.

1. **Land `CI Gate` as informational** — the `summarize` job posts it; it is
   **not yet enforced**. Bake across a sample of PRs and confirm it posts
   `success`/`failure` correctly. _(Done in LS-7991: the posting code.)_
2. **Additive** — `CI Gate` is added to `ruleset.json`'s `required_status_checks`
   **alongside** the granular names (already in the file, ahead-of-live, marked
   `_commitStatus: true`). The owner runs `apply-ruleset.sh` once baking looks
   clean. Until then, `check-ruleset.yml` (a non-required drift check) reports
   drift — **expected**, mirroring the `e2e-affected` precedent. _(Prepared in
   LS-7991.)_
3. **Cutover (LS-8014)** — the required set is reduced in `.github/ruleset.json`
   to `CI Gate` + `bot-review` + `No Merge Conflicts` + `Verify All Migrations
Applied` (the 6 granular `🚀 CI Pipeline / {lint,format,build,test,custom-checks,e2e-affected}`
   names removed; e2e merge-gate semantics from LS-7846 now fold into `CI Gate`).
   The owner runs `bash scripts/apply-ruleset.sh` during a quiet window to push
   the reduced set live — this PR merging only updates the checked-in config; it
   does not change the live ruleset. Until the apply runs, `check-ruleset.yml`
   (non-required drift check) reports drift — expected.

## Rollback

If `CI Gate` misbehaves after a stage is applied:

1. Edit `.github/ruleset.json` to restore the previous required set — re-add the
   5 granular `🚀 CI Pipeline / {lint,format,build,test,custom-checks}` contexts
   (and `e2e-affected`) and, for a full rollback, remove the `CI Gate` entry.
2. Re-run `bash scripts/apply-ruleset.sh` to push the restored set live.
3. Nudge any stuck PRs with the `ci:run` label to bust GitHub's cached
   per-commit merge verdict.

The `summarize` job posting `CI Gate` is harmless while it is not required, so
the posting code does not need to be reverted as part of a ruleset rollback.
