# 0014. Integration regression detection via nightly + merge bisection, not per-merge validation

Date: 2026-06-10

## Status

Accepted

Rejects the per-merge half of Phase 2 in
[integration-safety-system.md](../ci-cd/integration-safety-system.md)
(per-merge affected integration); the stop-the-line half of Phase 2 is
unaffected. Decided via LS-7880 (closed Won't Do); documented by LS-7884.

## Context

The live-backend integration suite (`apps/web-e2e/src/integration/tests/`,
~22 specs, serial, hitting `api.legacy-fantasy.com`) is too slow and expensive
to run on every PR. PR-time validation is therefore **opt-in**: the
`run:integration` label runs the affected subset (selected via
`integration-surface-map.json`) and posts an `<integration-results>` comment
the reviewer bot requires for integration-touching PRs.

That opt-in run is attached to the **PR branch**. When the PR merges (merge
queue squash + branch deletion), an in-flight `run:integration` run is
**orphaned** — it is cancelled or its result is never consumed. This happened
with **LS-7876 ([PR #5023](https://github.com/bkrupa/legacy-sports/pull/5023))**:
the PR merged while its integration run was still in flight, so part of the fix
landed on `main` without its integration validation ever completing.

LS-7880 proposed closing this gap. Options considered:

1. **Run the affected integration subset on `main` after every merge**
   (the "per-merge attribution" half of the integration-safety Phase 2 design).
   Gives automatic blame attribution, but adds a live-backend run per merge —
   on a busy day that is dozens of serial, multi-minute runs against shared
   live infrastructure (which also enforces a 3-concurrent-league limit and
   shared per-spec identities, so concurrent runs collide).
2. **Gate the merge queue on integration completion** — block merge until any
   in-flight `run:integration` run finishes. Removes orphaning entirely, but
   couples merge latency to the slowest live-backend spec and exposes the
   shared merge gate to live-backend flake and outages.
3. **Accept the gap; rely on the nightly** full Playwright run on `main` as
   the backstop, and bisect the day's merges when it fails.

Forces in tension: CI cost is the dominant lever (the live suite is the most
expensive signal we have), integration breadth/runtime reduction is tracked
separately (LS-4937 / LS-7848), and the regression window a nightly leaves
(~24h) has historically been tolerable because nightly failures are actively
triaged.

## Decision

We will **not** run per-merge integration validation and will **not** gate the
merge queue on integration runs. LS-7880 is rejected (Won't Do).

Instead:

- **The nightly full Playwright run is the backstop.** It runs the complete
  integration suite against `main` roughly once per day
  (`run-playwright-tests.yml`; see the 2026-07-18 amendment below — originally
  a 03:00 UTC cron, now a debounced post-deploy `workflow_run`) and catches
  any integration regression that merged that day.
- **On a nightly integration failure, bisect the day's merges** to attribute
  the regression (runbook below).
- **Agent guidance:** when a `run:integration` result matters to a merge
  decision, confirm the run **completed** before merging, or re-validate on
  `main` afterward (dispatch `run-playwright-tests.yml` against `main` for the
  affected specs). Do not treat an in-flight run as a green signal.

### Cost rationale

Per-merge validation multiplies the most expensive signal in the system by the
merge rate. The nightly amortizes that same signal to once per day at full
breadth. The risk it trades away — up to ~24h of undetected regression on
`main` — is bounded, observable, and cheaply attributable via bisection,
whereas per-merge cost grows with team throughput and contends for the shared
live backend. The real lever for shrinking the residual risk is making the
suite cheaper (integration breadth/runtime work under LS-4937 / LS-7848), not
running the expensive suite more often.

### Bisect runbook

When a nightly integration run fails on `main`:

1. Find the last green nightly's commit SHA (`ci_list_runs` on
   `run-playwright-tests.yml`, or the run list in the Actions UI) and the
   failing run's SHA.
2. List the merges between them:

   ```bash
   git log --first-parent --oneline <last-green-sha>..<failing-sha>
   ```

   Merge-queue squash commits map **1:1 to PRs** (the PR number is in the
   subject), so each commit is one candidate.

3. Narrow by surface: match the failing specs' globs in
   `apps/web-e2e/src/integration/integration-surface-map.json` against each
   candidate commit's changed files — usually one or two commits touch the
   implicated surface.
4. Confirm by running the failing spec(s) locally against the candidate
   commit (or dispatch `run-playwright-tests.yml` on `main` at that SHA), then
   file/fix per the CI-flake or bug entrypoint as appropriate.

## Consequences

### Easier

- Merge throughput stays decoupled from live-backend runtime, flake, and
  outages; no new CI spend per merge.
- The merge queue keeps its current required-check set; no shared-gate
  exposure to the live backend.

### Harder

- A regression can live on `main` for up to ~24h before the nightly flags it
  (accepted residual risk).
- An in-flight `run:integration` PR run can still be orphaned by
  merge/branch-deletion — accepted by design; the LS-7876/#5023 incident is
  the canonical example. Mitigation is procedural (confirm completion before
  merging when the result matters), not mechanical.
- Attribution is manual (the bisect runbook) instead of automatic.

### Now constrained

- Future proposals to re-add per-merge integration validation or
  integration-gated merging should not be re-litigated without new evidence
  that the cost balance changed (e.g. the suite becomes dramatically cheaper
  via LS-4937 / LS-7848 — revisiting is explicitly reasonable then).
- The per-merge half of integration-safety Phase 2 is rejected; stop-the-line
  automation on nightly failure remains open design space.

## Amendment (2026-07-18): trigger changed from cron to debounced post-deploy

The repo adopted a schedule-free CI policy (no `schedule:` triggers in any
workflow). The nightly's `0 3 * * *` cron was replaced with a `workflow_run`
trigger on Deploy completing on `main`, debounced by a `gate` job in
`run-playwright-tests.yml` to at most one full-suite attempt per
`FULL_SUITE_MIN_INTERVAL_HOURS` (repo var, default 20h), with a concurrency
group serializing automated runs so two full suites never hit the live
backend concurrently.

**The decision above is unchanged** — this is still once-a-day amortization,
not per-merge validation. The economics are identical on active days (bursts
of merges collapse into one run), strictly cheaper on idle days (no merges →
no run → nothing new to regress), and the ~24h regression window is
preserved. The term "nightly" is retained throughout the docs and tooling to
mean this automated full-suite run.
