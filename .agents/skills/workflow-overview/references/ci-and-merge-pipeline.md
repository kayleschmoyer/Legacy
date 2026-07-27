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
  report-runner-shutdown (ci-pipeline cancelled only)
```

**Triggers:**

- `pull_request` opened/synchronize/reopened — CI runs on every push so check runs land in a push-event check suite recognised by branch protection (LS-7707)
- `pull_request_review` submitted — any APPROVED review; the `check-prior-success` idempotency guard skips re-running CI when the head SHA is already green or CI is already in flight (LS-4182/LS-7736). It reads the required contexts from `.github/ruleset.json` (config), evaluating check-run contexts against the Checks API and `_commitStatus` contexts (`bot-review`, `CI Gate`) against the latest commit status per context; on any read error it fail-safes to re-running CI. Before evaluating, it re-fetches the PR's live head via `github.rest.pulls.get` and prefers that over the (possibly stale) event-payload SHA, so a push/approval race can't make an older run's in-flight checks look like evidence for the current head — mirroring the SHA-currency guard `ci-gate.js` uses when posting `CI Gate` (LS-8682)
- `workflow_dispatch` — two paths: (1) direct manual dispatch with configurable `security-scan-type` input; (2) triggered by `ci-run-label.yml` when the `ci:run` label is added — that workflow removes the label then dispatches the orchestrator. Keeping `labeled` out of the orchestrator's trigger list prevents non-`ci:run` label events from occupying the concurrency group and displacing queued `synchronize` runs (LS-7752)
- `merge_group` — always runs CI + security

**Post-pipeline jobs** (run on `${{ needs.determine-scope.outputs.runner-label || 'ubuntu-latest' }}` — self-hosted when available, otherwise `ubuntu-latest`):

- `label-pr` — applies `CI: Security` label on security failures
- `remove-merge-label-on-failure` — removes `merge-when-ready` when CI fails
- `restore-merge-label-on-success` — restores `merge-when-ready` when CI passes and bot approval is still active
- `report-runner-shutdown` — fires only when `ci-pipeline` is cancelled; checks job logs for `"runner has received a shutdown signal"` and, if confirmed, applies the `CI: Runner Flake` label and posts a PR comment with a re-run link. The label is cleared at the start of the next CI run by a step in `determine-scope`.

**Concurrency:** `orchestrator-{PR#}` with `cancel-in-progress: false` — a review event (which skips all jobs when CI already passed) must not cancel an in-progress synchronize-triggered CI run for the same PR.

### CI Pipeline Stages (`ci-pipeline.yml`)

```
detect-changes (~30s, incl. affected-e2e spec selection)
       |
  +----+----+----+----+----+----+
  |    |    |    |    |    |
lint format test build custom- lockfile-   (6 granular jobs, PARALLEL)
                       checks  check
  +----+----+----+----+----+----+
       |
     e2e              (sharded matrix; gated on the six above)
       |
   summarize          (always() && !cancelled() — PR comment, labels,
                       posts the `CI Gate` commit status)
```

When invoked via `workflow_call` from the orchestrator's `🚀 CI Pipeline` job, each job posts a check run named `🚀 CI Pipeline / <job-id>` — **informational** since the LS-8014 cutover; the merge gate reads the aggregate `CI Gate` commit status instead (see [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md)).

**Stage 1 -- Detect Changes:** `dorny/paths-filter` + git to determine which surfaces changed (web, mobile, lambdas, terraform, e2e), plus hermetic affected-e2e spec selection (LS-7846) via `apps/web-e2e/src/e2e-surface-map.json` — emits the specs/grep/shard-matrix the e2e job consumes.

**Stage 2 -- Six granular jobs, in parallel:**

- `lint` — `nx affected -t lint`
- `format` — Prettier check over the PR's changed files
- `test` — `nx affected -t typecheck test` (with `NODE_OPTIONS=--max_old_space_size=2048` — lower than the 4096 MB global default to prevent OOM when a lockfile change marks all projects affected)
- `build` — web/mobile/lambda builds + terraform validate as flagged by detect-changes; uploads the web artifact for e2e
- `custom-checks` — agent-skill lint, migration immutability, workflow validation, touch-map freshness (advisory), repo-script unit suites
- `lockfile-check` — `pnpm-lock.yaml` drift

Every one of these jobs (and `summarize`) skips when the PR carries the `skip-ci` label — a footgun once `CI Gate` is required; see [the skip-ci footgun](../../pr-lifecycle/references/ci-checks-reference.md#the-skip-ci-footgun-pr-stuck-at-expected).

**Stage 3 -- E2E Tests:** Playwright, sharded matrix from detect-changes.

- PRs: `@critical` (excluding `@slow`) **plus** the affected specs mapped from changed files; a broad-surface change escalates to the full hermetic suite, sharded
- Downloads the web build artifact from the `build` job
- Uploads blob reports for the merged Playwright report
- The `e2e-affected` job summarizes the shard results as one informational check run

**Stage 3b -- Deploy Playwright Report:** Merges shard reports and deploys to GitHub Pages (`bkrupa/legacy-sports-deploys`). The merge step emits both `index.html` (browsable SPA) and `summary.md` (compact agent-targeted Markdown, ~20–50× smaller). Both are copied to `playwright-report/<name>/` — agents should fetch `summary.md` first via `ci_get_playwright_report` (one GET, no zip inflation); the HTML SPA is the human-readable fallback. See [read-playwright-report skill](../../read-playwright-report/SKILL.md).

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
- **Posts the `CI Gate` aggregate commit status** for the PR head SHA (`.github/scripts/ci-gate.js`) — the required CI context post-LS-8014; folded-job list, pass semantics, and the cancelled-exclusion rule (LS-8219) live in [ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md#ci-gate)
- Posts PR comment with status table
- Labels PR with failure reasons
- Discord notification on main branch failures

### Parallel Checks (Separate Workflows)

These run independently from the orchestrator, triggered directly by PR events. PR-triggered workflows use a `check-runner-access` pre-job (Pattern A, LS-1652) that resolves the runner label — external contributors always get `ubuntu-latest`; internal team members get the self-hosted runner. `security-scanning.yml` is the exception: it is dispatched by the orchestrator via `workflow_call` and receives the already-resolved `runner-label` as an input rather than running its own pre-job.

| Workflow                       | Trigger                          | Runner resolution                  | Purpose                                              |
| ------------------------------ | -------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `check-schema.yml`             | PR (GraphQL file changes)        | `check-runner-access` pre-job      | Schema drift detection + codegen compatibility       |
| `check-migrations-applied.yml` | PR (migration file changes)      | `check-runner-access` pre-job      | Verifies all migrations are applied to production DB |
| `check-conflicts.yml`          | PR (opened/sync/reopened/edited) | `check-runner-access` pre-job      | Merge conflict detection                             |
| `integration-advisory.yml`     | PR (opened/sync/reopened)        | `check-runner-access` pre-job      | Advisory comment recommending integration specs      |
| `jira-link-check.yml`          | PR (7 event types)               | `check-runner-access` pre-job      | Validates `<!-- jira-link -->` marker in PR body     |
| `review.yml`                   | PR (opened/ready/labeled/sync)   | `check-runner-access` pre-job      | Reviewer bot W1                                      |
| `security-scanning.yml`        | Dispatched by orchestrator       | `runner-label` workflow_call input | Dependency audit, SAST, secret scanning              |

### CI Failure Labels

The CI pipeline automatically labels PRs with failure reasons. Labels are added on failure and removed when the check passes:

| Label                        | Source                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `CI: Migration Immutability` | `custom-checks` job -- a merged migration file was modified                   |
| `CI: Formatting`             | `format` job -- Prettier check failed                                         |
| `CI: Lint Failure`           | `lint` job -- ESLint errors                                                   |
| `CI: Test Failure`           | `test` job -- typecheck or Jest failures                                      |
| `CI: Build Failure`          | `build` job failed                                                            |
| `CI: E2E Failure`            | `e2e` job -- Playwright failures                                              |
| `CI: Security`               | Security scanning failed (applied by the orchestrator's `label-pr` job)       |
| `CI: Schema Drift`           | `check-schema.yml` -- `schema.graphql` out of sync with Pothos implementation |
| `CI: Migration`              | `check-migrations-applied.yml` -- migrations not applied to the shared RDS    |
| `CI: Conflicts`              | `check-conflicts.yml` / base-push sweep -- merge conflicts with base          |
| `docs: touch-map gap`        | Advisory: code changed without updating a linked required doc                 |

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

> **Ticket key selection (PR events):** the `<!-- jira-link -->` marker in the
> PR body is the source of truth; when no marker exists, the sync falls back to
> PR-title key parsing. `primary: none` and invalid markers transition nothing.
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
- `workflow_run` completed (CI Orchestrator for PR branches)
- `workflow_dispatch` (manual)

### Concurrency

- Group: `merge-queue` with `cancel-in-progress: false` (serialized processing).
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

### Self-Heal for Missing `bot-review` (LS-8289)

A queued PR whose head SHA has no `bot-review` status would otherwise wait forever — the reviewer only fires on the `bot:ready-for-review` label, and nothing re-applies it once an agent session ends (30+ PRs froze this way on 2026-07-01). On every queue run, the processor detects three stuck shapes and re-applies `bot:ready-for-review` itself:

1. `bot-review` is required but never registered on the head SHA.
2. `reviewDecision` is `CHANGES_REQUESTED` but the bot never adjudicated the current SHA.
3. A `bot-review` `pending` is older than 45 minutes (Reviewer W1's job timeout is 15 minutes, so the run died).

The re-applied label fires Reviewer (W1) through its normal trigger; the review submission re-wakes the queue via `pull_request_review`, so remediation chains drain a backlog without a timer. Capped at 10 remediations per run; idempotent (skips when the label is already present or the SHA already carries a verdict).

**Label semantics are single-purpose (LS-8297):** `bot:ready-for-review` is the only review trigger; `merge-when-ready` only feeds the queue. The queue deliberately has **no cron** — it is fully event-driven (labels, review submissions, CI completions). The one residual corner (a crashed reviewer run in a totally idle repo) clears on the next repo event or a manual `workflow_dispatch`.

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
