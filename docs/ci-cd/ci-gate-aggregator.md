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

  **A not-yet-started candidate does NOT supersede (LS-9754).** The
  orchestrator's `concurrency:` block is workflow-level and, since LS-9754,
  keyed on head SHA — so a candidate blocked on it for the exact same SHA has
  not run a single job and is guaranteed to be behind _this_ run's own
  concurrency slot; it cannot be racing this run. `NOT_YET_STARTED_RUN_STATUSES`
  (`queued`, `pending`, `waiting`, `requested` — the full set GitHub's run
  `status` enum uses for "no job has started") all get this exemption;
  `in_progress` still supersedes as before, since an already-executing
  sibling has genuinely started and may finish and post before this run does.
  Treating a not-yet-started candidate as superseding anyway withholds a
  genuine green verdict for nothing: its own `check-prior-success` guard has
  no posted `CI Gate` to see once it finally starts, so it dispatches a full,
  redundant sequential re-run of the entire pipeline before it can post
  anything itself — trading the parallel-duplicate waste LS-9754's
  concurrency fix eliminates for a sequential-duplicate one.

  > Observed live on PR #7830 (the LS-9754 PR itself), twice: a first fix
  > checked only `status === 'queued'`, but the concurrency-blocked sibling's
  > actual API status was `pending` — a distinct enum value — so it slipped
  > through and reproduced the identical wasteful re-run one run later.
  > Matching the full not-yet-started set, not just `queued`, closed the gap.

  **The run conclusion alone is not enough (LS-9565).** A
  `pull_request_review: approved` run whose `check-prior-success` guard
  short-circuits the pipeline still concludes **`success` at the run level** —
  its scope, secret-scan and Security Gate jobs all pass — while only its
  `🚀 CI Pipeline` **job** is `skipped`. It therefore slipped past the
  conclusion filter, superseded the run that had actually done the work, and
  posted nothing. Guard (A) now probes each candidate's job list
  (`CI_PIPELINE_JOB_NAME`) newest-first and walks past any whose pipeline job
  was skipped, stopping at the first run that will really speak. The probe fails
  **closed**: an unreadable candidate, or more than
  `MAX_SUPERSEDING_RUN_INSPECTIONS` of them, still supersedes.

  > Observed on PR #7212 (`42f31fc`): run `32585173510` ran the full pipeline
  > green and withheld in favour of run `32586165378`, whose `🚀 CI Pipeline`
  > job had concluded `skipped` 55 minutes earlier. Neither posted, and
  > `github_pr_why_blocked` reported `CI_PENDING` with
  > `CI Gate (not yet registered)` as the sole remaining blocker. The manual
  > unblock is a `workflow_dispatch` of `ci-orchestrator.yml` with `pr_number`
  > set — that trigger bypasses the review-gated prior-success guard, so it both
  > runs CI and posts the gate under the highest run id.

  **Nor is "no job yet" always ambiguous (LS-9811).** LS-9565's probe reads
  the candidate's job list once; when the `🚀 CI Pipeline` job is not there
  yet — including a candidate sitting at **zero jobs**, e.g. queued behind
  runner saturation — the probe used to fail closed unconditionally ("assume
  it will post"). For a `pull_request_review`-triggered candidate that is not
  yet `completed`, that assumption is provably wrong: this guard is only ever
  reached after `results` already shows every `GATE_INPUT_JOBS` entry passing
  in the **posting run's own** run, so that run is either still in flight or
  about to post `CI Gate: success` for the exact same SHA. By the time the
  stalled candidate's own `check-prior-success` step runs, it will find
  either the gate already `success` (`allPassed`) or the posting run still
  active under a dispatching event (`siblingDispatching`, LS-9887) — both set
  `ci-already-passed=true` and skip its pipeline job. The candidate is
  therefore guaranteed to end up in the same non-posting state as the
  already-`skipped` case above, so guard (A) now predicts it instead of
  waiting to confirm it. The prediction stays scoped to `event ===
'pull_request_review'` and an incomplete run — a genuinely new
  `pull_request`/`workflow_dispatch` candidate for the SHA (there cannot be a
  newer push for a SHA that has not moved) always intends to run CI and keeps
  failing closed.

  > Observed on PR #7499: run `33598992411` ran the full pipeline green and
  > withheld in favour of run `33599197673` — the `pull_request_review`
  > orchestrator run fired by the Reviewer Bot's approval — which sat
  > `pending` with zero jobs for 20+ minutes. Its own `check-prior-success`
  > step would have short-circuited the moment it ran, so neither run ever
  > posted `CI Gate`, blocking the merge queue for ~25 minutes.

- **(B) newer-failure-posted** — refuse if an existing `CI Gate` failure status on
  the SHA was posted by a newer run (run id parsed from `target_url`). Redundant
  with (A) when the runs listing is complete, but survives pagination and API lag.

Run **ids** are compared rather than timestamps: a run id is assigned once at
creation and is immutable and monotonic across re-run attempts, whereas
re-running a run moves its timestamps and can make an older run look newer.

## A stale failure must not outrank an already-posted success (LS-9754)

The `failure` side of the LS-9378 invariant above — "turning a SHA red is
never unsafe" — held for a genuine re-run of the same logical attempt, but not
for two full pipelines the orchestrator accidentally ran **in parallel** on
the identical head SHA. The concurrency-group fix in `ci-orchestrator.yml`
(keyed on head SHA — see
[ci-and-merge-pipeline.md](../../.agents/skills/workflow-overview/references/ci-and-merge-pipeline.md))
prevents that at the source, but this is the reconciliation half: it must
still hold if a duplicate slips through.

> Observed on PR #7374: two full duplicate runs executed on the same head
> SHA. One hit an isolated E2E flake and posted `failure`; its sibling had
> already posted a clean `success` for the exact same SHA moments earlier.
> Because `failure` posted with no currency check, GitHub's
> last-writer-wins-by-`created_at` commit-status semantics let that stale
> failure keep outranking the already-green verdict for 30+ minutes, blocking
> the merge queue on a result the sibling run had already superseded — the
> same failure mode `get_check_runs`' job listing avoids for free by deduping
> by job name and keeping only the newest run's result per name.

`postCiGate` now runs `assertFailureIsCurrent` before posting a `failure`
verdict: withhold (**newer-success-posted**) if an existing `CI Gate` success
status on the SHA was posted by a run with a **higher** run id. This is
deliberately narrower than the success-side guard — it does **not** do the
expensive newer-run-existence lookup (A) performs, so a genuine failure with
no newer verdict posted _yet_ always goes through immediately. It only ever
withholds on an already-**posted** newer success, preserving the "a real
failure must always eventually become visible" invariant; it fails **open**
(posts the failure) on a missing run id or a status-lookup error, for the
same reason.

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

## Pending seed at PR open (LS-9543)

`CI Gate` is required, but a **required-and-required** status still has a gap:
GitHub's ruleset evaluator treats a context that has **never been posted for
this SHA** the same as one that is `pending` for a non-bypassing merge — both
block. They are not equivalent for a **bypass actor**, though.
`.github/ruleset.json`'s `bypass_actors` grants the repo owner an
unconditional status-check bypass, and when the context is entirely
**absent** that bypass produces a silent, no-warning merge: there is no
outstanding requirement to override in the UI, so nothing distinguishes it
from a PR with no CI configured at all.

PR #7202 landed exactly this way. Its self-hosted runner queue took ~14
minutes to start the first CI job, while the PR's open→merge window was
6m21s — so at merge time `CI Gate` simply did not exist yet for the head SHA.
The owner's merge went through with zero CI signal, and the unformatted
`LeagueStandings.tsx` reached `main` (LS-9531). Every post-merge net (the CI
status comment, the `CI: Lint Failure` label, `merge-when-ready` removal)
fired correctly and was useless — they notify after the fact; they do not
protect.

**Fix:** `seed-ci-gate`, a job in `ci-orchestrator.yml`, posts a `pending`
`CI Gate` commit status on the head SHA the instant a PR is opened,
synchronized, or reopened — via `seedPendingCiGate` in
[`ci-gate.js`](../../.github/scripts/ci-gate.js). It deliberately runs on a
GitHub-hosted runner (`ubuntu-latest`), not the self-hosted CI runner label,
so it is immune to the very runner-queue latency that created the race: it
only needs to beat the PR open→merge window, not the CI pipeline itself. A
missing context becomes a `pending` one before any merge attempt can outrun
CI, so even a bypass-actor merge now requires the explicit "merge without
waiting for requirements" action — a deliberate, visible override — instead
of an ordinary merge indistinguishable from a PR with no outstanding checks.

The seed is idempotent and one-directional: it no-ops if **any** `CI Gate`
status already exists for the SHA (pending, success, or failure), so it can
never regress a terminal verdict back to pending. The real `postCiGate`
verdict from the CI Pipeline's `summarize` job always supersedes it once CI
completes (commit statuses are last-writer-wins by `created_at`). This does
not touch `bypass_actors` — the owner's emergency escape hatch for genuine
incidents is unchanged, only now unusable without a visible, deliberate step.

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

## Shard-level flake tolerance (LS-9727)

`e2e` (desktop chromium) is a `GATE_INPUT_JOBS` member, so a single red shard
turns `CI Gate` red regardless of the PR's own diff. LS-9727 documented
disjoint `expect(locator).toBeVisible()` timeouts across unrelated specs on
two full-pipeline runs of one byte-identical commit — non-determinism, not a
regression (a real regression fails the same test every run).

**Root cause**: the same self-hosted-runner CPU oversubscription LS-9695
root-caused and fixed for the wider "different random `@critical` test fails
each run" pattern — 4 Playwright workers on a 4 vCPU box left zero headroom
for the OS/`vite preview`/browser compositor threads, so a transient
scheduling stall starved whichever assertion happened to be polling at that
moment, in whichever spec that worker happened to be running. LS-9695's fix
(`apps/web-e2e/playwright.config.ts`: `workers` 4→3, `expect.timeout` 3s→5s,
per-test `timeout` 30s→45s) landed after the runs LS-9727 recorded and
resolved the dominant failure mode fleet-wide (desktop and mobile share the
same config). Some residual runner-contention flake is not fully eliminable
on shared infrastructure, which is what the policy below is for.

**Policy decision** (LS-9727, superseding "should a red desktop shard get an
automatic retry"): a bounded **per-test** retry, not a whole-job/whole-shard
re-run, and not a change to `playwright.config.ts`'s own `retries: 0`
default or its "flake is a P1 bug" philosophy for every other caller:

- The desktop chromium `e2e` job (`ci-pipeline.yml`, both the sharded
  `@critical` run and the narrow-change "affected specs" step) passes
  `--retries=1` — one retry, so a test fails the shard only after failing
  **twice**.
- `e2e-mobile` deliberately keeps `retries: 0`. LS-9712's maintainer ruling
  found every one of its failures to be a real spec/config gap (desktop-only
  assertions running at a mobile viewport for the first time), not
  environment flake — retrying there would mask exactly the class of bug
  that job exists to catch.
- A test that needed the retry is reported as **flaky**, never silently
  dropped: `.github/actions/e2e-testing/action.yml` computes pass/fail off
  each test's _final_ attempt (so a flaky test isn't double-counted) and
  separately surfaces every flaky test's title in the job summary. A single
  flaky occurrence is tolerated; the same test recurring across runs is a
  real problem and should get its own ticket (the LS-9733-style pattern) —
  the summary output is what makes that recurrence visible instead of
  disappearing into a green checkmark.
- This does not change `GATE_INPUT_JOBS` or `CI Gate`'s pass semantics
  (`success`/`skipped` pass, `failure`/`timed_out` fail) — a shard failing
  twice on the same test still fails `e2e` and still turns the gate red.

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
