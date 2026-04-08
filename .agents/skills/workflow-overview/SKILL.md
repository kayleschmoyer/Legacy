---
name: workflow-overview
description: Complete ticket-to-merge workflow documentation covering all phases, validation gates, CI pipelines, and automation
---

# Skill: Workflow Overview

Complete reference for the Legacy Sports ticket-to-merge pipeline. Covers every phase from Jira ticket creation through post-merge deployment, including validation gates, CI automation, and separation of duties.

## Phase 0: Ticket & Worktree Setup

1. **Create or identify the Jira ticket** (e.g. `LS-####`). Use `jira_create_ticket` with `sprint: "current"` to add it to the active sprint.
2. **Blocker check** -- inspect the ticket for "blocked-by" links:
   - Blocker not In Review or Done -- **STOP**. Do not proceed.
   - Blocker In Review -- branch off the blocker's branch (use `PARENT=LS-XXXX/branch`).
   - Blocker Done or no blockers -- branch off `origin/main`.
3. **Transition to In Progress** -- only after blockers pass.
4. **Create worktree (Windows-only helper)** -- `make worktree TICKET=#### DESC=description`. This creates the branch, worktree, and registers the parent dependency. On macOS/Linux, create a ticket branch and worktree using standard `git` commands.
5. **Setup worktree (Windows-only helper)** -- `make wt-setup WT=$wt` (installs deps, copies `.env`, junctions `.twig`). On macOS/Linux, run the equivalent steps manually: install dependencies, copy `.env`, and link shared resources.
6. **Working directory** -- All subsequent work happens inside the worktree path, never in the main repo.

## Phase 1: Local Validation

Three local validation gates run before code reaches CI.

### Pre-Commit Hook (5 checks)

Installed via `pnpm security:install-hooks` (copies `scripts/git-hooks/pre-commit` into `.git/hooks/pre-commit`). Runs automatically on `git commit`:

| #   | Check                               | Purpose                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Secret validation                   | Scans staged files for accidentally committed secrets                                |
| 2   | YAML linting                        | Validates syntax of staged `.yml`/`.yaml` files (via `yamllint`)                     |
| 3   | JSON linting                        | Validates syntax of staged `.json` files (via `jsonlint`)                            |
| 4   | Migration immutability              | Ensures previously-landed migrations are not modified or deleted                     |
| 5   | `@legacy-sports` package validation | Prevents npm-installing workspace packages that should use pnpm workspace references |

### `make pc` (pre-commit pipeline)

The full pre-commit validation pipeline backed by the `pre-commit` Makefile target. **Must pass before pushing or opening a PR.**

1. Migration immutability check (ensures previously-landed migrations are not modified or deleted)
2. Schema generation for database changes (`nx run db:print-schema`)
3. DB code generation for database changes (`nx affected -t codegen`)
4. `nx affected -t typecheck` -- TypeScript type checking on affected projects
5. `nx format:write` -- auto-formats code; if the working tree was clean, it will format and auto-amend the commit, otherwise you must commit the formatted files and re-run
6. `nx affected -t lint --fix` -- ESLint on affected projects with auto-fix where possible
7. Workflow validation (`scripts/validate-workflows.js`)
8. `nx affected -t test` -- Jest unit/integration tests on affected projects
9. `nx affected -t build` -- build validation on affected projects

Some steps are conditionally skipped (e.g., steps 1-3 for non-database changes, steps 4/6/8/9 for docs-only changes).

### Pre-Push Hook (format & safety checks)

Installed via `make setup-hooks`, which copies `.github/hooks/pre-push` (shell) into your Git hooks directory as `pre-push`. Runs automatically on `git push`:

| #   | Check / Behavior                            | Purpose                                                                      |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | git-lfs integration                         | Ensures large files are handled via Git LFS where required                   |
| 2   | Conflict marker scan \*                     | Prevents pushing files that still contain unresolved merge conflict markers  |
| 3   | Conditional `terraform validate` \*         | Validates Terraform when Terraform files are part of the push                |
| 4   | `nx format:write` \*                        | Auto-formats code before push                                                |
| 5   | Auto-amend + abort on formatting changes \* | Amends the last commit with formatting changes and aborts the push to review |

\* Checks 2--5 only run when `node_modules` is present (i.e., a non-docs-only worktree). In docs-only worktrees without dependencies, the pre-push hook exits after the git-lfs integration step and skips checks 2--5.

Can be bypassed with `--no-verify`.

## Phase 2: PR Creation

1. **Self-review** -- run the `/review` skill to catch project-rule violations before pushing.
2. **Push** -- `worktree_push(setUpstream: true)`.
3. **Create draft PR** -- `github_create_pr(draft: true)`. Draft-first prevents sweep/review agents from racing with the creating agent.
4. **Apply `agent-in-progress` label** -- `github_manage_labels(number: <PR#>, add: ["agent-in-progress"])` while still a draft, before marking ready. This closes the race window.
5. **Mark ready for review** -- `github_mark_pr_ready(number: <PR#>)`.
6. **Copilot review** -- For user-authored PRs, the repository ruleset automatically requests Copilot review; no explicit call is needed. For GitHub App-authored PRs, agents should call `github_request_review(number: <PR#>)` with a user OAuth token. Note: the REST `requestReviewers` API silently drops Copilot when called with `GITHUB_TOKEN` or installation tokens.
7. **Transition Jira to In Review** -- `jira_transition(key: "LS-####", status: "In Review")`.

## Phase 3: CI Pipeline

### Orchestrator Flow (`ci-orchestrator.yml`)

The orchestrator is the entry point for all PR CI. It dispatches reusable workflows:

```
pull_request (opened/synchronize/reopened)
        |
  determine-scope
    |            |
ci-pipeline   security-scanning (conditional)
    |
  label-pr (on failure)
  remove-merge-label-on-failure (on failure)
```

**Triggers:** `pull_request`, `push` (develop), `merge_group`, `schedule` (weekly security + nightly E2E), `workflow_dispatch`.

**Concurrency:** `orchestrator-{PR#}` with `cancel-in-progress: true` -- new pushes cancel in-flight runs.

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
- Prettier formatting check (`pnpm exec prettier --check --ignore-unknown ...`)
- `nx affected -t lint`
- `nx affected -t typecheck`
- `nx affected -t test`

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

**Stage 3b -- Deploy Playwright Report:** Merges shard reports and deploys to GitHub Pages (`bkrupa/legacy-sports-deploys`).

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

## Phase 4: Copilot Review

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

## Phase 5: Jira Branch Sync (`jira-branch-sync.yml`)

Automatically keeps Jira ticket statuses in sync with branch/PR activity.

### Transition Table

| Event                               | Action | Jira Transition |
| ----------------------------------- | ------ | --------------- |
| `push` to `LS-*/...` branch         | --     | In Progress     |
| `pull_request` opened               | --     | In Review       |
| `pull_request` reopened             | --     | In Review       |
| `pull_request` closed + merged      | --     | Done            |
| `pull_request` closed without merge | --     | In Progress     |

### Epic Sync

After transitioning the child ticket, the workflow also syncs the parent epic status based on the aggregate state of all its children:

| Children State                       | Epic Transition |
| ------------------------------------ | --------------- |
| Any child In Progress/In Review/Done | In Progress     |
| All children In Review or Done       | In Review       |
| All children Done                    | Done            |

Epics with the Jira label `pinned-status` are excluded from automatic transitions.

**Authentication:** Atlassian OAuth 2.0 (client credentials grant) via `JIRA_CREDENTIALS` secret.

## Phase 6: Merge Queue (`merge-queue.yml`)

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

## Phase 7: Post-Merge

### Deploy Workflows

| Workflow                     | Trigger                                             | Targets                                   |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `deploy-web.yml`             | Push to `main` (web/shared-components paths)        | GitHub Pages (legacy-fantasy.com)         |
| `upload-lambdas.yml`         | Push to `main` (lambda paths)                       | S3 artifact upload for Lambda deployment  |
| `lambda-terraform-apply.yml` | workflow_run: "Upload Lambdas" (on main) + dispatch | Terraform apply + Lambda function updates |
| `deploy-storybook.yml`       | Push to `main` (component paths)                    | GitHub Pages (Storybook)                  |
| `deploy-pr-preview.yml`      | PR events                                           | Preview deployments for PRs               |

### PR Preview Deployments

`deploy-pr-preview.yml` deploys web builds for open PRs to the `gh-pages` branch of `bkrupa/legacy-sports-deploys`. Previews live at **subdirectory paths**, not separate branches:

```
https://bkrupa.github.io/legacy-sports-deploys/pr-<N>/
```

where `<N>` is the numeric PR number (e.g. `pr-2317/`).

**Agents: do not list branches of `legacy-sports-deploys` to check for a preview.** There is no `pr-<N>` branch — previews are paths inside `gh-pages`. The correct way to reference or verify a preview:

- **Construct the URL directly** — if the preview deploy job ran and succeeded, the preview is there: `https://bkrupa.github.io/legacy-sports-deploys/pr-<N>/` (replace `<N>` with the PR number). Note: the preview only exists if `apps/web`, `lib/shared-components`, or `lib/ui-abstractions` were changed — CI can pass without the preview job running.
- **Verify deployment via the gh-pages tree** (if you must confirm a path exists; replace `<N>` with the PR number):
  ```bash
  PR=2317  # replace with actual PR number
  gh api "repos/bkrupa/legacy-sports-deploys/git/trees/gh-pages?recursive=1" \
    --jq ".tree[] | select(.path | startswith(\"pr-${PR}/\")) | .path" | head -5
  ```
- **Playwright reports** for a PR use the analogous `gh-pages` subdirectory: `playwright-report/pr-<N>/` (e.g. `https://bkrupa.github.io/legacy-sports-deploys/playwright-report/pr-2317/`). See [read-playwright-report skill](../read-playwright-report/SKILL.md) for how to download and parse reports.

Preview deployments are kicked off by the deploy workflow after successful PR CI; changes to `apps/web`, `lib/shared-components`, or `lib/ui-abstractions` affect whether the `web-build` artifact is present, but the deploy can still proceed via its fallback build path when that artifact is absent.

### Web Deploy Pipeline

1. Extract version info from `apps/web/package.json`
2. Build with production env vars (GraphQL host, OAuth, analytics, etc.)
3. Add CNAME for `legacy-fantasy.com`
4. Deploy to GitHub Pages
5. Upload sourcemaps to Rollbar
6. Create GitHub Release (`web-v{version}-{build_number}`)
7. Discord notifications (deploy + release)
8. Update deployment badge

### Cleanup

After merge, the merge queue deletes the source branch. Locally:

1. `twig worktree clean` (never `git worktree remove` directly)
2. `git branch -d LS-####/description`
3. Jira "Done" (if not already transitioned by Jira Branch Sync)

## Separation of Duties

Three GitHub Apps handle distinct roles to ensure no single identity both authors and approves code:

| App                                   | ID                                | Role                                                                      | Permissions                                                              |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Agent Author                          | 3158619                           | Pushes code, creates PRs                                                  | Contents (rw), Pull requests (rw)                                        |
| Review Bot (legacy-sports-review-bot) | 3142924                           | Approves PRs after Copilot review passes, manages `bot-review` status     | Pull requests (rw), Statuses (rw)                                        |
| Merge Queue Bot                       | (via `MERGE_QUEUE_APP_ID` secret) | Processes merge queue, merges PRs, retargets dependents, deletes branches | Contents (rw), Pull requests (rw), Issues (rw), Checks (r), Statuses (r) |

**Key constraint:** The Agent Author app never approves PRs. The Review Bot never pushes code. This ensures separation between code authoring and code approval.

## Required vs Advisory Checks

### Required (Blocking) Checks

These must pass for the merge queue to process a PR:

| Check                                     | Source Workflow                                              |
| ----------------------------------------- | ------------------------------------------------------------ |
| CI Pipeline (quality-gates + build + e2e) | `ci-pipeline.yml` via `ci-orchestrator.yml`                  |
| `bot-review` commit status                | `copilot-auto-approve.yml`                                   |
| GraphQL Schema & Codegen                  | `check-schema.yml` (when GraphQL files change)               |
| Verify All Migrations Applied             | `check-migrations-applied.yml` (when migration files change) |

### Advisory Checks (Not Required by Branch Protection)

These checks are not configured as _required_ branch protection rules, but they still produce GitHub check runs/commit statuses. The merge queue (`merge-queue.yml`) waits for all checks to complete and will block on any failing or pending check unless explicitly configured to ignore it, so failures here can still delay a queued merge.

| Check                    | Source Workflow              | Notes                                         |
| ------------------------ | ---------------------------- | --------------------------------------------- |
| Security Scanning        | `security-scanning.yml`      | Labels PR on failure but does not block merge |
| Deploy PR Preview        | `deploy-pr-preview.yml`      | Preview deployment for UI review              |
| Deploy Playwright Report | `ci-pipeline.yml` (sub-job)  | Report published to GitHub Pages              |
| Jira Branch Sync         | `jira-branch-sync.yml`       | Best-effort Jira transitions                  |
| Update Migration Badge   | `update-migration-badge.yml` | Badge cosmetics only                          |

## Secrets Reference

### CI & Deployment

| Secret                        | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `GITHUB_TOKEN`                | Auto-provided; PR comments, labels, check status |
| `GIST_TOKEN`                  | CI badge updates (GitHub Gist)                   |
| `CI_BADGES_GIST_ID`           | Target Gist for badge JSON files                 |
| `DISCORD_CI_WEBHOOK_URL`      | CI failure notifications                         |
| `DISCORD_DEPLOY_WEBHOOK_URL`  | Deploy success/failure notifications             |
| `DISCORD_RELEASE_WEBHOOK_URL` | Release summary notifications                    |

### GitHub Apps

| Secret                         | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `BOT_APP_PRIVATE_KEY`          | Review Bot (ID 3142924) -- Copilot auto-approve      |
| `MERGE_QUEUE_APP_ID`           | Merge Queue Bot app ID                               |
| `MERGE_QUEUE_APP_PRIVATE_KEY`  | Merge Queue Bot private key                          |
| `PREVIEW_APP_ID`               | PR preview/Playwright report deploy app ID           |
| `PREVIEW_APP_PRIVATE_KEY`      | PR preview/Playwright report deploy private key      |
| `AGENT_AUTHOR_APP_PRIVATE_KEY` | Agent Author (ID 3158619) -- code push + PR creation |

### Web App (Vite Build)

| Secret                      | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `VITE_OAUTH_PROXY_URL`      | OAuth proxy endpoint                    |
| `VITE_GOOGLE_CLIENT_ID`     | Google OAuth client ID                  |
| `VITE_GRAPHQL_HOST`         | GraphQL API endpoint                    |
| `VITE_WEBSOCKET_URL`        | WebSocket endpoint                      |
| `VITE_GA_MEASUREMENT_ID`    | Google Analytics                        |
| `VITE_GIPHY_API_KEY`        | Giphy integration                       |
| `VITE_ROLLBAR_ACCESS_TOKEN` | Client-side Rollbar (error tracking)    |
| `ROLLBAR_ACCESS_TOKEN`      | Server-side Rollbar (sourcemap uploads) |

### Jira

| Secret             | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `JIRA_CREDENTIALS` | JSON object: `{client_id, client_secret, cloud_id}` for OAuth 2.0 |

### AWS

| Secret                                                                            | Purpose                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AWS OIDC role (`arn:aws:iam::176661590736:role/legacy-sports-dev-github-actions`) | Assumed via `aws-actions/configure-aws-credentials` for RDS access, Lambda deployment, Terraform |

## Related Skills

- [pr-lifecycle](../pr-lifecycle/SKILL.md) -- PR creation, self-review, Copilot fix workflow
- [rebase](../rebase/SKILL.md) -- Rebase branches and resolve conflicts
- [debug-ci-failure](../debug-ci-failure/SKILL.md) -- Investigate and fix CI failures
- [worktree-workflow](../worktree-workflow/SKILL.md) -- Worktree creation and management
- [repo-tooling](../repo-tooling/SKILL.md) -- Make targets, Nx commands, migration scripts
