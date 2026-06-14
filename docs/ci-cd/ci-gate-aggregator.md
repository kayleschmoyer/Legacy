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
(`lint, format, test, build, custom-checks, lockfile-check, e2e`). The granular
jobs remain as **informational** check runs.

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

`CI Gate` success ≡ the existing `overall-status` (same folded set + pass
semantics as [`collect-results`](../../.github/actions/collect-results/action.yml)):
`success`/`skipped` pass; `failure`/`cancelled`/`timed_out`/missing fail.

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
