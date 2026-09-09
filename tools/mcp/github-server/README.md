# MCP GitHub Server

Pull request and review lifecycle management via the GitHub REST and GraphQL APIs.

## Server ID

`legacy-sports-github`

## Tools

### Authentication

- **github_auth_status** — Check GitHub API auth status. Also see `ci_auth_status` for rate limit info.

### Pull Request Lifecycle

- **github_list_prs** — List PRs with filters (state, branch, author, label, search)
- **github_view_pr** — View detailed PR info (title, body, state, checks, reviews, diff stats)
- **github_edit_pr** — Update a PR's title and/or body; a new body whose jira-link marker is missing or malformed (e.g. an opening comment with no `primary:` line) gets the PR's existing well-formed block re-injected (reported under `warnings`), or is rejected when there is none to fall back on
- **github_close_pr** — Close a PR without merging
- **github_reopen_pr** — Reopen a closed PR (e.g. after an auto-close on a flaky CI failure)
- **github_merge_pr** — Merge a PR (default: queue; or direct with --admin)
- **github_mark_pr_ready** — Convert a draft PR to ready for review and apply the `bot:ready-for-review` trigger label (set `applyReadyLabel: false` to skip the label)
- **github_pr_commits** — List commits on a PR
- **github_pr_timeline** — List issue/PR timeline events (`review_requested`, `review_request_removed`, `labeled`, `unlabeled` by default), fully paginated. Use for historical questions live GraphQL state can't answer, e.g. who was asked to review, when, and whether that request was satisfied or withdrawn.

### Background Jobs (stdio only)

The git-heavy tools (`github_bulk_rebase`, `github_open_pr`'s push phase) run under a ~45s sync budget; slower work returns `{ jobId, status: "running" }` instead of blocking into the ~60s MCP transport timeout (LS-8562).

- **github_job_wait** — Wait (bounded ≤55s per call) for a job; returns the originating tool's final result once done
- **github_job_status** — Non-blocking job snapshot (status + log tail)
- **github_job_list** — List recent jobs. In-memory only — jobs do not survive a server restart

### Reviews & Comments

- **github_request_review** — Request reviewers on one or more PRs. Accepts single number or array. Requests Copilot by default.
- **github_get_review_threads** — Fetch review threads via GraphQL
- **github_resolve_threads** — Batch-resolve review threads
- **github_reply_to_review** — Reply to a review thread (accepts GraphQL `threadId` OR REST `commentId`+`number`)
- **github_comment_pr** — Post a top-level PR comment
- **github_list_reviews** — List reviews on a PR. Pass `compact: false` (default `true`) to include each review's full `body` text, truncated to `maxBodyChars` (default 10000) with a `[truncated]` marker

### Labels

- **github_manage_labels** — Add or remove labels on one or more PRs. Accepts single PR number or array. Use `clearPattern` (glob, e.g. `ci-failure-*`) to remove all matching labels in one call.
- **github_create_label** — Create a label, or update its color/description if it already exists (upsert)
- **github_ensure_sweep_labels** — Ensure sweep labels exist
- **github_sweep_stale_claims** — Remove stale sweep claims

### Secrets

- **github_secrets_check** — List all secret names or check if specific secrets exist (returns names + timestamps, never values). Pass `environment` to scope to an environment's secrets instead of the repo's. Bulk-list mode degrades gracefully (`degraded: true` + hint) instead of throwing when the token lacks list scope. A per-name check can hit the same permission gap independently — that result comes back as `exists: null, error: "forbidden"` rather than a false `exists: false`, since a 403 says nothing about whether the secret is actually there.
- **github_secret_set** — Set a GitHub Actions secret
- **github_secret_delete** — Delete a GitHub Actions secret

### Variables

- **github_variables_check** — List all repo Actions variables (`vars.*`) or check if specific ones exist (returns names, values, and timestamps — unlike secrets, variables are not encrypted)
- **github_variable_set** — Create or update a GitHub Actions repo variable
- **github_variable_delete** — Delete a GitHub Actions repo variable

### CI & Checks

- **github_list_commit_statuses** — List commit statuses (Statuses API) for a commit SHA or PR HEAD; accepts sha, prNumber/number, and optional context filter
- **github_set_commit_status** — Set a commit status (success/failure/pending)
- **github_retrigger_check** — Retrigger a check run
- **github_pr_batch_status** — Detailed status for multiple PRs (mergeable, CI, reviews, threads)
- **github_pr_scan** — Scan all open PRs for CI and review state
- **github_pr_dashboard** — Dashboard view of all open PRs

### Repo & Infrastructure

- **github_get_repo_info** — Get repo owner, name, default branch, and URL
- **github_await_ref** — Bounded wait for a git ref to change SHA or be deleted, replacing `git ls-remote | sleep` polling loops
- **github_list_runners** — List self-hosted runners (requires the "Administration: Read" GitHub App permission on `/actions/runners`)
- **github_webhook_list** — List repository webhooks
- **github_webhook_update** — Update a webhook
- **github_webhook_ping** — Ping a webhook

## How It Works

All operations use the GitHub REST API and GraphQL API directly via authenticated HTTP requests. The server resolves credentials from `GH_TOKEN`, `GITHUB_TOKEN`, GitHub App auth (`AGENT_AUTHOR_APP_PRIVATE_KEY`), or the `gh` CLI as a fallback.

For Copilot reviewer requests, a user OAuth token is required (app tokens silently fail). The server resolves this via `gh auth token`.

## Prerequisites

- GitHub token via `GH_TOKEN`/`GITHUB_TOKEN` env var, GitHub App env vars, or `gh auth login`
- Repository must be a GitHub repo with push access
