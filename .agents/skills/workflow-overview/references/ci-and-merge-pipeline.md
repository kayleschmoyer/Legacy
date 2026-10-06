# Reference: CI & Merge Pipeline (environment-neutral)

What happens after a PR is **marked ready** — the GitHub/CI machinery that is identical whether the PR was authored from a local or a cloud session. Both [workflow-overview](../SKILL.md) and [cloud-agent-mode](../../cloud-agent-mode/SKILL.md) link here rather than restating this. For the ordering that _gets_ you to a ready PR, see [ticket-to-merge-spine.md](./ticket-to-merge-spine.md).

## CI Pipeline (Phase 3)

### Orchestrator Flow (`ci-orchestrator.yml`)

The orchestrator is the entry point for all PR CI. It dispatches reusable workflows:

```
pull_request_review (any APPROVED) | pull_request (opened/sync/reopened) | merge_group | workflow_dispatch
        |                                                                                       ↑
  determine-scope                                                             ci-run-label.yml (ci:run label)
    |            |
ci-pipeline   security-scanning (conditional)
    |
  label-pr (security failure)
  remove-merge-label-on-failure (ci failure)
  restore-merge-label-on-success (ci success)
  report-runner-shutdown (ci-pipeline cancelled or failure)
```

**Triggers:**

- `pull_request` opened/synchronize/reopened — CI runs on every push so check runs land in a push-event check suite recognised by branch protection (LS-7707)
- `pull_request_review` submitted — any APPROVED review; the `check-prior-success` idempotency guard skips re-running CI when the head SHA is already green or CI is already in flight (LS-4182/LS-7736). It reads the required contexts from `.github/ruleset.json` (config), evaluating check-run contexts against the Checks API and `_commitStatus` contexts (`bot-review`, `CI Gate`) against the latest commit status per context; on any read error it fail-safes to re-running CI. Before evaluating, it re-fetches the PR's live head via `github.rest.pulls.get` and prefers that over the (possibly stale) event-payload SHA, so a push/approval race can't make an older run's in-flight checks look like evidence for the current head — mirroring the SHA-currency guard `ci-gate.js` uses when posting `CI Gate` (LS-8682)
- `workflow_dispatch` — two paths: (1) direct manual dispatch with configurable `security-scan-type` input; (2) triggered by `ci-run-label.yml` when the `ci:run` label is added — that workflow removes the label then dispatches the orchestrator. Keeping `labeled` out of the orchestrator's trigger list prevents non-`ci:run` label events from occupying the concurrency group and displacing queued `synchronize` runs (LS-7752). Both paths carry no `pull_request` event context by default; pass the optional `pr_number` input (the `ci:run` label path does this automatically) so `determine-scope` resolves that PR's base/head SHA via the API and threads it into `ci-pipeline.yml` — otherwise lint/format falls back to a whole-repo Prettier check and `CI Gate` cannot post (LS-9148). The `check-prior-success` guard above also runs on `workflow_dispatch` (LS-9580) — a `ci:run` dispatch applied to a PR whose `pull_request`-triggered run is already queued, in flight, or already green resolves PR number/head SHA from the `resolve-pr-context` step's outputs and no-ops instead of racing a redundant full pipeline; without a resolvable `pr_number` there is nothing to de-duplicate against and CI always runs (fail-safe)
- `merge_group` — always runs CI + security

**Seed job (`seed-ci-gate`, LS-9543):** runs on `ubuntu-latest` (never the self-hosted runner label) on `pull_request` opened/synchronize/reopened, ahead of `determine-scope`, and posts a `pending` `CI Gate` commit status on the head SHA via `seedPendingCiGate` (`.github/scripts/ci-gate.js`). Closes the window where the required `CI Gate` context is entirely **absent** (not merely pending) at merge time — PR #7202 squash-merged with zero CI signal because the self-hosted runner queue (~14 min to first job) was slower than the PR's open→merge window (6m21s), and the owner's `bypass_actors` status-check bypass then merged silently since there was no outstanding requirement to override. Deliberately fast (GitHub-hosted) so it wins that race regardless of self-hosted backlog. Idempotent: no-ops if any `CI Gate` status already exists for the SHA, so it can never regress a terminal verdict back to pending — the real `postCiGate` verdict from `summarize` always supersedes it. See [ci-gate-aggregator.md](../../../../docs/ci-cd/ci-gate-aggregator.md#pending-seed-at-pr-open-ls-9543). **Its checkout is a single-file `sparse-checkout` of `.github/scripts/ci-gate.js`** — which makes that file's require graph part of this job's contract: a new top-level `require('./x.js')` in ci-gate.js loads fine under the unit tests (full checkout) and throws `MODULE_NOT_FOUND` here, turning the seed job red (observed on PR #8000 when ci-gate.js started requiring `runner-cancellation.js`). Every such dependency must be added to the sparse-checkout list; a unit test in `.github/scripts/__tests__/ci-orchestrator-workflow.test.mjs` asserts the list covers them (LS-10140).

**Post-pipeline jobs** (run on `${{ needs.determine-scope.outputs.runner-label || 'ubuntu-latest' }}` — self-hosted when available, otherwise `ubuntu-latest` — **except** `report-runner-shutdown`, pinned unconditionally to `ubuntu-latest`, see below):

- `label-pr` — applies `CI: Security` label on security failures (and removes it once security passes). The removal treats a 404 as "already removed" (LS-10542): an overlapping run on the same PR can strip the label between the `pulls.get` read and the `removeLabel` call.
- `remove-merge-label-on-failure` — removes `merge-when-ready` when CI fails. Same 404 race as `label-pr` (LS-10542); on a 404 it exits without posting the failure comment, since the run that removed the label already did.
- `restore-merge-label-on-success` — restores `merge-when-ready` when CI passes and bot approval is still active
- `report-runner-shutdown` — the job fires when `ci-pipeline`'s overall result is `cancelled` **or** `failure` (LS-9334: a mid-job runner death cancels only the killed job, but downstream jobs that depend on it — and therefore the reusable `ci-pipeline.yml` call's own aggregate conclusion — surface as `failure`, not `cancelled`; the job's gate was widened to match, after a real shutdown on PR #6935 skipped the job entirely under the old `cancelled`-only gate). Detection of _which sub-job_ triggered that is delegated to the shared `./.github/actions/detect-runner-shutdown` composite action (LS-9451), which scans this run's failed **or** cancelled job logs for `"runner has received a shutdown signal"` (previously an inline copy that only scanned cancelled jobs with a `runner_name` set — the widening to `failure`-conclusion jobs is intentional, see the job's header comment in `ci-orchestrator.yml`). If confirmed, the job applies the `CI: Runner Flake` label and posts a PR comment with a re-run link — that behavior stays in `ci-orchestrator.yml` since `ci_retry_runner_flake` parses both the label and the comment signature, and (LS-9334) falls back to scanning the run's own job logs directly for the same signature when both the label and comment are absent. The label is cleared at the start of the next CI run by a step in `determine-scope`. **Since LS-10140 this detection is no longer advisory-only:** `remove-merge-label-on-failure` runs the same composite action and skips the `merge-when-ready` strip when the cancellation is an attributed runner shutdown (every other cancellation, and every genuine failure, still strips it), and `ci-gate.js` applies the same `runner-cancellation.js` rules before posting the gate. Previously detection ran after, and independently of, both — so the PR comment said "not caused by your code" while the gate went red and the label came off a green diff. That job is pinned to `ubuntu-latest` for the same LS-9710 reason as this one. The gate's side of it is in [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md#ci-gate). **`runs-on` is pinned to `ubuntu-latest` (LS-9710)** — not the self-hosted-when-available fallback the other post-pipeline jobs use — because this job's whole purpose is reporting that the self-hosted pool just shut down; resolving it back onto that same (possibly empty) pool left the job queued forever on PR #7328, holding the `orchestrator-{PR#}` concurrency slot open indefinitely and blocking `CI Gate` from ever registering for later pushes. `timeout-minutes` doesn't help here since GitHub Actions only starts that clock once a runner picks the job up — a job stuck in the scheduler queue never gets timed out. Distinct from LS-9053/LS-9810 above: those are about a _queued_ run being displaced before it starts; this is about an _active_ run's own concurrency slot never being released because one of its jobs can't be scheduled at all.

**Concurrency (LS-9754):** `orchestrator-{head SHA}` with `cancel-in-progress: false` — the group key is the resolved head SHA (`github.event.pull_request.head.sha`, falling back to `github.sha` for `workflow_dispatch`), not the PR number or a per-run id. This gives two properties at once: a new push always gets a brand-new group (new SHA ⇒ new group string), so it can never be displaced by — or displace — an event for a _different_ SHA; and a second trigger on the _same_ SHA (an approval landing mid-run, the `label-pr` job's own relabel, a redundant `ci:run` dispatch) queues behind the in-flight run instead of spawning a full parallel duplicate pipeline — observed 5+ times on identical head SHAs on PR #7374, each one re-running the entire build/lint/test/6-shard-E2E/security pipeline. `cancel-in-progress: false` does **not** protect the _queued_ run: GitHub keeps at most one pending run per group, and a newer same-SHA event cancels the queued run and takes its place — harmless here since `check-prior-success` (below) finds CI already green by the time such a queued run finally executes. This design supersedes the pre-LS-9754 `orchestrator-{PR#}` key (which caused the cross-SHA displacement bug below) and its `orchestrator-review-{run_id}`/`orchestrator-noop-{run_id}` per-run workaround for `pull_request_review` events (LS-9810) — those events now naturally share the real push run's SHA-keyed group instead of needing immunity from it. Historical cross-SHA displacement bug this key also still prevents: non-approved `pull_request_review` events (bot comment reviews, JUSTIFY replies) displacing a queued synchronize run for a _different_, older SHA and then skipping all jobs themselves, leaving that head SHA with no CI and the merge queue stuck at `CI Gate (not yet registered)` (LS-9053, PR #6711) — impossible now since different SHAs never share a group. The merge-queue processor's `remediateCancelledCiRun` self-heal remains as a backstop: it re-runs the latest cancelled `pull_request`-event orchestrator run when required checks never registered and no orchestrator run is active for the head SHA.

### CI Pipeline Stages (`ci-pipeline.yml`)

```
detect-changes (~30s, incl. affected-e2e spec selection)
       |
  +----+----+----+----+----+
  |    |    |    |    |
lint  test build custom- lockfile-   (5 granular jobs, PARALLEL)
      (+format)         checks  check
  +----+----+----+----+----+
       |
  +----+----+
  |         |
 e2e     e2e-mobile     (e2e: sharded chromium matrix; e2e-mobile: Mobile
  |         |            Chrome re-run of the same selection — full sharded
  |         |            suite on run-all, one affected-spec shard on a
  |         |            narrow change, skipped when nothing maps; LS-10332)
  +----+----+
       |
   summarize          (always() && !cancelled() — PR comment, labels,
                       posts the `CI Gate` commit status)
```

When invoked via `workflow_call` from the orchestrator's `🚀 CI Pipeline` job, each job posts a check run named `🚀 CI Pipeline / <job-id>` — **informational** since the LS-8014 cutover; the merge gate reads the aggregate `CI Gate` commit status instead (see [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md)).

**Stage 1 -- Detect Changes:** `dorny/paths-filter` + git to determine which surfaces changed (web, mobile, lambdas, terraform, e2e), plus hermetic affected-e2e spec selection (LS-7846) via `apps/web-e2e/src/e2e-surface-map.json` — emits the specs/grep/shard-matrix the e2e job consumes. A second, observe-only step (LS-9661 shadow mode) derives a graph-based surface map (`.github/scripts/e2e-graph/derive-surface-map.mjs`), runs the same selector over it, and logs the diff (`E2E-SELECT-SHADOW` line + job-summary table); it never affects the live selection — the flip to the derived map is LS-9689.

**Stage 2 -- Five granular jobs, in parallel:**

- `lint` — `nx affected -t lint`, then a Prettier format check over the PR's changed files as a second step (LS-8901: the former standalone `format` job was merged into `lint` to save a runner spin-up + `pnpm install` per PR push; the job exposes separate `lint-failure-excerpt` / `format-failure-excerpt` outputs so failure reporting/labels still distinguish the two)
- `test` — `nx affected -t typecheck test` (with `NODE_OPTIONS=--max_old_space_size=2048` — lower than the 4096 MB global default to prevent OOM when a lockfile change marks all projects affected)
- `build` — web/mobile/lambda builds + terraform validate as flagged by detect-changes; uploads the web artifact for e2e
- `custom-checks` — agent-skill lint, migration immutability, workflow validation (schema + working-directory + yamllint; the job installs a pinned yamllint via uv, and a missing yamllint fails the check under `CI` rather than silently skipping — LS-10104), touch-map freshness (advisory), repo-script unit suites (`scripts/` and `.github/scripts/`)
- `lockfile-check` — `pnpm-lock.yaml` drift

**Runner placement (LS-10312):** the Stage 2/3 jobs use the self-hosted-when-available fallback (`inputs.runner-label || vars.CI_RUNNER_LABEL || 'ubuntu-latest'`), but `summarize` is pinned to `ubuntu-latest`. That pool is EC2 spot capacity, and a reclaimed `summarize` never posts the verdict, leaving `CI Gate` at the seeded pending status forever. It also held the orchestrator's `report-runner-shutdown` (which `needs` this workflow) queued behind the dying pool (LS-10306). Guarded by `.github/scripts/__tests__/bookkeeping-runner-placement.test.mjs`.

Every one of these jobs (and `summarize`) skips when the PR carries the `skip-ci` label — a footgun once `CI Gate` is required; see [the skip-ci footgun](../../pr-lifecycle/references/ci-checks-reference.md#the-skip-ci-footgun-pr-stuck-at-expected).

**Stage 3 -- E2E Tests:** Playwright, sharded matrix from detect-changes. `e2e` and `e2e-mobile` both run with `strategy.fail-fast: true` (LS-1119): a shard that genuinely fails cancels its siblings instead of letting them run to their full timeout (45 minutes; 20 for the narrow single-shard `e2e-mobile` path). This is safe with the gate's cancellation classification — GitHub's matrix rollup gives the failing shard's `failure` precedence over a cancelled sibling, and `runner-cancellation.js`/`ci-gate.js` already promote a shard with a real failing step to `failure` even if its own job conclusion rolls up to `cancelled` (LS-9467). A fail-fast-cancelled sibling classifies as `deliberate-cancel` (pending, not failure) same as any other cancellation.

- PRs: `@critical` (excluding `@slow`) **plus** the affected specs mapped from changed files; a broad-surface change escalates to the full hermetic suite, sharded. A "narrow" selection of **≥100 spec files also promotes to the full-suite sharded run** (LS-9449): an over-selected narrow run would put the whole list on ONE shard against the 30-minute job timeout (plus a full mobile re-run against 20 minutes) — 203 files ran 26–31 min and got timeout-cancelled on three consecutive runs before this guard existed. Promotion puts Mobile Chrome on the same full-suite sharded path, same as any broad change.
- Downloads the web build artifact from the `build` job
- Uploads blob reports for the merged Playwright report
- **`e2e-mobile` (LS-9411):** re-runs the _same_ selection (same `e2e-grep`/`e2e-affected-specs` outputs, no second selection computed) a second time on the Mobile Chrome project (375×667 device-emulated viewport), so a viewport-gated regression (`useMedia()`/breakpoint branches invisible at chromium's fixed 1280×720) can't merge silently. Two shapes (LS-10332, maintainer decision 2026-10-01 — see [mobile-e2e-pr-scope.md](../../../../docs/ci-cd/mobile-e2e-pr-scope.md)): on a **run-all** selection it runs the full hermetic suite on the chromium job's 3-shard matrix (45-minute budget) — it is never skipped on run-all, which is the inverted gate LS-9658 removed; on a **narrow** selection with affected specs it runs one shard (20-minute budget) of `@critical` plus the affected specs. A narrow change that maps to no affected specs, and a no-op PR, skip the job (`skipped` passes the gate). The mobile regression affected-selection misses is caught by the nightly's full Mobile Chrome suite (`run-playwright-tests.yml`). Mobile Safari stays nightly-only over `@critical` (own flake history, LS-9328/LS-9409).
- The `e2e-affected` job folds both `e2e` and `e2e-mobile` results into one informational check run. A `cancelled` shard result (concurrency-group race between two orchestrator runs on the same head SHA, PR #7585) is not treated as a failure outright: before failing, it checks the SHA's live check runs for a sibling run's `success` on the same shard context and passes if found (`.github/scripts/e2e-affected-gate.js`, unit-tested, LS-9889 — mirrors the CI Gate aggregate's same-SHA-currency reasoning, LS-9579).

**Stage 3b -- Deploy Playwright Report:** Merges shard reports and deploys to GitHub Pages (`bkrupa/legacy-sports-deploys`). The merge step emits both `index.html` (browsable SPA) and `summary.md` (compact agent-targeted Markdown, ~20–50× smaller). Both are copied to `playwright-report/<name>/` — agents should fetch `summary.md` first via `ci_get_playwright_report` (one GET, no zip inflation); the HTML SPA is the human-readable fallback. See [read-playwright-report skill](../../read-playwright-report/SKILL.md). The same merge step also emits `e2e-ledger.json`, which a fail-open follow-up step (`build-ledger-records.mjs --manifest apps/web-e2e/src/e2e-surface-map.json`) turns into per-spec NDJSON records in S3 — see [E2E ledger](../../testing/references/e2e-ledger.md). All three reporter outputs land next to `playwright.merge.config.js` (workspace root) because the reporter resolves against Playwright's injected `configDir`; `config.rootDir` is the merge config's `testDir`, which is why the ledger silently never reached S3 before LS-10337.

### Manual Playwright Dispatch (`run-playwright-tests.yml`)

Separate from the CI Orchestrator. Triggered via `workflow_dispatch` or the nightly schedule (03:00 UTC). Key inputs:

| Input         | Default         | Notes                                                                                                                                                                                                                                                                              |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-suite`  | `e2e`           | `e2e`, `integration`, or `all`                                                                                                                                                                                                                                                     |
| `test-file`   | _(empty = all)_ | Space-separated filenames relative to testDir (e.g. `"file1.spec.ts file2.spec.ts"`). Each name is a separate Playwright positional arg. Also applies to `test-suite=integration` (LS-7883) — bypasses `shard-partition.ts` and forces a single shard regardless of `shard-total`. |
| `test-grep`   | `(all)`         | Playwright `--grep` pattern; pipe-separated for OR (e.g. `"roster-management\|trade-flow"`). Use instead of `test-file` for tag or partial-name filtering.                                                                                                                         |
| `shard-total` | `2`             | Number of parallel shards                                                                                                                                                                                                                                                          |

Reports are published to `playwright-report/manual-<run_number>/` on GitHub Pages — both `index.html` and `summary.md` (LS-7838). Always verify `stats.total > 0` after reading a report — Playwright exits 0 with `ok: true` even when 0 tests run, so a green CI run does not guarantee tests executed. See [read-playwright-report skill](../../read-playwright-report/SKILL.md).

**Stage 4 -- Summarize & Report:** Always runs (unless cancelled or `skip-ci`).

- Collects results from all stages
- **Posts the `CI Gate` aggregate commit status** for the PR head SHA (`.github/scripts/ci-gate.js`) — the required CI context post-LS-8014; folded-job list, pass semantics, and the cancellation rules (LS-8219's never-red exclusion, plus LS-10140's third `no-verdict` verdict that posts `pending` rather than laundering a never-run job into green) live in [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md#ci-gate). The post waits out an installation rate-limit window before its final retry, and if the post still fails the job fails ("Fail when CI Gate verdict was lost", LS-10322) rather than reporting green over a stuck `pending`
  - **Verdict recency (LS-9378):** a `failure` verdict is always posted, but a `success` verdict is withheld unless this run proves it is the newest run for the SHA — otherwise re-running an **older** run replays its stale green over a newer red (this landed a red PR, #7006). Guards fail closed. Anything gating on "did CI pass" — including `verify-ci` in `upload-lambdas.yml` — must read this status, never workflow-run conclusions. See [ci-gate-aggregator.md](../../../../docs/ci-cd/ci-gate-aggregator.md#verdict-recency-ls-9378).
- Posts PR comment with status table
- Labels PR with failure reasons
- Discord notification on main branch failures

### Parallel Checks (Separate Workflows)

These run independently from the orchestrator, triggered directly by PR events. PR-triggered workflows use a `check-runner-access` pre-job (Pattern A, LS-1652) that resolves the runner label — external contributors always get `ubuntu-latest`; internal team members get the self-hosted runner. `security-scanning.yml` is the exception: it is dispatched by the orchestrator via `workflow_call` and receives the already-resolved `runner-label` as an input rather than running its own pre-job.

| Workflow                       | Trigger                          | Runner resolution                  | Purpose                                                                                             |
| ------------------------------ | -------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `check-schema.yml`             | PR (GraphQL file changes)        | `check-runner-access` pre-job      | Schema drift detection + codegen compatibility                                                      |
| `check-migrations-applied.yml` | PR (migration file changes)      | `check-runner-access` pre-job      | Verifies all migrations are applied to production DB                                                |
| `check-conflicts.yml`          | PR (opened/sync/reopened/edited) | `check-runner-access` pre-job      | Merge conflict detection                                                                            |
| `integration-advisory.yml`     | PR (opened/sync/reopened)        | `check-runner-access` pre-job      | Advisory comment recommending integration specs                                                     |
| `jira-link-check.yml`          | PR (7 event types)               | `check-runner-access` pre-job      | Validates the `jira-link` marker in PR body, and repairs a missing/malformed one from the title key |
| `review.yml`                   | PR (opened/ready/labeled/sync)   | `check-runner-access` pre-job      | Reviewer bot W1                                                                                     |
| `security-scanning.yml`        | Dispatched by orchestrator       | `runner-label` workflow_call input | Dependency audit, SAST, secret scanning                                                             |

### CI Failure Labels

The CI pipeline automatically labels PRs with failure reasons. Labels are added on failure and removed when the check passes:

| Label                 | Source                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CI: Custom Checks`   | `custom-checks` job -- one of ~10 independent scripts failed (migration immutability, skill lint, workflow validation, touch-map lint, `.github/checks/*.sh`, ...); job-level, does not identify which |
| `CI: Formatting`      | `lint` job's format step -- Prettier check failed                                                                                                                                                      |
| `CI: Lint Failure`    | `lint` job's lint step -- ESLint errors                                                                                                                                                                |
| `CI: Test Failure`    | `test` job -- typecheck or Jest failures                                                                                                                                                               |
| `CI: Build Failure`   | `build` job failed                                                                                                                                                                                     |
| `CI: E2E Failure`     | `e2e` job -- Playwright failures                                                                                                                                                                       |
| `CI: Security`        | Security scanning failed (applied by the orchestrator's `label-pr` job)                                                                                                                                |
| `CI: Schema Drift`    | `check-schema.yml` -- `schema.graphql` out of sync with Pothos implementation                                                                                                                          |
| `CI: Migration`       | `check-migrations-applied.yml` -- migrations not applied to the shared RDS                                                                                                                             |
| `CI: Conflicts`       | `check-conflicts.yml` / base-push sweep -- merge conflicts with base                                                                                                                                   |
| `docs: touch-map gap` | Advisory: code changed without updating a linked required doc                                                                                                                                          |

Legacy labels (`CI: Type Error`, `CI: Quality Gates`, `CI: Lint & Format`) are no longer applied — the summarize job removes them if present.

> **Per-check details** (what each check validates, why it fails, fix commands): see [pr-lifecycle/references/ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md).

## Bot Review (Phase 4)

The review gate is the **Reviewer Bot** — `review.yml` (W1) running `.github/scripts/reviewer/` as the `legacy-sports-review-bot` app. It posts a real PR review (APPROVE / REQUEST_CHANGES), manages the required `bot-review` commit status per HEAD SHA, and applies `merge-when-ready` on APPROVED. GitHub's Copilot reviewer also comments, but it is a lower-priority signal and not the gate. (The old Copilot auto-approve pipeline is retired; the `copilot-auto-approve.yml` file at HEAD is only the thread-resolution recheck dispatcher, LS-8121.)

The actor table, Label Ownership, the Author Agent Contract (`FIX:`/`JUSTIFY:`/`CANNOT-COMPLY:` protocol), and the fix-round/cycle caps are all defined in **[pr-lifecycle/SKILL.md](../../pr-lifecycle/SKILL.md)** — the single home; do not restate them here. Per-context detail on `bot-review` (HEAD-SHA gating, overrides W5/W6, label guard W7): [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md#bot-review-commit-status).

## Jira Branch Sync (Phase 5) (`jira-branch-sync.yml`)

Automatically keeps Jira ticket statuses in sync with branch/PR activity. The
workflow is a thin adapter over the unit-tested `tools/jira-sync/` package
(LS-7894, phase 1 of `docs/rfcs/draft-declared-ticket-linkage.md`), executed
with bare `node` from a sparse checkout of `main`.

### Transition Table

| Event                                               | Keys used                             | Jira Transition |
| --------------------------------------------------- | ------------------------------------- | --------------- |
| `push`, no open PR for the branch                   | branch-name keys only                 | In Progress     |
| `push`, open PR exists for the branch               | --                                    | no-op           |
| `pull_request` opened / reopened / ready_for_review | `primary` from the `jira-link` marker | In Review       |
| `pull_request` converted_to_draft                   | `primary`                             | In Progress     |
| `pull_request` closed + merged                      | `primary`                             | Done            |
| `pull_request` closed without merge                 | `primary`                             | In Progress     |

> **Ticket key selection (PR events):** the `jira-link` marker in the
> PR body is the source of truth; when no marker exists, the sync falls back to
> PR-title key parsing. `primary: none` and invalid markers transition nothing.
> Since LS-9279 the gap between the two rarely lasts: `jira-link-check.yml`
> rewrites a missing or malformed marker from the title key (never against a
> declaration that disagrees with the title), because every GitHub MCP read
> path strips the marker out of the body and agents therefore cannot maintain
> it by hand.
> **Commit-message key sweeping no longer exists** — it swept foreign keys from
> main's commits after rebases (run 27291997543). Pushes to `claude/**` branches
> with no key in the branch name are a no-op; the `work-ticket` skill already
> transitions on claim.

> **Monotonic guard:** every transition first reads the ticket's current status
> and consults the allowed-moves table (`To Do → In Progress → In Review → Done`).
> The only permitted downgrades are `In Review → In Progress` on closed-unmerged
> or converted_to_draft. A push can never demote a ticket; a merged PR can never
> un-Done one.

### Epic Sync

After transitioning the child ticket, the workflow also syncs the parent epic status based on the aggregate state of all its children:

| Children State                                | Epic Transition |
| --------------------------------------------- | --------------- |
| All children Done                             | Done            |
| All children In Review or Done                | In Review       |
| Any child In Progress or In Review            | In Progress     |
| Otherwise (all To Do / Backlog, or Done-only) | no change       |

A Done child alone does NOT pull an epic out of To Do / Backlog — only In Progress / In Review children count as "active work" (LS-4683).

### Status Audit (`jira-status-audit.yml`)

The reconciliation audit (weekly cron + `jira-issue-updated` repository_dispatch

- manual dispatch) reads the same `jira-link` marker via `tools/jira-sync audit`
  (LS-7897, phase 4 of the RFC) and **auto-repairs** drift instead of only
  labeling it. It scans open PRs plus PRs merged in the last 14 days, computes
  the expected status from PR state (merged → Done, open draft → In Progress,
  open ready → In Review; key selection marker → PR-title → branch-name), and
  applies corrections through the same monotonic guard with a non-`pull_request`
  event — so the audit can never demote a ticket. Guard-refused drift gets the
  `jira-mismatch` label plus a comment stating the proposed action. Auto-repair
  writes are gated on the repo var `JIRA_AUDIT_AUTO_REPAIR` being `'true'`
  (default: dry-run — label + proposed action only). Note: the audit's label
  add/remove and Jira API orchestration live in the workflow bash, not in
  `tools/jira-sync/` — the package's unit tests cover planning (`planAudit`) and
  the guard only.

Epics with the Jira label `pinned-status` are excluded from automatic transitions.

**Authentication:** Atlassian OAuth 2.0 (client credentials grant) via `JIRA_CREDENTIALS` secret.

## Merge Queue (Phase 6) (`merge-queue.yml`)

### Trigger Events

- `pull_request` labeled/unlabeled (`merge-when-ready` or `merge-to-parent`)
- `pull_request_review` submitted
- `workflow_run` completed (CI Orchestrator for PR branches, and for the queue's own `mq/test/*` batch dispatches — LS-10571)
- `workflow_dispatch` (manual)

### Concurrency

- Group: `merge-queue` with `cancel-in-progress: false` (serialized processing).
- Runner: `process-merge-queue` is pinned to `ubuntu-latest`, not the spot self-hosted pool. It was reclaimed 19 times Sep 22–29 2026 (LS-10312).
- 30-second debounce on `workflow_run` and `pull_request_review` triggers to let concurrent triggers settle.

### 6 Validation Checks

Before merging, each PR must pass all of these:

| #   | Check                                      | Behavior                                                                                                                                           |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Not draft                                  | Draft PRs are skipped                                                                                                                              |
| 2   | `merge-to-parent` label (non-main targets) | Required when PR targets a branch other than `main`                                                                                                |
| 3   | Mergeable state                            | Polls up to 60s if `mergeable=null`; rejects if conflicts                                                                                          |
| 4   | No unresolved review threads               | Checks via GraphQL; outdated threads do not block                                                                                                  |
| 5   | Status checks passing                      | Check runs and commit statuses must be green — deduplicated to the **latest per name/context** (mirrors GitHub's evaluator); skipped checks are OK |
| 6   | No pending checks                          | Waits for in-progress checks silently (no blocker comment)                                                                                         |

> **Config union (LS-7963):** `validateStatusChecks` unions the live required set with the config-tracked contexts in `.github/ruleset.json` (`loadConfigRequiredChecks` in `merge-queue-processor.js`), so the checked-in config can tighten the queue's gate ahead of the owner-gated live apply — never loosen it. Staging model: [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md#config-vs-live-the-staged-cutover-model).

### Batched Merging with Bisection (LS-10571)

PRs that pass every check above and target `main` are not merged one at a time. `merge-queue-batch.js` handles them instead; [merge-queue-guide.md](../../../../docs/ci-cd/merge-queue-guide.md#batched-merging-ls-10571) has the full description.

1. **Build.** Up to 16 PRs, lowest number first, are merged onto the `main` tip in an `mq/test/<id>` ref. The tip commit message carries the set's metadata, so the refs hold all queue state.
2. **Test.** The orchestrator is dispatched there with `base_sha` set. CI Gate posted on the batch tip is the batch verdict.
3. **Land (green).** Each PR is squash-merged in order, one commit per PR, then main's tree is asserted equal to the tested tree.
4. **Bisect (red).** A failed set splits into halves, which are tested in parallel; the first green half lands. A failing single PR is ejected: its label is removed and a comment links the run.
5. **Infra failures** (no terminal gate) re-run once, then requeue. They never bisect or eject.

Batch CI replaces the LS-9662 staleness guard. `merge-to-parent` PRs and the `MERGE_QUEUE_MODE=serial` repo variable both use the serial path below.

### Self-Heal for Missing `bot-review` (LS-8289)

A queued PR whose head SHA has no `bot-review` status would otherwise wait forever — the reviewer only fires on the `bot:ready-for-review` label, and nothing re-applies it once an agent session ends (30+ PRs froze this way on 2026-07-01). On every queue run, the processor detects three stuck shapes and re-applies `bot:ready-for-review` itself:

1. `bot-review` is required but never registered on the head SHA.
2. `reviewDecision` is `CHANGES_REQUESTED` but the bot never adjudicated the current SHA.
3. A `bot-review` `pending` is older than 45 minutes (Reviewer W1's job timeout is 15 minutes, so the run died).

The re-applied label fires Reviewer (W1) through its normal trigger; the review submission re-wakes the queue via `pull_request_review`, so remediation chains drain a backlog without a timer. Capped at 10 remediations per run; idempotent (skips when the label is already present or the SHA already carries a verdict).

**Label semantics are single-purpose (LS-8297):** `bot:ready-for-review` is the only review trigger; `merge-when-ready` only feeds the queue. The queue is event-driven (labels, review submissions, CI completions), with one safety-net cron every 30 minutes (`19,49 * * * *`, LS-10600). The cron covers a lost trigger: a queue run that fails runner provisioning before any step executes, or a webhook that is never delivered. A tick exits at its "Idle check" step when no open PR carries `merge-when-ready` or `merge-to-parent` and no `mq/test/*` batch set is in flight. The residual corner (a crashed reviewer run on a non-queued PR in a totally idle repo) clears on the next repo event or a manual `workflow_dispatch`.

### Codeowner-Blocked Merges (LS-8297)

Path-scoped CODEOWNERS rules (e.g. `.github/**` → `@bkrupa`) are invisible to the queue's `reviewDecision` pre-check, so the merge API can refuse with 405 "Waiting on code owner review". The processor treats this as a clean blocked state — it posts the CODEOWNER blocker comment and Discord escalation and exits successfully. The code owner's approval submission re-triggers the queue, which then merges.

### SHA Pinning

The merge API call includes `sha: pr.head.sha` -- if the branch has advanced since validation, GitHub rejects the merge with a 409, preventing merging an unvalidated commit.

### Merge Method

Squash merge with sanitized commit messages (null bytes and control characters removed to prevent HTTP 500).

### Dependent PR Retargeting

After a successful merge, the queue automatically:

1. Finds all open PRs whose base branch is the merged branch.
2. Re-targets them to the merged PR's base (typically `main`).
3. Removes the `Waiting on Parent` label if present.
4. Posts a notification comment with rebase instructions.

### Post-Merge Branch Deletion

The source branch is deleted after merge (protected branches `main`, `master`, `develop` are never deleted).

### Debounce

When multiple CI runs complete within seconds, multiple `workflow_run` triggers fire. The concurrency group serializes them: one executes while one queues, and further arrivals replace the queued run. The 30-second sleep works with this behavior -- while the running job sleeps, new triggers replace the single queued slot, so only the most recent trigger remains.

## Related

- [ticket-to-merge-spine.md](./ticket-to-merge-spine.md) — the ordering that produces a ready PR.
- [post-merge-and-deploy.md](./post-merge-and-deploy.md) — deploy workflows, previews, cleanup (Phase 7).
- [roles-and-required-checks.md](./roles-and-required-checks.md) — separation of duties, required vs advisory checks, secrets.
- [pr-lifecycle/SKILL.md](../../pr-lifecycle/SKILL.md) — creating PRs, replying to reviews, the Author Agent Contract.
