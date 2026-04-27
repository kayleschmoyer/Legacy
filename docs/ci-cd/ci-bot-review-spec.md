# CI & Bot-Review System — End-to-End Specification

> **Scope**: GitHub Actions workflows, custom actions, branch protection, merge queue, Copilot bot-review state machine, pre-commit gates, and Dependabot automation.  
> **Source of truth files**: `.github/workflows/`, `.github/actions/`, `.github/ruleset.json`, `Makefile`, `scripts/`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Pre-Commit Gate (`make pc`)](#2-pre-commit-gate-make-pc)
3. [CI Orchestrator](#3-ci-orchestrator)
4. [CI Pipeline](#4-ci-pipeline)
5. [Security Scanning](#5-security-scanning)
6. [Bot-Review State Machine](#6-bot-review-state-machine)
7. [Merge Conflict Detection](#7-merge-conflict-detection)
8. [Merge Queue](#8-merge-queue)
9. [Branch Protection Ruleset](#9-branch-protection-ruleset)
10. [Dependabot Automation](#10-dependabot-automation)
11. [Infrastructure & Runner Management](#11-infrastructure--runner-management)
12. [Custom GitHub Actions Library](#12-custom-github-actions-library)
13. [Label Taxonomy](#13-label-taxonomy)
14. [Permission Model](#14-permission-model)
15. [Edge Cases & Known Limitations](#15-edge-cases--known-limitations)
16. [Workflow Interaction Diagram](#16-workflow-interaction-diagram)

---

## 1. Architecture Overview

The system is composed of five distinct layers that interact in a defined order:

```
Developer push
      │
      ▼
[Pre-commit: make pc]          ← local validation gate (9 steps)
      │
      ▼
[GitHub PR opened/updated]
      │
      ├──► [CI Orchestrator]   ← determines scope, dispatches:
      │         ├──► [CI Pipeline]        Quality Gates + Build Validation
      │         └──► [Security Scanning]  SAST / deps / secrets
      │
      ├──► [Check Conflicts]   ← lightweight, runs in parallel
      │
      └──► [Copilot code review] (GitHub App, internal trigger)
                │
                ▼
          [Copilot Review Handler]  ← sets `bot-review` check run
                │
                ▼
          [Merge Queue]             ← polls all required checks; merges when green
```

All four required status checks (`Quality Gates`, `Build Validation`, `bot-review`, `No Merge Conflicts`) must be green before the merge queue will merge a PR.

---

## 2. Pre-Commit Gate (`make pc`)

**File**: `Makefile` (targets around line 853)  
**Purpose**: Local validation before pushing. Mirrors CI checks so failures are caught early.

### Change Classification

`make pc` first runs `scripts/classify-changes.js` to detect what changed and set skip flags:

| Flag                 | Trigger condition                                    | Effect                                     |
| -------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `PC_HAS_DB=1`        | `lib/db-client/` or `lambdas/db/` changed            | Enables migration + schema + codegen steps |
| `PC_HAS_WORKFLOWS=1` | `.github/workflows/` changed                         | Enables workflow YAML validation step      |
| `PC_DOCS_ONLY=1`     | All changes are `.md`, `.agents/skills/`, or `docs/` | Skips typecheck, lint, test, build         |

Base ref: `NX_BASE` defaults to `origin/main` (falls back to `main` on non-Windows if unreachable).

### 9-Step Sequence

| Step | Command                                                                                                               | Skip condition      |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1    | Migration immutability: `scripts/check-migration-immutability.js --branch`                                            | `!PC_HAS_DB`        |
| 2    | Schema generation: `pnpm exec nx run db:print-schema`                                                                 | `!PC_HAS_DB`        |
| 3    | GraphQL codegen: `pnpm exec nx affected -t codegen --base=$(NX_BASE)`                                                 | `!PC_HAS_DB`        |
| 4    | Type checking: `pnpm exec nx affected -t typecheck --base=$(NX_BASE)`                                                 | `PC_DOCS_ONLY`      |
| 5    | Formatting (auto-amends): `pnpm exec nx format:write` (not limited to staged files; may rewrite any file in the repo) | never               |
| 6    | Linting: `pnpm exec nx affected -t lint --fix --base=$(NX_BASE)`                                                      | `PC_DOCS_ONLY`      |
| 7    | Workflow YAML validation: `node scripts/validate-workflows.js`                                                        | `!PC_HAS_WORKFLOWS` |
| 8    | Testing: `pnpm exec nx affected -t test --base=$(NX_BASE)`                                                            | `PC_DOCS_ONLY`      |
| 9    | Building: `pnpm exec nx affected -t build --base=$(NX_BASE)`                                                          | `PC_DOCS_ONLY`      |

**Step 5 auto-amend behavior**: if `nx format:write` modifies files and there are no other uncommitted changes, the Makefile auto-amends the previous commit. If there are other uncommitted changes alongside the format fixes, the step fails with an error — commit or stash them first. If the amended commit was already pushed, the next push will require `--force-with-lease`.

### Edge Cases

- **Base ref selection**: `NX_BASE` is set to `origin/main`; on non-Windows systems it falls back to `main` if `origin/main` is unavailable. There is no `HEAD^` fallback. If `git diff` fails, `scripts/classify-changes.js` fails safe by treating all flags as "run everything" — nothing is accidentally skipped.
- **docs-only PRs**: steps 4, 6, 8, 9 are entirely skipped, making `make pc` near-instant.
- **Windows quoting**: `scripts/classify-changes.js` is a Node script to avoid shell quoting issues with `jq` (not available on Windows).
- **Nx parallel limit**: capped at 5 projects simultaneously via `nx.json`.

---

## 3. CI Orchestrator

**File**: [`.github/workflows/ci-orchestrator.yml`](.github/workflows/ci-orchestrator.yml)

### Triggers

| Event                                          | Branch/condition | Purpose                                  |
| ---------------------------------------------- | ---------------- | ---------------------------------------- |
| `pull_request` (opened, synchronize, reopened) | any              | Primary PR CI                            |
| `push`                                         | `develop`        | Integration branch CI                    |
| `merge_group`                                  | —                | Merge queue validation                   |
| `schedule` `0 2 * * 1`                         | —                | Weekly security scan (Mondays 02:00 UTC) |
| `workflow_dispatch`                            | —                | Manual run with debug/scan-type options  |

### Concurrency

```yaml
group: orchestrator-${{ github.event.pull_request.number || github.ref }}
cancel-in-progress: true
```

New pushes to the same PR cancel in-flight orchestrator runs, preventing stale results from older commits.

### Job Graph

```
determine-scope
      │
      ├──► ci-pipeline          (skipped on push events (develop))
      ├──► security-scanning    (conditional on scope outputs)
      ├──► label-pr             (runs after security-scanning; manages "CI: Security" label)
      └──► remove-merge-label-on-failure  (removes merge-when-ready if ci-pipeline fails)
```

### Security Scan Scope Logic (`determine-scope`)

The `Set Scope Outputs` step computes `run-security` and `security-scan-type` from changed files:

| Changed paths                                                    | scan_type                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `package.json`, `pnpm-lock.yaml`, `.npmrc`                       | `dependencies-only`                                                  |
| `apps/**.(ts\|tsx\|js\|jsx)`, `lib/**`, `lambdas/**`, `tools/**` | `secrets-only`                                                       |
| Both deps + code                                                 | `dependencies-only` (dependency match wins — code path is an `elif`) |
| Neither                                                          | security skipped                                                     |
| `merge_group` or `schedule`                                      | always `comprehensive`                                               |
| PR labeled `security-scan`                                       | forced `comprehensive`                                               |

> **Note**: SAST is expensive (10–20 min) and `comprehensive` scans do not occur during normal PR runs. PRs receive at most `dependencies-only` or `secrets-only` scanning unless explicitly labeled `security-scan`. `merge_group` and scheduled runs always use `comprehensive`.

### Runner Security (LS-1652)

The `resolve-runner-label` action checks whether the PR author has write permission. External contributors (read-only forks) are routed to GitHub-hosted runners to prevent untrusted code from executing on self-hosted infrastructure.

### Failure Handling

- `remove-merge-label-on-failure` fires when `ci-pipeline.outputs.overall-status == 'failure'`. It removes the `merge-when-ready` label and posts a comment explaining why, forcing conscious re-addition after fixes.

### Edge Cases

- **Push to `develop`**: `ci-pipeline` and `security-scanning` jobs are skipped on any `push` event (`if: github.event_name != 'push'`). The orchestrator only listens to `push` on `develop`; code merged to `main` was already validated by the PR CI run. Deployment workflows run independently.
- **Zero-SHA base ref** (`0000000000000000000000000000000000000000`): treated as empty; falls back to `git rev-parse HEAD^`.
- **`workflow_call` permissions bug (LS-106)**: the orchestrator must declare ALL permissions required by any called workflow. Reducing these causes `startup_failure` in called workflows even if those workflows declare their own permissions — a GitHub Actions platform limitation.

---

## 4. CI Pipeline

**File**: [`.github/workflows/ci-pipeline.yml`](.github/workflows/ci-pipeline.yml)  
Called from the orchestrator via `workflow_call`.

### Job Architecture

```
detect-changes
  │
  ├──► quality-gates    (parallel)   → lint, typecheck, test, format, migration immutability
  └──► build-validation (parallel)   → web build, mobile build, lambda build, terraform plan
           │
           └──► e2e                  → Playwright @critical tests (1 shard, excludes @slow)
                    ├──► deploy-playwright-report → publishes Playwright report artifacts
                    └──► summarize               → aggregates results, posts PR comment, sets overall-status output
```

### Custom Actions Used

| Action                             | Purpose                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `.github/actions/setup`            | Node.js + pnpm + Nx SHA setup, validates pnpm-only env                                                       |
| `.github/actions/detect-changes`   | Outputs `web`, `mobile`, `lambdas`, `terraform`, `e2e`, `api-surface`, `dependencies`, `affected-components` |
| `.github/actions/execution-plan`   | Generates strategy (skip/run/partial) based on detected changes                                              |
| `.github/actions/quality-gates`    | Parallel: format, lint, typecheck, test, migration check                                                     |
| `.github/actions/build-validation` | Parallel: web/mobile/lambda/terraform builds, artifact verification                                          |
| `.github/actions/e2e-testing`      | Playwright orchestration with sharding                                                                       |
| `.github/actions/ci-reporting`     | Generates PR comment with CI report; posts failure analysis                                                  |
| `.github/actions/nx-cache`         | Nx remote cache via GitHub Actions cache API                                                                 |
| `.github/actions/s3-artifact`      | S3 artifact upload/download                                                                                  |

### Status Check Names (registered in ruleset)

- `Quality Gates` — must pass for merge
- `Build Validation` — must pass for merge

### Overall Status Output

The `summarize` job sets `overall-status` (`success` | `failure`) as a workflow output. The orchestrator's `remove-merge-label-on-failure` job reads this.

> **Historical note (LS-1115)**: internal jobs used `if: always()` which caused `workflow_call` result to always report `failure`. Fixed by replacing with `if: !cancelled()`. The explicit `overall-status` output is an additional safety net.

### Nx Affected Scope

`detect-changes` and `execution-plan` use Nx SHAs (base = merge base against `origin/main`) to scope all tasks to affected projects only. Unrelated projects are skipped automatically.

---

## 5. Security Scanning

**File**: [`.github/workflows/security-scanning.yml`](.github/workflows/security-scanning.yml)

### Scan Types

| Type                | Tools                                                                                    | When                                            |
| ------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `comprehensive`     | CodeQL + OSV Scanner + GitLeaks + manual secret-pattern checks (+ Snyk on non-PR events) | `merge_group`, scheduled, `security-scan` label |
| `dependencies-only` | OSV Scanner (+ Snyk on non-PR events)                                                    | `package.json`/`pnpm-lock.yaml` changed on PR   |
| `sast-only`         | CodeQL                                                                                   | manual dispatch                                 |
| `secrets-only`      | GitLeaks + manual secret-pattern checks                                                  | code files changed on PR                        |

SARIF output is retained as a workflow artifact. CodeQL is configured with `upload: false`, so results are **not** published to the GitHub Security tab — `security-events: write` is declared in the workflow but SARIF publication is disabled.

---

## 6. Bot-Review State Machine

This is the most architecturally complex part of the system.

### Two Writers, Disjoint Event Sources

The bot-review check is written by two separate components that never conflict because they handle disjoint event sources:

| Component                             | Trigger                                               | Event source       |
| ------------------------------------- | ----------------------------------------------------- | ------------------ |
| **Webhook Lambda** (not in this repo) | `pull_request` lifecycle, human `pull_request_review` | Repository webhook |
| **`copilot-review-handler.yml`**      | `workflow_run` on "Copilot code review" completion    | GitHub Actions     |

The Lambda sets the check run to `in_progress` when a PR is opened; the workflow handler sets it to `completed` (success/failure) after Copilot finishes.

### Why `workflow_run` Instead of Webhooks

Copilot (a GitHub App) does not emit standard `pull_request_review` webhook events — only App-to-App events that never reach repository webhooks. `workflow_run` is the only trigger that fires in the default-branch context (where secrets are available) after the Copilot review workflow completes.

**File**: [`.github/workflows/copilot-review-handler.yml`](.github/workflows/copilot-review-handler.yml)

### Copilot Login Set

The handler recognizes three Copilot identities (must stay in sync with the Lambda handlers):

```javascript
const COPILOT_LOGINS = new Set([
  'copilot-pull-request-reviewer',
  'copilot-pull-request-reviewer[bot]',
  'Copilot',
]);
```

### State Machine — Step by Step

```
workflow_run completed (Copilot code review)
        │
        ▼
1. Resolve PR number
   - workflow_run.pull_requests is always empty for Copilot reviews
     (triggered by internal App machinery, not a pull_request event)
   - Falls back to repos.listPullRequestsAssociatedWithCommit(headSha)
   - Filters: open PRs, same repo, matching headSha
   - If multiple matches: newest updated_at wins (lowest number as tiebreak)
   - If zero matches: skip silently
        │
        ▼
2. Find latest Copilot review for exact SHA
   - Polls pulls.listReviews up to 6 times (5s interval = 30s max)
   - workflow_run.completed can fire before GitHub persists the review to REST API
   - If not found after retries: skip silently
        │
        ▼
3. Determine copilotCleared
   - true when: state === 'APPROVED'
   - true when: body includes "wasn't able to review any files"
   - true when: body includes "generated no new comments"
   - false otherwise (COMMENTED, CHANGES_REQUESTED, etc.)
        │
        ▼
4. Fetch all review threads (paginated GraphQL)
   - 100 threads per page, up to 1000 total
   - If >1000 threads: set bot-review=failure as safe default
        │
        ▼
5. Filter unresolved threads
   - Exclude: isResolved === true
   - Exclude: isOutdated === true
   - When copilotCleared: also exclude threads authored by COPILOT_LOGINS
     (Copilot's own threads are superseded when it clears the review)
   - When !copilotCleared: Copilot threads still block
        │
        ▼
6. Set bot-review check run
   - unresolved.length > 0  → conclusion='failure', title='Review blocked'
   - unresolved.length === 0 → conclusion='success', title='Copilot review passed'
        │
        ▼
7. On success: add 'merge-when-ready' label
   (auto-queues the PR for merge if all other checks also pass)
```

### Check Run Authorship Caveat

The `copilot-review-handler.yml` uses `GITHUB_TOKEN` (github-actions app), while the Lambda uses the Review Bot App token. GitHub only allows a check run to be updated by the same app that created it. Therefore the handler always **creates a new** check run rather than patching the Lambda's `in_progress` run. GitHub uses the latest result for required status checks, so this correctly reflects current state even though the Lambda's run remains open.

### Copilot Review Instructions

**File**: [`.github/copilot-instructions.md`](.github/copilot-instructions.md)

Copilot is configured to:

- Use a **full-diff-first protocol**: read every file before writing any comment
- Submit a single comprehensive review (drip-feeding across rounds is treated as a process failure)
- Follow a three-tier priority system (Tier 1: security/data integrity/logic; Tier 2: error handling/type safety/test gaps; Tier 3: clarity/DRY)
- Never comment on formatting, import ordering, or style (handled by automated tooling)
- Never comment on hypothetical future issues or single-use abstractions

### Edge Cases

- **Fork PRs**: skipped via `if: github.event.workflow_run.head_repository.full_name == github.repository`. The Lambda has an additional fork-PR guard.
- **Copilot submits COMMENTED with only a PR-overview comment (no inline threads)**: `copilotCleared` remains false, but the thread check will still pass if there are no actual thread comments — the check proceeds to success.
- **Race condition on review API persistence**: handled by the 6-attempt / 30s retry loop in step 2.
- **Outdated threads**: treated as resolved — they are from a previous commit and do not block the current state.
- **>1000 review threads**: fails conservatively to prevent silent incorrect approvals.

---

## 7. Merge Conflict Detection

**File**: [`.github/workflows/check-conflicts.yml`](.github/workflows/check-conflicts.yml)

### Behavior

- Triggers on `pull_request` (opened, synchronize, reopened)
- Per-PR concurrency group with `cancel-in-progress: true`
- Polls `pulls.get` up to 10 times (5s interval = 50s max) because GitHub computes `mergeable` lazily
- **Conflict detected** (`mergeable === false`): adds `CI: Conflicts` label, fails check
- **No conflict** (`mergeable === true`): removes `CI: Conflicts` label if present
- **Timeout** (`mergeable === null` after 10 attempts): fails conservatively with instructions to re-run

### Edge Cases

- **Label already removed between fetch and removal**: `removeLabel` 404 is caught and logged as a warning (not re-thrown) to prevent spurious failures.
- **Rate limiting**: label add/remove operations use exponential backoff (1s → 2s → 4s, 3 retries) for both 429 and 403 secondary rate limit responses.
- **Stale label from previous force-push**: removing the stale `CI: Conflicts` label on `synchronize` events ensures the label state always reflects the current commit.

---

## 8. Merge Queue

**File**: [`.github/workflows/merge-queue.yml`](.github/workflows/merge-queue.yml)  
**Processor script**: `.github/scripts/merge-queue-processor.js`

### Triggers

| Trigger                          | Condition                                       |
| -------------------------------- | ----------------------------------------------- |
| `pull_request: labeled`          | label = `merge-when-ready` or `merge-to-parent` |
| `pull_request: unlabeled`        | label = `merge-when-ready` or `merge-to-parent` |
| `pull_request_review: submitted` | any review                                      |
| `workflow_run: completed`        | CI Orchestrator, branches ≠ main                |
| `workflow_dispatch`              | manual (dry-run and force-check options)        |

### Concurrency

```yaml
group: merge-queue
cancel-in-progress: false
```

`cancel-in-progress: false` is intentional. With multiple CI runs completing within seconds, triggers pile up. The single concurrency group serializes runs: one executes while one queues; any further arrivals replace the queued slot. A 30-second debounce sleep on `workflow_run` and `pull_request_review` triggers allows concurrent triggers to settle, so when the active run finishes only the most recent trigger executes (scanning all merge-ready PRs fresh).

### Authentication

The merge queue uses a GitHub App token (`MERGE_QUEUE_APP_ID` + `MERGE_QUEUE_APP_PRIVATE_KEY` secrets) rather than `GITHUB_TOKEN` to perform merges, giving it `contents: write` permission without requiring a PAT.

### Merge Conditions

A PR is eligible for merge when ALL of the following are true:

1. Has `merge-when-ready` label
2. For non-main base branches: also has `merge-to-parent` label
3. All required status checks pass (`Quality Gates`, `Build Validation`, `bot-review`, `No Merge Conflicts`)
4. No merge conflicts
5. No unresolved review comments
6. Required review approvals met (≥1)

### Comment Automation

The merge queue posts comments on label events:

| Event                                        | Comment                                              |
| -------------------------------------------- | ---------------------------------------------------- |
| `merge-when-ready` added                     | "🚀 Added to merge queue!" with conditions list      |
| `merge-when-ready` removed                   | "⏹️ Removed from merge queue."                       |
| `merge-to-parent` added on non-main PR       | Note that both labels are required                   |
| `merge-to-parent` added on main-targeting PR | Clarification that only `merge-when-ready` is needed |
| `merge-to-parent` removed on non-main PR     | Warning that both labels are required                |

### Edge Cases

- **`synchronize` / `reopened` intentionally not triggers**: these fire before CI registers check runs on the new SHA. Using them would cause `validateStatusChecks` to see an empty check list and incorrectly conclude all checks are passing — merging the PR before CI has even started. The `workflow_run` trigger handles re-evaluation once CI finishes.
- **`pull_request_review_thread` not supported as a GitHub Actions trigger**: resolving a thread without an accompanying review submission creates a gap. Covered by manual `workflow_dispatch` and by the `workflow_run` re-trigger on the next CI Orchestrator completion.
- **CI failure auto-removes `merge-when-ready`**: the orchestrator's `remove-merge-label-on-failure` job removes the label and posts a comment. The author must consciously re-add it after fixing failures.

---

## 9. Branch Protection Ruleset

**File**: [`.github/ruleset.json`](.github/ruleset.json)  
**Applied via**: `scripts/apply-ruleset.sh`

### Protected Branch: `main`

| Rule                   | Configuration                                           |
| ---------------------- | ------------------------------------------------------- |
| Non-fast-forward       | Prevents force pushes — history is linear and immutable |
| Deletion               | Prevents branch deletion                                |
| Pull request required  | 1 approving review; stale reviews dismissed on push     |
| Required status checks | Strict (branch must be up to date with base)            |

### Required Status Checks

| Check name           | Set by                                        | Meaning                                                         |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `Quality Gates`      | `ci-pipeline.yml` / `quality-gates` action    | Lint, typecheck, unit tests, formatting, migration immutability |
| `Build Validation`   | `ci-pipeline.yml` / `build-validation` action | Full project build (apps + lambdas)                             |
| `bot-review`         | `copilot-review-handler.yml`                  | Copilot has reviewed and all threads are resolved               |
| `No Merge Conflicts` | `check-conflicts.yml`                         | No merge conflicts with base branch                             |

### Bypass Actors

Repository admins only (`actor_id: 5`, `actor_type: RepositoryRole`, `bypass_mode: always`). For emergency hotfixes.

---

## 10. Dependabot Automation

**File**: [`.github/dependabot.yml`](.github/dependabot.yml)

### Update Schedules

| Ecosystem      | Schedule                       | Max open PRs |
| -------------- | ------------------------------ | ------------ |
| NPM            | Weekly Mondays 09:00 UTC       | 3            |
| GitHub Actions | Weekly Tuesdays 09:00 UTC      | 2            |
| Docker         | Monthly first Monday 09:00 UTC | 1            |

### Ecosystem Groupings (NPM)

| Group                    | Packages                          | Semver                                                   |
| ------------------------ | --------------------------------- | -------------------------------------------------------- |
| `typescript-eslint`      | ESLint + TypeScript ecosystem     | minor/patch only                                         |
| `react-ecosystem`        | React + React DOM + types         | minor/patch only                                         |
| `react-native-ecosystem` | React Native + Expo               | patch only                                               |
| `nx-ecosystem`           | All `@nx/*` packages              | includes major (intentional — peer dep sync)             |
| `jest-ecosystem`         | Jest + related                    | minor/patch only                                         |
| `apollo-ecosystem`       | GraphQL + Apollo + Postgraphile   | minor/patch only                                         |
| `storybook-ecosystem`    | Storybook                         | minor/patch only                                         |
| `tamagui-ecosystem`      | Tamagui                           | patch only                                               |
| `aws-ecosystem`          | AWS SDK                           | minor/patch only                                         |
| `playwright-ecosystem`   | Playwright                        | minor/patch (exact-pinned in `package.json` per LS-2429) |
| `dev-tools`              | TypeScript, Prettier, build tools | minor/patch only                                         |

### Major Version Ignores

Major-version ignores are **package-specific**, not ecosystem-wide. Ignored packages: `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint`, `react`, `react-dom`, `react-native`, `jest`, `expo`, `@storybook/react`, and `@storybook/react-vite`. Metro packages (`metro`, `metro-config`, `@expo/metro-config`, `@expo/cli`, `@react-native/metro-config`) are pinned against both major and minor bumps for Expo SDK 53 / React Native 0.79.6 compatibility.

`nx-ecosystem` is **not** major-ignored — it explicitly includes `major` updates so all `nx` + `@nx/*` + `@nrwl/*` packages move together in one PR, preventing peer-dep splits (see PR #2284).

### Lockfile Fix Automation

**File**: [`.github/workflows/dependabot-lockfile-fix.yml`](.github/workflows/dependabot-lockfile-fix.yml)  
Automatically fixes Dependabot-created PRs that have lockfile drift (missing `pnpm-lock.yaml` update).

---

## 11. Infrastructure & Runner Management

### Self-Hosted Runner Fleet

| Workflow                     | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `runner-terraform-apply.yml` | Manages runner fleet infrastructure via Terraform (`terraform/runners/`) |
| `rebuild-runner-ami.yml`     | Builds new runner AMIs with Packer when base config changes              |
| `runner-ami-drift-check.yml` | Detects divergence between Packer config and running AMIs                |
| `prune-runner-amis.yml`      | Cleans up obsolete AMIs to control storage costs                         |

### Lambda Infrastructure

| Workflow                     | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `lambda-terraform-apply.yml` | Applies Terraform changes for Lambda infrastructure (`terraform/main/`) |
| `deploy.yml`                 | Lambda app deployment orchestration                                     |
| `upload-lambdas.yml`         | Uploads Lambda function zips to S3                                      |
| `lambda-health-checks.yml`   | Verifies Lambda function health status post-deploy                      |
| `rollback.yml`               | Rolls back to a previous Lambda deployment                              |

### Web Deployment

| Workflow                | Purpose                     |
| ----------------------- | --------------------------- |
| `deploy-web.yml`        | Web app deployment          |
| `deploy-pr-preview.yml` | Per-PR preview environments |
| `deploy-storybook.yml`  | Storybook static deployment |

### CI Runner Label Resolution

`.github/actions/resolve-runner-label` reads `vars.CI_RUNNER_LABEL` from repository variables. If the PR author lacks write permission (external contributor), the action returns `ubuntu-latest` instead to keep untrusted code off self-hosted infrastructure.

---

## 12. Custom GitHub Actions Library

All actions live in `.github/actions/`.

### Core Infrastructure

| Action                 | Key behavior                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `setup`                | Validates pnpm-only env (fails if npm/yarn used), configures Node/pnpm/Nx SHAs, includes Tamagui postinstall fix |
| `nx-cache`             | Nx remote cache backed by GitHub Actions cache API                                                               |
| `resolve-runner-label` | Security-aware runner label selection                                                                            |
| `s3-artifact`          | S3 upload/download with AWS OIDC auth                                                                            |
| `collect-results`      | Aggregates status across parallel jobs                                                                           |

### Change Detection

| Action           | Outputs                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `detect-changes` | `web`, `mobile`, `lambdas`, `terraform`, `e2e`, `api-surface`, `dependencies`, `affected-components` |
| `execution-plan` | Per-subsystem strategy (skip / run / partial)                                                        |

### Validation

| Action             | What it validates                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `quality-gates`    | Format, lint, typecheck, tests, migration immutability — parallel execution, per-project failures |
| `build-validation` | Web, mobile, lambda, Terraform builds; artifact size verification                                 |
| `e2e-testing`      | Playwright with grep patterns, shard configuration, hermetic route fulfillment                    |
| `deployment-gate`  | Pre-deployment checks (health, migration state, etc.)                                             |

### Reporting & Notifications

| Action                                                            | Purpose                                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `ci-reporting`                                                    | Generates comprehensive PR comment with failure analysis; manages PR labels |
| `discord-notify`                                                  | Discord webhook notifications                                               |
| `rollbar-deploy`                                                  | Tracks deployments in Rollbar                                               |
| `update-badges`, `update-deployment-badge`, `update-health-badge` | README/docs status badges                                                   |

---

## 13. Label Taxonomy

Labels written or consumed by CI automation:

| Label              | Set by                                                            | Cleared by                                  | Meaning                                            |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| `merge-when-ready` | Copilot review handler (on `bot-review` success), author manually | Orchestrator on CI failure, author manually | PR is queued for merge                             |
| `merge-to-parent`  | Author manually                                                   | Author manually                             | Required for non-main-targeting PRs in merge queue |
| `CI: Conflicts`    | `check-conflicts.yml`                                             | `check-conflicts.yml`                       | Branch has merge conflicts                         |
| `CI: Security`     | `ci-orchestrator.yml` label-pr job                                | `ci-orchestrator.yml` label-pr job          | Security scan failed                               |
| `security-scan`    | Author manually                                                   | Author manually                             | Forces comprehensive security scan on any PR       |

---

## 14. Permission Model

### Orchestrator Permissions

```yaml
permissions:
  actions: read # workflow run queries
  contents: read # checkout
  pull-requests: write # PR comments
  checks: read # status check queries
  issues: write # issue creation on failures
  security-events: write # SARIF uploads
  statuses: write # commit status updates
  id-token: write # OIDC auth to AWS
```

> The orchestrator must declare all permissions required by any called workflow. Per GitHub Actions platform behavior: `workflow_call` inherits the calling workflow's permissions, so reducing them causes `startup_failure` in called workflows even if those workflows declare their own permissions (LS-106).

### Copilot Review Handler Permissions

```yaml
permissions:
  checks: write # create bot-review check run
  issues: write # add merge-when-ready label
  contents: read
  pull-requests: write # read reviews, read threads via GraphQL
```

### Merge Queue Permissions

```yaml
permissions:
  contents: write # merge PRs
  pull-requests: write # update PR state
  issues: write # manage labels and comments
  checks: read # read status check results
  statuses: read # read commit statuses
  actions: write # self-dispatch for retry
```

### Reviewer Identity & Token Strategy

The review/bot-review path uses three distinct token identities, each scoped to its component:

| Component                       | Token                | Identity              | Notes                                                                                                                                                  |
| ------------------------------- | -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `copilot-review-handler.yml`    | `GITHUB_TOKEN`       | `github-actions[bot]` | Default Actions token; has `checks:write`, `issues:write`, `pull-requests:write` — no external secret needed                                           |
| Webhook Lambda                  | Review Bot App token | Review Bot GitHub App | Generated from the Review Bot private key read from AWS Secrets Manager via `BOT_APP_PRIVATE_KEY_SECRET_NAME`; infra syncs `BOT_APP_PRIVATE_KEY` there |
| Future CopilotCLI provider (T7) | Review Bot App token | Review Bot GitHub App | Reuses the existing app; no new service-account user or fine-grained PAT required                                                                      |

**Design decision (LS-3860)**: No dedicated service-account GitHub user with a Copilot seat is provisioned. The planned CopilotCLI integration (T7) will authenticate using the existing Review Bot GitHub App token (`BOT_APP_PRIVATE_KEY` secret) rather than a new user-level PAT. This avoids creating an additional managed GitHub identity and eliminates ongoing seat-management overhead.

Workflows that need to call the Copilot API on behalf of the bot should generate a short-lived installation token via `actions/create-github-app-token` using the Review Bot App credentials. This is the same token-generation pattern used elsewhere in the repo, but with component-specific GitHub App credentials: for example, the merge queue uses `MERGE_QUEUE_APP_ID` / `MERGE_QUEUE_APP_PRIVATE_KEY`, and the Copilot Coding Agent setup steps use `AGENT_AUTHOR_APP_PRIVATE_KEY`. If the Copilot API enforces user-seat requirements that reject App installation tokens, the AnthropicProvider (T8) serves as the primary fallback provider.

---

## 15. Edge Cases & Known Limitations

### Timing & Race Conditions

| Scenario                                                            | Mitigation                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| CI Orchestrator cancels while merge queue is processing             | `cancel-in-progress: false` on merge queue; 30s debounce       |
| Copilot review API not yet available when `workflow_run` fires      | 6-attempt / 30s retry loop in review handler                   |
| GitHub's lazy mergeability computation                              | 10-attempt / 50s polling in conflict detector                  |
| Multiple open PRs with same head SHA                                | Sorted by `updated_at` desc, then lowest PR number as tiebreak |
| Merge queue `workflow_run` trigger fires before CI registers checks | `synchronize` intentionally omitted from merge queue triggers  |

### Bot-Review Check Run Ownership

GitHub only allows a check run to be updated by the app that created it. The Lambda creates the initial `in_progress` run; the workflow handler cannot patch it and instead creates a new `completed` run. GitHub uses the latest check run for required status check evaluation. The Lambda's run remains open indefinitely — this is expected behavior, not a bug.

### Fork PR Handling

- CI Orchestrator: runs fork PRs on GitHub-hosted runners (untrusted code protection, LS-1652)
- Copilot review handler: skips fork PRs entirely (different repository, workflow_run won't trigger)
- Lambda: separate fork-PR guard

### Thread Resolution Gap

`pull_request_review_thread` is not a supported GitHub Actions trigger. If a user resolves a thread without submitting a review, the merge queue is not re-triggered automatically. The gap is covered by:

1. Manual `gh workflow run merge-queue.yml` dispatch
2. The `workflow_run` trigger on the next CI Orchestrator completion (which fires on any new push)

### Nx Affected Scope

Affected-only execution means: if a change touches only `apps/web`, lambda builds and mobile builds are skipped. This dramatically reduces CI time but means cross-project integration issues are only caught when shared library changes are detected via `api-surface` or `dependencies` outputs from `detect-changes`.

### `make pc` Formatting Auto-Amend

The auto-amend in step 5 modifies the most recent local commit. If the previous commit was already pushed to the remote, a subsequent `git push` will require `--force-with-lease`. Agents should always run `make pc` before pushing, not after.

### Workflow YAML Linting

`scripts/validate-workflows.js` and `.github/actionlint.yaml` validate workflow YAML. This runs as step 7 of `make pc` when workflow files change, and is also enforced in CI's `quality-gates` action. The `actionlint` config is also at `.actionlint.yaml` (root) for CLI tooling.

### Security Scan SAST Restriction

SAST (CodeQL) is intentionally excluded from normal PR runs because it takes 10–20 minutes. It runs on `merge_group` (every PR entering the merge queue gets one full scan before final merge), on the weekly schedule, and on manual dispatch. This means a PR can pass CI and enter the merge queue without SAST having run — SAST is the final gate, not a pre-review gate.

---

## 16. Workflow Interaction Diagram

```
PR opened/updated (push to branch)
│
├─── check-conflicts.yml ──────────────────────────────────────────────►  "No Merge Conflicts" check
│        polls mergeability (up to 50s), manages "CI: Conflicts" label
│
├─── ci-orchestrator.yml ─────────────────────────────────────────────►  determines scope
│        │
│        ├──► ci-pipeline.yml (workflow_call) ──────────────────────────►  "Quality Gates" check
│        │        quality-gates action (lint/typecheck/test/format)          "Build Validation" check
│        │        build-validation action (web/mobile/lambda/tf)             PR comment with report
│        │        e2e-testing action (@critical, 1 shard)
│        │        ci-reporting action
│        │
│        ├──► security-scanning.yml (conditional) ───────────────────►   SARIF artifact retained
│        │
│        ├──► label-pr job ───────────────────────────────────────────►   "CI: Security" label
│        │
│        └──► remove-merge-label-on-failure job ─────────────────────►   removes "merge-when-ready"
│                                                                          posts failure comment
│
└─── [GitHub App: Copilot code review] ──── GitHub internal machinery
          │
          ▼  (workflow_run completed)
     copilot-review-handler.yml
          resolves PR from headSha
          retries review API (up to 30s)
          paginates review threads (GraphQL)
          filters unresolved non-Copilot threads
          │
          ├── unresolved > 0 ───────────────────────────────────────►  "bot-review" = failure
          │
          └── unresolved == 0 ─────────────────────────────────────►  "bot-review" = success
                                                                         adds "merge-when-ready" label
                                                                         │
                                                                         ▼
                                                                    merge-queue.yml (labeled trigger)
                                                                         posts "Added to queue" comment
                                                                         debounce 30s
                                                                         merge-queue-processor.js
                                                                         │
                                                                         ├── any check failing ──► wait
                                                                         └── all checks green ──► merge
```

---

## Appendix: File Reference

| Purpose                      | Path                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| CI orchestrator              | `.github/workflows/ci-orchestrator.yml`                            |
| CI pipeline                  | `.github/workflows/ci-pipeline.yml`                                |
| Copilot review handler       | `.github/workflows/copilot-review-handler.yml`                     |
| Merge queue                  | `.github/workflows/merge-queue.yml`                                |
| Conflict checker             | `.github/workflows/check-conflicts.yml`                            |
| Security scanning            | `.github/workflows/security-scanning.yml`                          |
| Branch protection ruleset    | `.github/ruleset.json`                                             |
| Apply ruleset script         | `scripts/apply-ruleset.sh`                                         |
| Copilot review instructions  | `.github/copilot-instructions.md`                                  |
| Dependabot config            | `.github/dependabot.yml`                                           |
| Pre-commit Makefile          | `Makefile`                                                         |
| Change classifier            | `scripts/classify-changes.js`                                      |
| Workflow YAML validator      | `scripts/validate-workflows.js`                                    |
| Migration immutability check | `scripts/check-migration-immutability.js`                          |
| Merge queue processor        | `.github/scripts/merge-queue-processor.js`                         |
| Nx config                    | `nx.json`                                                          |
| PR lifecycle skill           | `.agents/skills/pr-lifecycle/SKILL.md`                             |
| Common review patterns       | `.agents/skills/pr-lifecycle/references/common-review-patterns.md` |
| Self-review checklist        | `.agents/skills/pr-lifecycle/references/self-review.md`            |
