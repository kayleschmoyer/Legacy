# GitHub MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/github-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Pull request and review lifecycle — PR dashboards, review threads, labels, and merge readiness.

Available both locally (stdio) and via the hosted connector.

---

### `get_job_logs`

Fetch GitHub Actions job logs with server-side truncation. When a step is marked failed, the log is scoped to that step (scopedToFailingStep + failingSteps) before tail/char limits apply; otherwise falls back to the whole log. Returns the last tail_lines lines (default 200), capped at max_chars (default 10 000). Use truncate_line_length to cap one long line, error_summary for error/failure lines only, or grep_pattern for a substring search. Provide job_id for a single job, or run_id for matching jobs (failed_only/conclusions/job_name_contains/list_only).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `job_id` | number |  | coerced, integer, > 0 | Specific job ID. Required when run_id is not provided. |
| `run_id` | number |  | coerced, integer, > 0 | Workflow run ID. Fetches logs for all jobs in the run (filtered by failed_only). Required when job_id is not provided. |
| `failed_only` | boolean |  | — | With run_id, keep non-success jobs (default true, incl. cancelled). |
| `conclusions` | string[] |  | min 1 | Exact conclusions to keep, e.g. ["cancelled"]; supersedes failed_only. |
| `job_name_contains` | string |  | min 1, max 200 | Substring filter on job name. |
| `list_only` | boolean |  | — | Requires run_id. List matching jobs, no logs (see limit/offset). |
| `limit` | number |  | coerced, integer, > 0, max 500 | list_only page size (default 100). |
| `offset` | number |  | coerced, integer, >= 0 | list_only offset (default 0). |
| `tail_lines` | number |  | coerced, integer, > 0 | Max lines from the end of the log (default 200). |
| `tailLines` | number |  | coerced, integer, > 0 | camelCase alias for tail_lines; tail_lines wins if both set. |
| `max_chars` | number |  | coerced, integer, > 0 | Hard cap on output characters (default: 10 000); truncated output is suffixed with the total byte count. |
| `error_summary` | boolean |  | — | Extract only error/failure lines (plus 2 lines of context) instead of tailing. |
| `truncate_line_length` | number |  | coerced, integer, > 0 | Truncate lines longer than this many characters (e.g. 500), so one pathologically long line can't alone consume the max_chars budget. |
| `grep_pattern` | string |  | min 1, max 200 | Substring search (plus 2 lines context) instead of tailing. Case-insensitive; excl. error_summary. |
| `failed_step_only` | boolean |  | — | Force step-scoping; sets stepScopeFailed if no span is found, instead of a silent unscoped fallback. |

### `github_auth_status`

Check GitHub API authentication status (passive check only — does not trigger interactive auth). Call this first in any GitHub workflow to verify API access is available. Also see ci_auth_status for GitHub rate limit info.

_No parameters._

### `github_await_ref`

Bounded wait for a git ref to change SHA or be deleted — a transport-safe replacement for `git ls-remote | sleep` polling loops. Each call polls the ref for up to maxWaitSeconds (capped at 55s to survive the MCP transport timeout) and returns a { status: "changed" | "deleted" | "unchanged" } snapshot. On "unchanged", re-invoke with the same params (per the returned hint) to keep waiting — never an error while the condition is unmet.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ref` | string | **required** | min 1 | Ref to await, e.g. "refs/heads/main", "heads/main", or bare "main" (defaults to a branch ref). |
| `changedFrom` | string |  | — | Baseline SHA to diff against — waits until the ref SHA differs from this. |
| `deleted` | boolean |  | — | When true, waits for the ref to stop existing rather than to change SHA. |
| `maxWaitSeconds` | number |  | coerced, integer, > 0, max 55 | Per-call wait budget in seconds, capped at 55 (default 55). |

### `github_bulk_comment`

Batch variant of github_comment_pr. Post a top-level comment on many PRs in one call (1-50). For sweeping the same body across PRs, the same body can simply be supplied per item. Returns { success, total, succeeded, failed } per the shared batch-tool convention.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `items` | object[] | **required** | min 1, max 50 | Comments to post (1-50). |

### `github_bulk_edit`

Batch variant of github_edit_pr. Update title and/or body across many PRs in one call (1-50). For label changes across many PRs use github_manage_labels (it already accepts an array of PR numbers). Each item is { number, title?, body? } — at least one of title/body required per item. Returns { success, total, succeeded, failed } per the shared batch-tool convention.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `items` | object[] | **required** | min 1, max 50 | PR edits (1-50). Each entry needs at least title or body. |

### `github_bulk_merge`

Batch variant of github_merge_pr. Merge many PRs in one call (1-50). Each item is { number, strategy? } where strategy defaults to "queue" (auto-merge via GraphQL) and "direct" uses admin REST merge. Returns { success, total, succeeded, failed } per the shared batch-tool convention — one PR's failure does not abort the rest.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `items` | object[] | **required** | min 1, max 50 | PRs to merge (1-50). |

### `github_bulk_rebase`

Rebase many PR branches onto base and force-push (1-50). Runs sequentially because rebase mutates the local checkout. Returns { success, total, succeeded, failed } per the shared batch-tool convention — one PR's rebase conflict does not abort the rest. Conflict details are captured in the per-PR error. Budgeted to ~45s of synchronous work: larger batches return { jobId, status: "running" } — poll with github_job_wait (per-PR progress in logTail) until it returns the final batch result. Do NOT re-run the command while the job is in progress.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prs` | number[] |  | min 1, max 50, coerced | PR numbers to rebase (1-50). Processed in order. Alias: "numbers". |
| `numbers` | number[] |  | min 1, max 50, coerced | Alias for "prs". |

### `github_bulk_reply_to_review`

Batch variant of github_reply_to_review. Post replies on many review threads in one call (1-50). Each reply takes EITHER threadId (GraphQL node ID) OR commentId + number/prNumber (REST) — the same resolution rules as the single-item tool, mixed within one batch. Returns { success, total, succeeded, failed } per the shared batch-tool convention. For the structured Author Agent end-of-round flow (FIX/JUSTIFY/CANNOT-COMPLY with auto-resolve), prefer github_finish_fix_round.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `replies` | object[] | **required** | min 1, max 50 | Replies (1-50). |

### `github_close_pr`

Close a PR with optional comment. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |
| `comment` | string |  | min 1 | Closing comment |

### `github_comment_pr`

Post a general (top-level) comment on a PR. Use for diagnostic notes, blocker explanations, and status updates — distinct from review thread replies (use github_reply_to_review for those). Maps to POST /repos/{owner}/{repo}/issues/{number}/comments. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |
| `body` | string | **required** | min 1 | Markdown body of the comment |

### `github_create_label`

Create a label; upserts if it exists. Description capped at 100 chars.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | **required** | min 1 | Label name |
| `color` | string |  | — | Hex color code (e.g. "ff0000" or "#ff0000") |
| `description` | string |  | — | Label description |

### `github_edit_pr`

Update a PR's title and/or body. Use when Copilot or reviewers request description fixes. Maps to PATCH /repos/{owner}/{repo}/pulls/{pull_number}. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |
| `title` | string |  | min 1 | New PR title |
| `body` | string |  | — | New PR body (markdown) |
| `bodyFile` | string |  | min 1 | Repo-relative file path replacing PR body (contents become public); exclusive with body, no Lambda support |

### `github_ensure_sweep_labels`

Idempotently ensure the sweep coordination labels (sweep-claimed, sweep-stale-claim) exist on the repository. Safe to call at sweep startup every time — creates missing labels and no-ops if they already exist.

_No parameters._

### `github_finish_fix_round`

Semantic one-shot for the Author Agent Contract end-of-round: posts per-thread FIX/JUSTIFY/CANNOT-COMPLY replies, resolves the FIX threads, and applies bot:ready-for-review to re-trigger the Reviewer Bot. Replaces github_reply_to_review_thread → github_resolve_threads → github_manage_labels. Every reply is validated before any side effect, so one invalid entry rejects the whole call; after that, a failed reply lands in `errors[]` and leaves its thread unresolved without blocking the rest. Only FIX threads are resolved. Use issueId (not threadId) for a PR-level finding with no file/line. Reply format and the full contract: .agents/skills/pr-lifecycle/references/respond-to-review.md.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prNumber` | number |  | coerced | PR number |
| `number` | number |  | coerced | Alias for "prNumber" — use either, not both |
| `replies` | object[] |  | max 100 | One entry per thread. Omit or [] for a label-only re-trigger. |
| `readyLabel` | string |  | min 1 | Label to apply after replying + resolving (default: bot:ready-for-review) |

### `github_get_branch_protection`

Read branch protection rules and GitHub rulesets for a branch. Returns required status checks (from both classic protection and active rulesets), conversation resolution requirement, required review count, whether a code-owner review is required (requireCodeOwnerReview — note this can be true while requiredReviewCount is 0), and a summary of all rulesets. Use this to diagnose why a PR is stuck in the merge queue or to understand which checks are truly required vs. informational.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `branch` | string |  | min 1 | Branch name to query (default: "main"). |

### `github_get_check_runs`

List check runs for a PR or commit SHA (id, name, status, conclusion, startedAt, completedAt, output summary); pass id to get_check_run/get_job_logs. Filters: status "incomplete" (queued/in_progress only, cheap for polling) | "completed" | exact "queued"/"in_progress"; onlyFailing: true (failed/cancelled/timed_out only). Unknown params error. One row per check name (latest attempt) unless latestPerName: false (startedAt tells attempts apart). resolveRunId: true adds workflowRunId/jobId for ci_get_logs/ci_search_logs.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced, integer, > 0 | PR number (resolves to HEAD SHA) |
| `prNumber` | number |  | coerced, integer, > 0 | Alias for "number" |
| `sha` | string |  | min 1 | Commit SHA; overrides prNumber/number. |
| `shas` | string[] |  | min 1, max 25 | Batch: 1-25 SHAs fetched in parallel; returns { checkRuns: { [sha]: [...] }, missing }. Takes precedence over sha/prNumber. |
| `checkName` | string |  | min 1 | Case-insensitive substring match on check names; on no match, lists available names. |
| `resolveRunId` | boolean |  | — | Add workflowRunId/jobId (when resolvable). |
| `latestPerName` | boolean |  | — | Default true; false shows every attempt. |
| `status` | enum |  | — | incomplete = not yet completed; others match exactly. |
| `onlyFailing` | boolean |  | — | Only failed runs (failure/cancelled/timed_out/action_required). |

### `github_get_file_content`

Read the contents of a file at a specific git ref (branch, tag, or commit SHA) without checking out a worktree. Returns {path, ref, content, sha}. Useful for PR triage and review agents that need to inspect files on remote branches.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string | **required** | min 1 | File path relative to repo root (e.g. "apps/web/src/pages/Login.tsx"). |
| `ref` | string |  | — | Branch name, tag, or commit SHA (defaults to "main"). |
| `outputPath` | string |  | — | Absolute path to write raw bytes to instead of returning content (metadata-only response). Must be under repo root (non-Lambda) or OS temp dir (always allowed). |

### `github_get_repo_info`

Get repo owner, name, default branch, URL. "include" adds rulesets, workflow permissions, or Actions cache usage vs 10 GB with entries by key prefix.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `include` | enum[] |  | — | — |
| `includesParents` | boolean |  | — | Rulesets "includes_parents" param. |
| `cacheLimit` | number |  | — | Max actions_cache rows (default 30). |

### `github_get_review_threads`

Fetch review threads on a PR via GraphQL. By default returns only UNRESOLVED threads (the ones blocking merge). Pass includeResolved: true to include all threads. IMPORTANT: isOutdated threads that are NOT resolved still block the merge queue — "outdated" means the code changed after the comment was posted, not that it was dismissed. Always use this tool first when debugging "A conversation must be resolved before this pull request can be merged" merge-queue errors. Each thread includes: id (PRRT_ node ID for github_resolve_threads), isResolved, isOutdated, isCollapsed, path, line, startLine (all thread-level for quick scanning without reading comments), plus per-comment databaseId, author, body, path, line. Pagination is capped at 100 threads and 50 comments per thread; truncated: true is set when results are paginated. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |
| `includeResolved` | boolean |  | — | Include resolved threads in results (default: false — returns only unresolved threads, including outdated-but-unresolved threads that still block merge) |

### `github_issue_comment_write`

Create, update, or delete an issue/PR comment. Works on both issue comments and PR top-level comments — GitHub treats them the same way under the hood via the issues API. Use method "update" to edit an existing comment in place (fix a typo, correct a stale reference, maintain a sticky/marker comment like `<!-- e2e-hold -->`) instead of posting a follow-up correction. method "create" maps to POST /repos/{owner}/{repo}/issues/{number}/comments (equivalent to github_comment_pr); "update" maps to PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}; "delete" maps to DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `method` | enum | **required** | — | "create" posts a new comment (requires number + body); "update" edits an existing comment in place (requires commentId + body); "delete" removes a comment (requires commentId). |
| `number` | number |  | coerced | Issue or PR number. Required for method "create". |
| `commentId` | number |  | coerced | Comment ID to update or delete. Required for method "update"/"delete". |
| `body` | string |  | min 1 | Markdown body of the comment. Required for method "create"/"update". |

### `github_job_list`

List recent background jobs (newest first). A job from a previous server process reports orphaned instead of running/done.

_No parameters._

### `github_job_status`

Non-blocking snapshot of a background job started by github_bulk_rebase or github_open_pr. Returns the final result once done, { status: "running", logTail } while in progress, or "orphaned" for a jobId from a prior server process.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job id from a { status: "running" } tool result |

### `github_job_wait`

Wait (bounded, ≤${MAX_WAIT_MS / 1000}s per call) for a background job started by github_bulk_rebase or github_open_pr. Returns the originating tool's final result once done; returns { status: "running" } with a log tail if the budget expires first — re-call until terminal. Never re-run the originating command while its job is running.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job id from a { status: "running" } tool result |
| `maxWaitMs` | number |  | integer, > 0 | Max wait in ms (default and cap: 55000) |

### `github_list_commit_statuses`

List GitHub commit statuses (Statuses API) for a specific commit SHA or a PR's HEAD commit. These are DISTINCT from Check Runs (Checks API) — bot-review and security-scan statuses appear here, not in github_retrigger_check. Use this to diagnose "check not found" errors or confirm whether a bot-review status has updated after threads were resolved. Provide either "sha" (direct SHA), "prNumber", or its alias "number" (both auto-resolve to HEAD SHA). Use "context" to filter to a single status context.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `sha` | string |  | min 1 | Commit SHA to read statuses for. Use this OR prNumber/number, not both. |
| `prNumber` | number |  | coerced, integer, > 0 | PR number — auto-resolves to the HEAD commit SHA. Use this OR sha, not both. |
| `number` | number |  | coerced, integer, > 0 | Alias for "prNumber" — use either, not both. |
| `context` | string |  | min 1 | Filter to a specific status context (e.g. "bot-review", "security-scan"). Omit to return all contexts. |

### `github_list_labels`

Prefer this over `gh label list` via shell. List all labels defined in the repository. Use before calling github_manage_labels or github_edit_pr to discover available label names.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `search` | string |  | — | Filter labels by name or description (case-insensitive substring match) |

### `github_list_pr_comments`

Read comments on a PR. Use type to scope: "all" (default) returns top-level + inline merged; "top-level" returns issue comments; "inline" returns PR review comments tied to diff lines; "review" returns inline comments with reviewId-aware filtering. Optional filters: reviewId (review/all), path (inline/review/all), since (ISO 8601). Handles pagination automatically. Pass the PR number as "prNumber" (preferred) or "number" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prNumber` | number |  | coerced, integer, > 0 | PR or issue number |
| `number` | number |  | coerced, integer, > 0 | Alias for "prNumber" — use either, not both |
| `type` | enum |  | — | Scope of comments to return. Default "all" returns merged top-level + inline. |
| `reviewId` | number |  | coerced, integer, > 0 | Filter inline/review comments to a specific review submission (pull_request_review_id) |
| `path` | string |  | min 1 | Filter inline/review comments to a specific file path (exact match) |
| `since` | string |  | — | ISO 8601 timestamp — only return comments posted at or after this time |

### `github_list_prs`

Prefer over `gh pr list`. List PRs, auto-paginated. "paths": regexes to filter by changed files.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `state` | enum |  | — | State filter (default: open) |
| `branch` | string |  | — | Head branch filter |
| `author` | string |  | — | Author filter |
| `label` | string |  | — | Label filter |
| `search` | string |  | — | Search query |
| `limit` | number |  | coerced, integer, > 0, max 500 | Max results (default: 500) |
| `paths` | string[] |  | min 1 | File-path regexes |

### `github_list_reviews`

List reviews on a PR, or many PRs in one batched GraphQL call. Returns reviewer, state, submittedAt, bodyLength, and commentCount per review — enough to tell APPROVED from COMMENTED and to see whether inline comments exist. Batch mode (`prs`, 1-50) returns `{ reviews: { [prNumber]: [...] }, missing, truncated }`, capped at 100 reviews per PR. Pass compact: false for full review bodies (truncated at maxBodyChars). Review-cycle workflow: .agents/skills/pr-lifecycle/references/respond-to-review.md.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced, integer, > 0 | PR number (single-PR mode). Use `prs` for batch mode. |
| `prNumber` | number |  | coerced, integer, > 0 | Alias for "number" in single-PR mode — use either, not both |
| `prs` | number[] |  | min 1, max 50, coerced, integer, > 0 | Batch mode: PR numbers (1-50), fetched in one GraphQL call. Bad numbers land in `missing`. |
| `reviewer` | string |  | min 1 | Filter by reviewer login (e.g. "copilot-pull-request-reviewer[bot]") |
| `latestOnly` | boolean |  | — | When true (default), return only the most recent review per reviewer. Set false to return all reviews. |
| `compact` | boolean |  | — | When true (default), reviews omit the `body` field (bodyLength only) — unchanged from prior behavior. Set false to include the full review body text, e.g. to read a monolithic bot review's findings without a `gh api` fallback. |
| `maxBodyChars` | number |  | coerced, integer, > 0 | Only applies when compact: false. Review bodies longer than this are truncated to this length with a trailing "\n[truncated]" marker. |

### `github_list_runners`

List self-hosted GitHub Actions runners: id, name, OS, status, busy, labels. Also returns a full-pool summary (counts + per-label) for capacity triage. Rows capped at limit (default 50).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `status` | enum |  | — | Filter rows by status. |
| `busy` | boolean |  | — | Filter rows by busy. |
| `label` | string |  | min 1 | Filter by label. |
| `limit` | number |  | coerced, integer, > 0 | Max rows (default 50). |
| `summaryOnly` | boolean |  | — | Return only summary counts. |

### `github_manage_labels`

Prefer this over `gh pr edit --add-label` via shell. Add or remove labels on one or more PRs. Pass a single PR number via "prNumber", or one or more PR numbers via "prs". When multiple PRs are given, all get the same label changes. Use "clearPattern" (glob, e.g. "ci-failure-*") to remove all labels matching a pattern — composes with "add" and "remove".

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prs` | number[] |  | min 1, max 100, coerced | PR number or array of PR numbers (use "prNumber" for a single PR). Alias: "prNumbers". |
| `prNumbers` | number[] |  | min 1, max 100, coerced | Alias for "prs". |
| `prNumber` | number |  | coerced | Single PR number — alias for prs:[n]. Use either "prNumber" or "prs", not both. |
| `add` | string[] |  | min 1 | Labels to add |
| `remove` | string[] |  | min 1 | Labels to remove |
| `clearPattern` | string |  | — | Glob pattern — labels matching this are removed (e.g. "ci-failure-*"). Composes with "add" and "remove". |
| `repo` | string |  | — | Explicit "owner/name" repo override |

### `github_mark_pr_ready`

Convert a draft PR to ready for review and apply the bot:ready-for-review label (the Reviewer Bot trigger). Use after validation passes to signal the PR is ready for sweep/review agents. The label is applied last and is idempotent, so fix-push cycles re-trigger review without a separate label call. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |
| `applyReadyLabel` | boolean |  | — | Apply the bot:ready-for-review label after marking ready (default true). Set false only when the caller manages the label itself (e.g. a remove-then-add re-trigger). |

### `github_merge_pr`

Prefer this over `gh pr merge` via shell. Merge a PR. Default: merge queue (strategy: "queue") — enables auto-merge via GraphQL, no local git checkout. "direct" uses --admin (requires authorization). Pass the PR number as "number" (preferred) or "prNumber" (alias). NOTE: PRs that modify .github/workflows/ files require the PAT to have the `workflow` OAuth scope — if the merge returns a 403 mentioning "workflow scope", escalate to the user to merge manually or reconfigure the token. To enable auto-merge with a configurable merge method, use `github_pr_enable_auto_merge` instead.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced, integer, > 0 | PR number |
| `prNumber` | number |  | coerced, integer, > 0 | Alias for "number" — use either, not both |
| `strategy` | enum |  | — | "queue" (default) or "direct" (--admin, requires authorization) |

### `github_open_pr`

Semantic one-shot for the Ship step: push branch → create PR as draft → mark ready for review → apply bot:ready-for-review label. Replaces the six-step worktree_push → create-draft-PR → github_mark_pr_ready → github_manage_labels(add: bot:ready-for-review) sequence. The jira-link marker is auto-inserted when jiraKey is provided. Pass draft: true to leave the PR in draft state (skips mark-ready and label). Pass push: false if the branch is already pushed. Lambda: push no-ops, bodyFile rejected. Budgeted to ~45s of synchronous work: a slow git push returns { jobId, status: "running" } — poll with github_job_wait until it returns the final result. Do NOT re-run the command while the job is in progress.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `title` | string | **required** | min 1 | PR title |
| `body` | string |  | — | PR body (markdown) |
| `bodyFile` | string |  | min 1 | Repo-relative file path for PR body (contents become public); exclusive with body, no Lambda support |
| `base` | string |  | — | Base branch (default: main) |
| `draft` | boolean |  | — | Leave PR in draft (default: false — creates a ready-for-review PR) |
| `head` | string |  | — | Remote branch name. Required in Lambda mode; auto-detected from worktreePath otherwise. |
| `worktreePath` | string |  | — | Absolute path to the local worktree for branch auto-detection and push |
| `jiraKey` | string |  | — | Jira ticket key (e.g. LS-1234). Auto-inserted as the jira-link marker in the PR body. |
| `push` | boolean |  | — | Push branch before creating PR (default: true). Pass false if already pushed. No-op in Lambda. |

### `github_pr_batch_status`

Detailed status for specific PRs: mergeable/conflicting, CI jobs, reviews, unresolved threads. Batched GraphQL.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prs` | number[] |  | min 1, max 50, coerced | PR numbers. Alias: "numbers". |
| `numbers` | number[] |  | min 1, max 50, coerced | Alias for "prs". |
| `compact` | boolean |  | — | Essential fields only (number, branch, mergeable, mergeStateStatus, conflicting, ciSummary, failedJobs, cancelledJobs, unresolvedThreads) |

### `github_pr_commits`

List commits on a pull request. Returns sha, shortSha, message (first line), author, date, and url for each commit. Useful for correlating pushes with review events or inspecting PR history. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |
| `limit` | number |  | coerced, integer, > 0, max 100 | Max commits to return (default: 30, max: 100) |

### `github_pr_dashboard`

Triage dashboard: open PRs with mergeable status, CI state, unresolved threads, labels, and summary counts. Default output is a compact markdown table (PR/Title/Branch/CI/Reviews/Threads/Ready) with a Blocked PRs section; pass format:"json" for the full structured payload.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `state` | enum |  | — | State filter (default: open) |
| `author` | string |  | — | Author filter |
| `label` | string |  | — | Label filter |
| `limit` | number |  | coerced, integer, > 0, max 100 | Max results (default: 30) |
| `excludeDrafts` | boolean |  | — | Exclude draft PRs from dashboard results (default: true). Draft PRs are being worked on by their creating agent. |
| `format` | enum |  | — | Output format. "markdown" (default) returns a triage table with summary counts and a Blocked PRs section — ~40-60% fewer tokens than JSON. "json" returns the full structured payload (summary, prs[], recommendBatchStatus) for programmatic callers. |

### `github_pr_diagnose`

One-shot CI failure triage: compact markdown report with PR state, behindBy, STALE_BASE hint, failing jobs with error context, and next action. Replaces the 4-5 call chain: github_view_pr → github_get_check_runs → github_pr_why_blocked → ci_find_session → ci_get_logs. For full CI log lines, fetch logs separately via ci_get_logs after using this tool to identify which jobs are failing. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number to diagnose |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |

### `github_pr_diff`

Prefer this over `gh pr diff` via shell. Returns the unified diff for a pull request. Useful for inspecting the exact code changes introduced by a PR, especially dependency PRs that have not yet merged. Pass the PR number as "prNumber" (preferred) or "number" (alias). Use maxBytes to cap response size for very large PRs (default: 100 000 bytes).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prNumber` | number |  | coerced | PR number to fetch the unified diff for |
| `number` | number |  | coerced | Alias for "prNumber" — use either, not both |
| `maxBytes` | number |  | coerced, integer, > 0 | Maximum bytes of diff to return (default: 100 000). Increase for large PRs. |

### `github_pr_enable_auto_merge`

Enable auto-merge on a PR via the GitHub GraphQL API. The PR will merge automatically once all required checks pass. Use this instead of `gh pr merge --auto`, which fails in worktree sessions because it tries to check out the base branch locally. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced, integer, > 0 | PR number |
| `prNumber` | number |  | coerced, integer, > 0 | Alias for "number" — use either, not both |
| `mergeMethod` | enum |  | — | Merge method to use when auto-merging (default: SQUASH) |

### `github_pr_files`

Changed filenames for many PRs in one batched GraphQL call — { [prNumber]: string[] } for format:"names" (default), or with additions/deletions/changeType per file for format:"full". Use instead of a per-PR github_pr_diff fan-out or a shell `gh api .../files` loop.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prs` | number[] |  | min 1, max 50, coerced | PR numbers (1-50). Alias: "prNumbers". |
| `prNumbers` | number[] |  | min 1, max 50, coerced | Alias for "prs". |
| `format` | enum |  | — | "names": file paths only. "full": also additions/deletions/changeType. |

### `github_pr_scan`

Scan open PRs into buckets: conflicting, reviews, ciFailing, ciPending, clean. Syncs CI failure labels by default.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `limit` | number |  | coerced, integer, > 0, max 100 | Max PRs to scan (default: 100, max: 100) |
| `applyLabels` | boolean |  | — | Sync CI failure labels (default: true) |
| `compact` | boolean |  | — | Return a compact view with essential fields (number, branch, failedChecks, threadCount), plus threadsTruncated for review buckets and labelActions when labels are applied, to reduce token usage |
| `excludeDrafts` | boolean |  | — | Exclude draft PRs from scan results (default: true). Draft PRs are being worked on by their creating agent and should not be swept. |
| `excludeLabels` | string[] |  | min 1 | Exclude PRs that have any of these labels. Useful for filtering out sweep-claimed PRs. Default: no exclusions. |

### `github_pr_timeline`

List issue/PR timeline events (thin wrapper over GET /repos/{owner}/{repo}/issues/{number}/timeline), paginated fully. Use for historical questions the live GraphQL state cannot answer, e.g. "who was asked to review, when, and was that request satisfied or withdrawn" — reviewRequests only shows currently-open requests. Returns event, createdAt, actor, requestedReviewer (user login, or "team:<name>" for team reviewers), and label per row ("committed" rows use the committer date and git author name, since commit events have no created_at/actor login). Defaults to review_requested/review_request_removed/labeled/unlabeled; pass "events" to filter to a different subset. Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |
| `events` | string[] |  | — | Timeline event types to include (e.g. ["review_requested", "review_request_removed"]). Defaults to review_requested, review_request_removed, labeled, unlabeled — not the full chatty timeline. |
| `limit` | number |  | coerced, integer, > 0, max 500 | Max matching events to return (default: 100, max: 500). |

### `github_pr_why_blocked`

Diagnose why a PR is not moving forward. Returns a structured reason (DRAFT, MERGE_CONFLICT, CI_FAILING, CHANGES_REQUESTED, UNRESOLVED_THREADS, AWAITING_REVIEW, AWAITING_CODE_OWNER_REVIEW, NO_REVIEWER_ASSIGNED, CI_PENDING, IN_MERGE_QUEUE, READY, MERGED, etc.), a one-line summary, relevant details, and a concrete next action. Reports behindBy and, on CI_FAILING, hint STALE_BASE (rebase; no rerun or code-fix). Pass the PR number as "number" (preferred) or "prNumber" (alias).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number to diagnose |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |

### `github_reopen_pr`

Reopen a closed PR with optional comment.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number | **required** | coerced, integer, > 0 | PR number |
| `comment` | string |  | min 1 | Reopening comment |

### `github_request_review`

Request reviewers on one or more PRs. Accepts a single PR number or array via "prs", or a single PR number via "prNumber" (alias for prs:[n]). Requests only the reviewers passed in "reviewers" unless "copilot: true" is explicitly set.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prs` | number[] |  | min 1, max 100, coerced | PR number or array of PR numbers (use "prNumber" for a single PR) |
| `prNumber` | number |  | coerced, integer, > 0 | Single PR number — alias for prs:[n]. Use either "prNumber" or "prs", not both. |
| `reviewers` | string[] |  | — | Human reviewer usernames |
| `copilot` | boolean |  | — | Opt-in: also request copilot-pull-request-reviewer[bot] (default: false — not requested unless explicitly set) |

### `github_resolve_action_sha`

Resolve a GitHub Actions tag (e.g. "v4") to its immutable commit SHA for supply-chain pinning. Returns the SHA, original tag, and whether the tag was lightweight or annotated. Use this before pinning action references in workflow files. For bulk resolution use github_resolve_action_shas.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `owner` | string | **required** | min 1 | GitHub organisation or user that owns the action repo (e.g. "actions"). |
| `repo` | string | **required** | min 1 | Repository name of the action (e.g. "checkout"). |
| `tag` | string | **required** | min 1 | Mutable tag to resolve (e.g. "v4" or "v4.1.0"). |

### `github_resolve_action_shas`

Resolve multiple GitHub Actions tags to their immutable commit SHAs in a single call. Runs all resolutions in parallel. Each result includes the action, sha, tag, and tagType ("lightweight" | "annotated"). Failed entries include an "error" field instead of "sha". Use this when pinning many actions at once.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `actions` | object[] | **required** | min 1 | Array of actions to resolve. Each entry must have owner, repo, and tag. |

### `github_resolve_threads`

Batch-resolve review threads (groups of 50). Accepts PRRT_ thread node IDs (from github_get_review_threads) via threadIds, OR numeric comment databaseIds (from mcp__github__* get_review_comments or github_get_review_threads comment entries) via commentDatabaseIds — the tool maps comment IDs to thread IDs internally. When using commentDatabaseIds, prNumber (or its alias "number") is required. If prNumber is provided and all threads resolved, triggers bot-review recheck.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `threadIds` | string[] |  | — | Thread node IDs (PRRT_...) from github_get_review_threads. Use this OR commentDatabaseIds. |
| `commentDatabaseIds` | number[] |  | min 1, max 100, coerced, integer, > 0 | Numeric comment databaseId values (REST IDs) — alternative to threadIds when you only have comment IDs (e.g. from mcp__github__* get_review_comments). Requires prNumber. The tool fetches thread IDs from the PR and maps each comment ID to its parent thread. |
| `prNumber` | number |  | coerced, integer, > 0 | PR number — required when using commentDatabaseIds; also triggers Copilot Auto-Approve recheck after resolving threads when all resolutions succeed |
| `number` | number |  | coerced, integer, > 0 | Alias for "prNumber" — use either, not both |

### `github_retrigger_check`

Re-request failed status checks on a PR, no empty commit needed; falls back to the Actions API. waitForCompletion bridges "not_yet_reschedulable" (bounded, like ci_dispatch_workflow).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced, integer, > 0 | PR number |
| `prNumber` | number |  | coerced, integer, > 0 | Alias for "number" — use either, not both. |
| `checkName` | string |  | min 1 | Check name to re-request (substring match) |
| `checkNames` | string[] |  | — | Multiple check names |
| `allFailed` | boolean |  | — | Retrigger checks failing on head SHA. |
| `waitForCompletion` | boolean |  | — | Wait out an in-flight owning run, then retry once. |
| `timeoutSeconds` | number |  | coerced, integer, > 0 | Max wait per call, seconds (default/ceiling ~20s). |

### `github_secret_delete`

Delete a GitHub Actions secret from the repository.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | **required** | — | Secret name to delete |

### `github_secret_set`

Set a GitHub Actions secret. Reads value from file to avoid passing secrets through the tool interface.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | **required** | min 1 | Secret name (e.g. "AGENT_AUTHOR_APP_PRIVATE_KEY") |
| `value` | string |  | — | Secret value (prefer valueFile) |
| `valueFile` | string |  | — | Path to file containing secret value |

### `github_secrets_check`

List secret names or check they exist (never values). environment scopes to an environment. A 403 degrades: list mode returns degraded:true; per-name returns exists:null/error:forbidden, not a false negative.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `names` | string[] |  | min 1 | Names to check. Omit to list all. |
| `environment` | string |  | — | — |

### `github_set_commit_status`

Set a commit status on a PR (auto-resolves head SHA). Pass PR number as "number" or "prNumber". May be denied even for a sanctioned stale-status fix — don't retry; surface evidence.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced | PR number |
| `prNumber` | number |  | coerced | Alias for "number" — use either, not both |
| `context` | string | **required** | min 1 | Status context name (e.g. "bot-review") |
| `state` | enum | **required** | — | Status state |
| `description` | string |  | — | Human-readable description |

### `github_sweep_stale_claims`

Find PRs with a stale sweep-claimed label (agent claimed but did not release). Uses label event timestamps for accuracy — more reliable than PR updatedAt, which reflects the last PR activity rather than when the label was applied.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `olderThanMinutes` | number |  | coerced, integer, > 0 | Minimum age in minutes for a claim to be considered stale (default: 30) |

### `github_variable_delete`

Delete a GitHub Actions repo variable (Settings > Secrets and variables > Actions > Variables).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | **required** | — | Variable name to delete |

### `github_variable_set`

Create or update a GitHub Actions repo variable (Settings > Secrets and variables > Actions > Variables), e.g. flipping a feature-flag or rollout-gate flag consumed by a workflow via `vars.NAME`. Unlike secrets, the value is not encrypted — do not use this for credentials.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | **required** | — | Variable name (e.g. "JIRA_AUDIT_AUTO_REPAIR") |
| `value` | string |  | — | Variable value (prefer valueFile) |
| `valueFile` | string |  | — | Relative path (no absolute paths or ".." segments) to a file containing the variable value |

### `github_variables_check`

List all repo Actions variable names or check specific variables (Settings > Secrets and variables > Actions > Variables). Unlike secrets, variables are not encrypted — returns names, values, createdAt, updatedAt. When names are omitted, lists all; when provided, returns per-variable exists status and value.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `names` | string[] |  | min 1 | Specific variable names to check for existence. Omit entirely to list all variables — an empty array is rejected, not treated as "omitted". |

### `github_view_pr`

Prefer this over `gh pr view`/`gh pr diff --name-only`. Compact card: number, title, state, isDraft, mergeable, mergeStateStatus, headRefName, baseRefName, url, labels, reviewDecision, additions, deletions, changedFiles, commits.totalCount, checksSummary, mergedAt, mergeCommit, mergedBy. Optional "fields": "body", "files", "reviews", "assignees", "milestone". PR number as "number" or alias "prNumber".

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `number` | number |  | coerced, integer, > 0 | PR number |
| `prNumber` | number |  | coerced, integer, > 0 | Alias for "number" — use either, not both |
| `fields` | enum[] |  | — | Opt-in extra fields beyond the compact default. E.g. ["body","files"] to include the PR description and changed-files list. |

### `github_webhook_list`

List all webhooks configured on this repository. Returns id, active status, events, URL, and last response.

_No parameters._

### `github_webhook_ping`

Send a ping event to a repository webhook to verify it is reachable.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `hookId` | number | **required** | coerced, integer, > 0 | Webhook ID (from github_webhook_list). |

### `github_webhook_update`

Update a repository webhook. Can change active status, event subscriptions, delivery URL, or content type.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `hookId` | number | **required** | coerced, integer, > 0 | Webhook ID (from github_webhook_list). |
| `active` | boolean |  | — | Enable or disable the webhook. |
| `events` | string[] |  | — | GitHub event names to subscribe to (e.g. ["push", "pull_request"]). Replaces the full event list. |
| `url` | string |  | url | New delivery URL for the webhook. |
| `contentType` | enum |  | — | Payload content type (default: json). |

