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
- `pull_request_review` submitted — any APPROVED review; the `check-prior-success` idempotency guard skips re-running CI when the SHA already has passing checks from the synchronize run (LS-4182/LS-5223)
- `workflow_dispatch` — two paths: (1) direct manual dispatch with configurable `security-scan-type` input; (2) triggered by `ci-run-label.yml` when the `ci:run` label is added — that workflow removes the label then dispatches the orchestrator. Keeping `labeled` out of the orchestrator's trigger list prevents non-`ci:run` label events from occupying the concurrency group and displacing queued `synchronize` runs (LS-7752)
- `merge_group` — always runs CI + security

**Post-pipeline jobs** (all run on `ubuntu-latest` regardless of self-hosted runner state):

- `label-pr` — applies `CI: Security` label on security failures
- `remove-merge-label-on-failure` — removes `merge-when-ready` when CI fails
- `restore-merge-label-on-success` — restores `merge-when-ready` when CI passes and bot approval is still active
- `report-runner-shutdown` — fires only when `ci-pipeline` is cancelled; checks job logs for `"runner has received a shutdown signal"` and, if confirmed, applies the `CI: Runner Flake` label and posts a PR comment with a re-run link. The label is cleared at the start of the next CI run by a step in `determine-scope`.

**Concurrency:** `orchestrator-{PR#}` with `cancel-in-progress: false` — a review event (which skips all jobs when CI already passed) must not cancel an in-progress synchronize-triggered CI run for the same PR.

### CI Pipeline Stages (`ci-pipeline.yml`)

```
detect-changes (~30s)
       |
  +----+----+
  |         |
quality   build         (PARALLEL - saves 5-15 min)
gates     validation
  |         |
  +----+----+
       |
     e2e              (sharded, after both pass)
       |
   summarize          (always runs - PR comments, badges, labels)
```

**Stage 1 -- Detect Changes:** Uses `dorny/paths-filter` and Nx affected analysis to determine which components changed (web, mobile, lambdas, terraform, e2e).

**Stage 2a -- Quality Gates:** Runs in parallel with build validation.

- Agent skill lint (`node scripts/lint-skills.js`)
- Migration immutability check
- Touch-map documentation freshness (`node scripts/lint-touch-map.js`) — advisory; posts label `docs: touch-map gap` + PR comment on gap, never blocks
- Prettier formatting check (`pnpm exec prettier --check --ignore-unknown ...`)
- `nx affected -t lint`
- `nx affected -t typecheck`
- `nx affected -t test` (runs with `NODE_OPTIONS=--max_old_space_size=2048` — lower than the 4096 MB global default to prevent OOM when a lockfile change marks all projects affected)

**Stage 2b -- Build Validation:** Runs in parallel with quality gates.

- Web build (if web/e2e changed)
- Mobile build (if mobile changed)
- Lambda build (if lambdas changed)
- Terraform validate (if terraform changed)
- Uploads web build artifact for e2e consumption

**Stage 3 -- E2E Tests:** Playwright, sharded (2 shards for PRs, 3 for nightly).

- PRs: `@critical` tests only, excludes `@slow`
- Nightly: all tests, 3 shards
- Downloads web build artifact from Stage 2b
- Uploads blob reports for merged Playwright report

**Stage 3b -- Deploy Playwright Report:** Merges shard reports and deploys to GitHub Pages (`bkrupa/legacy-sports-deploys`). The merge step emits both `index.html` (browsable SPA) and `summary.md` (compact agent-targeted Markdown, ~20–50× smaller). Both are copied to `playwright-report/<name>/` — agents should fetch `summary.md` first via `ci_get_playwright_report` (one GET, no zip inflation); the HTML SPA is the human-readable fallback. See [read-playwright-report skill](../../read-playwright-report/SKILL.md).

### Manual Playwright Dispatch (`run-playwright-tests.yml`)

Separate from the CI Orchestrator. Triggered via `workflow_dispatch` or the nightly schedule (03:00 UTC). Key inputs:

| Input         | Default         | Notes                                                                                                                                                      |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-suite`  | `e2e`           | `e2e`, `integration`, or `all`                                                                                                                             |
| `test-file`   | _(empty = all)_ | Space-separated filenames relative to testDir (e.g. `"file1.spec.ts file2.spec.ts"`). Each name is a separate Playwright positional arg.                   |
| `test-grep`   | `(all)`         | Playwright `--grep` pattern; pipe-separated for OR (e.g. `"roster-management\|trade-flow"`). Use instead of `test-file` for tag or partial-name filtering. |
| `shard-total` | `2`             | Number of parallel shards                                                                                                                                  |

Reports are published to `playwright-report/manual-<run_number>/` on GitHub Pages — both `index.html` and `summary.md` (LS-7838). Always verify `stats.total > 0` after reading a report — Playwright exits 0 with `ok: true` even when 0 tests run, so a green CI run does not guarantee tests executed. See [read-playwright-report skill](../../read-playwright-report/SKILL.md).

**Stage 4 -- Summarize & Report:** Always runs (unless cancelled).

- Collects results from all stages
- Posts PR comment with status table
- Updates CI status badges (on main)
- Labels PR with failure reasons
- Discord notification on main branch failures

### Parallel Checks (Separate Workflows)

These run independently from the orchestrator, triggered directly by PR events:

| Workflow                       | Trigger                     | Purpose                                              |
| ------------------------------ | --------------------------- | ---------------------------------------------------- |
| `check-schema.yml`             | PR (GraphQL file changes)   | Schema drift detection + codegen compatibility       |
| `check-migrations-applied.yml` | PR (migration file changes) | Verifies all migrations are applied to production DB |
| `security-scanning.yml`        | Dispatched by orchestrator  | Dependency audit, SAST, secret scanning              |

### CI Failure Labels

The CI pipeline automatically labels PRs with failure reasons. Labels are added on failure and removed when the check passes:

| Label                        | Source                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| `CI: Migration Immutability` | Quality gates -- migration files modified                                   |
| `CI: Formatting`             | Quality gates -- Prettier formatting check failed                           |
| `CI: Lint Failure`           | Quality gates -- ESLint errors                                              |
| `CI: Type Error`             | Quality gates -- TypeScript errors                                          |
| `CI: Test Failure`           | Quality gates -- Jest test failures                                         |
| `CI: Build Failure`          | Build validation failed                                                     |
| `CI: E2E Failure`            | Playwright E2E tests failed                                                 |
| `CI: Quality Gates`          | Fallback label when quality gates job fails but subsection outputs are lost |
| `CI: Security`               | Security scanning failed                                                    |
| `CI: Schema Drift`           | `schema.graphql` out of sync with Pothos implementation                     |
| `CI: Migration`              | Migrations not applied to production DB                                     |
| `docs: touch-map gap`        | Advisory: code changed without updating a linked required doc               |

> **Per-check details** (what each check validates, why it fails, fix commands): see [pr-lifecycle/references/ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md).

## Copilot Review (Phase 4)

### Flow

1. **PR opened/synchronized** -- `copilot-auto-approve.yml` `request-review` job sets `bot-review` commit status to **pending**.
2. **Copilot reviews** -- the built-in "Copilot code review" workflow runs automatically (triggered by repository ruleset with `review_on_push: true`).
3. **Review completes** -- `auto-approve` job fires via `workflow_run` trigger:
   - If no unresolved threads: sets `bot-review` to **success**, approves PR, adds `merge-when-ready` label.
   - If unresolved threads: sets `bot-review` to **failure**.
4. **Threads resolved** -- `review-check` job fires on `pull_request_review` events, re-checks thread state, and approves + labels if all clean.

### Carry-Forward on Rebase

On `synchronize` (rebase/force-push), the `request-review` job checks if Copilot already has a clean review with no unresolved threads. If so, it:

- Carries forward `bot-review` success status to the new SHA
- Re-approves the PR (if not already approved)
- Ensures `merge-when-ready` label is present

This prevents `bot-review` from getting stuck at pending forever when the Copilot workflow does not re-trigger after a force-push.

### Dependabot PRs

Dependabot PRs automatically get `bot-review` set to **success** (Copilot review skipped).

### 2-Round Fix Cap

Agents follow a 2-round cap on fixing Copilot review comments:

- **Round 1:** Fix security, bugs, and type safety issues.
- **Round 2:** Fix remaining actionable comments.
- **After round 2:** Resolve remaining threads as "acknowledged" and proceed.

### Manual Recheck

The `recheck` job can be triggered via `workflow_dispatch` with a `pr_number` input to re-evaluate Copilot thread state without pushing code. Useful after an agent resolves review threads without code changes.

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

| #   | Check                                      | Behavior                                                             |
| --- | ------------------------------------------ | -------------------------------------------------------------------- |
| 1   | Not draft                                  | Draft PRs are skipped                                                |
| 2   | `merge-to-parent` label (non-main targets) | Required when PR targets a branch other than `main`                  |
| 3   | Mergeable state                            | Polls up to 60s if `mergeable=null`; rejects if conflicts            |
| 4   | No unresolved review threads               | Checks via GraphQL; outdated threads do not block                    |
| 5   | Status checks passing                      | All check runs must be completed with success; skipped checks are OK |
| 6   | No pending checks                          | Waits for in-progress checks silently (no blocker comment)           |

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
