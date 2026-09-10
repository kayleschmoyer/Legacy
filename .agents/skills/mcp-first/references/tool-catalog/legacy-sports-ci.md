# CI MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/ci-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

GitHub Actions run triage: list/view runs, fetch and search logs, rerun failed jobs, and read Playwright reports.

Available both locally (stdio) and via the hosted connector. 24 tools.

---

### `ci_audit_session_bash`

Extract Bash tool_use calls (and optionally MCP overflows/failures) from the current Claude Code session transcript, including subagent transcripts, so the inventory survives context compaction. Auto-detects the current session and project, worktree sessions included. Output modes: default structured JSON; gapsOnly for a compact frequency table; auditMode for a pre-classified gap report with confidence scores and draft ticket summaries. Drives the MCP gap audit — see .agents/skills/mcp-first/references/audit-workflow.md.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `sessionId` | string |  | — | Session UUID. Defaults to the most recently modified JSONL in the project directory. |
| `project` | string |  | — | Project slug (e.g. "D--code-legacy-sports"). Auto-detected from CWD if omitted. |
| `projectsDir` | string |  | — | Base directory holding project session folders. Overrides auto-detection — needed when the server process's home does not match the session location (some CCR topologies). |
| `transcriptContent` | string |  | — | Raw transcript JSONL; bypasses path resolution (no shared filesystem case, LS-9362). |
| `includeMcp` | boolean |  | — | Include MCP tool overflows and failures in the report (default: false). |
| `pid` | number |  | coerced, integer, > 0 | Process ID to look up session ID from ~/.claude/sessions/. |
| `gapsOnly` | boolean |  | — | Compact output: one line per unique command pattern (<5 KB), gaps separated from covered commands. |
| `scanScratch` | boolean |  | — | Also scan scratch/*.py for subprocess shell patterns; reported under "scratch_subprocess_calls". |
| `auditMode` | boolean |  | — | Full audit report: pre-classified gaps with confidence scores, draft ticket summaries, noise filtering, and overflow/failure triage. Implies includeMcp. Review and approve rather than classify from scratch. |
| `sessionToolNames` | string[] |  | — | Your current tool names — reclassifies `gh pr *`/`gh run *` as a real gap when the covering MCP server is absent from this list, instead of always "covered" (LS-9749). |

### `ci_auth_status`

Check if the CI server is authenticated with GitHub. Returns token source (GH_TOKEN, GITHUB_TOKEN, github-app, or gh-cli), authenticated user login, and rate limit info for whichever token that source resolved to. Call this first to verify credentials are working before using other ci_* tools. Also see github_auth_status for basic GitHub auth status without rate limit info. NOTE: rateLimit here is not guaranteed to be the installation bucket (GH_TOKEN/GITHUB_TOKEN take precedence when set) — use ci_installation_rate_limit for that specifically.

_No parameters._

### `ci_auto_fix`

Classify a CI failure into a category (formatting, stale_branch, codegen, type_error, test_failure, lint, flaky, infrastructure, unknown) with confidence, evidence, and fix recommendation.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number | **required** | coerced, integer, > 0 | Run ID to analyze |
| `jobId` | number |  | coerced, integer, > 0 | Job ID to analyze |
| `attempt` | number |  | coerced, integer, > 0 | Attempt number |

### `ci_cancel_run`

Prefer this over `gh run cancel` via shell. Cancel a single in-flight run via runId — e.g. killing a stale-SHA dispatch after pushing a follow-up commit — or every in-flight (queued/in_progress) run of a workflow on a branch via workflow+branch (e.g. serializing expensive live-backend integration runs so a fresh dispatch never races a stale one, LS-7878); pass one mode, not both. Single-run mode re-fetches the run after cancelling since GitHub does not transition synchronously (it passes through `cancel_in_progress` first); cancelling an already-completed run returns a clear error rather than throwing. Bulk mode resolves `workflow` the same way ci_list_runs does and returns the standard partial-failure shape { success, total, succeeded, failed }, with total: 0 when nothing is in flight.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number |  | coerced, integer, > 0 | Run ID to cancel (single-run mode). Use the "id" field from ci_list_runs output ("databaseId" is an alias). |
| `workflow` | string \| number |  | integer | Workflow filename, display name, or numeric ID (bulk mode, with branch). |
| `branch` | string |  | min 1 | Branch to scope bulk cancellation to (bulk mode, with workflow). |

### `ci_deploys_repo_auth_status`

Diagnose why ci_get_playwright_report/ci_get_playwright_test_result might 404 on the private bkrupa/legacy-sports-deploys repo (LS-8788) — WITHOUT triggering a real report fetch. Explicitly exercises each credential tier getDeploysToken() tries, in order: (1) PREVIEW_APP_PRIVATE_KEY + PREVIEW_APP_ID (dedicated deploy App), (2) the agent-author App's own installation on the deploys repo. Reports which tier is configured, which succeeded/failed and why, and which source `resolvedSource` a real ci_get_playwright_report call would actually use right now. `resolvedSource: "fallback"` means both tiers are unavailable and reads will 404 with the "broad fallback token" credentials-gap message — see .agents/skills/read-playwright-report/SKILL.md for the two known remedies (both require one-time human action outside this repo). Call this to verify a credentials fix actually landed instead of re-triggering a report fetch and re-deriving the same diagnosis from a 404.

_No parameters._

### `ci_dispatch_workflow`

Trigger a GitHub Actions workflow_dispatch event. Accepts a workflow file name (e.g. "deploy.yml"), numeric ID, or display name (e.g. "Legacy Sports CI Orchestrator") — resolved the same way as ci_list_runs, plus optional ref and input parameters. Set waitForCompletion: true to wait for the run (bounded at ~20s per call to stay under this Lambda-hosted server's own 30s execution timeout): fast runs return the final conclusion in one call; longer runs return { status: "in_progress", runId } — continue with ci_wait_run({ runId }), never by re-dispatching. This is the MCP-native alternative to `gh run watch` for non-PR dispatched runs — avoids the shell fallback and session-resume watcher-death problem. When waitForCompletion is false (default), the tool returns immediately and the agent must use ci_list_runs then ci_view_run to track the run. Note: PR-associated runs notify natively via push events; use waitForCompletion only for workflow_dispatch runs that have no associated PR.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `workflow` | string \| number | **required** | integer | Workflow filename (e.g. "deploy.yml") or numeric ID |
| `ref` | string |  | — | Git ref (branch/tag) to run against (default: "main") |
| `inputs` | object (key-value) |  | — | Key-value map of workflow input parameters (all values must be strings). Accepts either a plain object or a JSON string. |
| `waitForCompletion` | boolean |  | — | When true, polls the triggered run for up to ~20s and returns { status: "completed", conclusion, ... } if it finishes, or { status: "in_progress", runId, hint } if not — continue waiting with ci_wait_run({ runId }). Use this instead of `gh run watch` for non-PR workflow_dispatch runs. Default: false. |
| `timeoutSeconds` | number |  | coerced, integer, > 0, max 3600 | Deprecated — the per-call wait is always clamped to ~20s (this Lambda-hosted server's own execution timeout, not the MCP transport deadline). Kept for backward compatibility; longer waits are re-armed via ci_wait_run. |

### `ci_download_artifact`

Prefer this over `gh run download` via shell. Download a named GitHub Actions artifact (uploaded via actions/upload-artifact) from a workflow run. Without outDir, file contents are returned inline in the response (UTF-8 text where safe, base64 for binary, capped at ~200KB total across all files — the only option in hosted sessions with no shared filesystem). With outDir, every file is extracted to that local directory instead and only their paths are returned.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number | **required** | coerced, integer, > 0 | Workflow run ID that produced the artifact |
| `artifactName` | string | **required** | min 1 | Exact artifact name as uploaded via actions/upload-artifact (falls back to a case-insensitive match if no exact match is found) |
| `outDir` | string |  | — | Local directory to extract the artifact into. Omit to get file contents back inline instead. |

### `ci_find_session`

Find Claude Code session JSONL files containing a substring (e.g. a Jira key, branch name, or commit SHA). Scans every JSONL under ~/.claude/projects/<slug>/ — including subagent transcripts — and returns matches sorted by last-modified descending. Use this to locate "where did I work on LS-#### earlier today?" without manually grepping session files. Empty matches array if nothing found.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `query` | string | **required** | min 1 | Substring to search for in session JSONLs (e.g. "LS-2366", "fix-nightly-playwright", a git SHA). |
| `project` | string |  | — | Project slug (e.g. "D--code-legacy-sports"). Auto-detected from CWD if omitted. |
| `includeSubagents` | boolean |  | — | Also scan subagent JSONLs under <sessionId>/subagents/ (default: true). |
| `limit` | number |  | coerced, integer, > 0, max 500 | Maximum number of matches to return (default: 50, max: 500). Older matches are dropped first. |

### `ci_force_cancel_run`

Last resort for a run ci_cancel_run cannot actually evict — e.g. a job queued for a self-hosted runner that has already shut down, so GitHub has no runner left to deliver a graceful cancel signal to (LS-9709). Calls GitHub's POST .../force-cancel endpoint, which GitHub itself documents as a more disruptive last resort, so this refuses to run unless confirmNormalCancelFailed is explicitly true — always try ci_cancel_run({ runId }) first. Unlike a bare API call, this does not trust "request accepted" on its own: it polls the run afterward until it actually reaches a terminal state (or the poll budget runs out) and reports which — { status: "terminated" } only when the run is confirmed completed with conclusion "cancelled", { status: "cancelling", hint } if still not terminal (re-invoke to keep polling), or { status: "already-completed" } / { status: "completed-otherwise" } when there was nothing to force.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number | **required** | coerced, integer, > 0 | Run ID to force-cancel. Use the "id" field from ci_list_runs output ("databaseId" is an alias). |
| `confirmNormalCancelFailed` | boolean |  | — | Must be true to proceed. Set this only after ci_cancel_run({ runId }) has already been called for this run and the run is still not terminating. |
| `maxWaitSeconds` | number |  | coerced, integer, min 0, max 20 | How long to poll for confirmed termination after force-cancelling (default/cap: 20s, this Lambda's own execution budget). If the run is still not terminal when the budget runs out, re-invoke with the same runId and confirmNormalCancelFailed: true to keep polling. |

### `ci_get_logs`

Prefer this over `gh run view --log-failed` via shell. Fetch CI logs for a run or job, failed steps only by default. Response is a minified-JSON metadata line followed by raw log text with real newlines, so grep and chunked Read work directly against it when the response is persisted to a file.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number |  | coerced, integer, > 0 | Run ID (required when jobId and runIds are not provided) |
| `runIds` | number[] |  | min 1, max 10, coerced, integer, > 0 | Batch mode: up to 10 runs in one call, each returned as a "=== run <id> ===" section. Runs whose log archive is gone (expired) are isolated to missing[] rather than failing the call. Not with jobId. |
| `jobId` | number |  | coerced, integer, > 0 | Job ID |
| `jobName` | string |  | — | Job name — exact match preferred, else substring; errors listing candidates if ambiguous. |
| `failedOnly` | boolean |  | — | Failed steps only (default: true) |
| `attempt` | number |  | coerced, integer, > 0 | Attempt number |
| `maxLines` | number |  | coerced, integer, > 0, max 5000 | Max lines returned (cap 5000). Default 500, or up to 10000 when errorSummary is set. |
| `maxChars` | number |  | coerced, integer, > 0, max 200000 | Hard cap on total characters (default 50000), applied regardless of maxLines. |
| `truncateLineLength` | number |  | coerced, integer, > 0, max 10000 | Truncate individual lines past this length; truncated lines are suffixed ...[line truncated]. |
| `errorSummary` | boolean |  | — | Extract only error/failure lines with context (~200 lines max). |
| `offset` | number |  | coerced, integer, >= 0 | Skip this many lines from the start of the fetched window before applying maxChars, like Read offset. Pages a log across calls; response meta returns hint/linesRemainingInWindow with the next offset. |
| `grep` | string |  | — | Regex filter over the full log, e.g. "foo\|bar" (not just the maxLines tail). Overrides errorSummary. Case-insensitive unless caseSensitive. Capped at 300 matches. |
| `caseSensitive` | boolean |  | — | Case-sensitive grep (default false). |

### `ci_get_playwright_report`

Read a Playwright E2E test report deployed to legacy-sports-deploys. Returns overall stats (total/passed/failed/skipped/flaky), per-file breakdowns, lists of failed/flaky test titles, and a skippedTests array with { name, file, reason } for every skipped test (reason comes from the test annotation description). Pass prNumber to auto-resolve the report for a PR (e.g. { prNumber: 5271 }). Pass runId to auto-resolve by GitHub Actions run ID (auto-expanded to nightly-/manual- fallbacks). Pass reportName when you already know the exact deployed name (e.g. "pr-2173", "manual-146"). At least one of prNumber, runId, or reportName is required. If multiple are provided, prNumber takes precedence, then runId, then reportName. Examples: ci_get_playwright_report({ prNumber: 5271 }) · ci_get_playwright_report({ runId: 12345678 }) · ci_get_playwright_report({ reportName: "pr-2173" })

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reportName` | string |  | — | Exact report name as deployed: "pr-{number}" for PRs (e.g. "pr-2173"), "manual-{number}" for manually-triggered runs (e.g. "manual-146"), "nightly-{run_id}" for nightly runs, or a bare numeric GitHub run ID (auto-expanded to nightly-/manual- fallbacks). Omit when using prNumber or runId. |
| `prNumber` | number |  | integer, > 0 | GitHub PR number. Auto-resolves to the report deployed under "pr-{prNumber}". Use this when triaging CI failures on a specific PR. |
| `runId` | number |  | integer, > 0 | GitHub Actions workflow run ID. Auto-expanded to nightly-{id} or manual-{id} fallbacks when not found directly. |

### `ci_get_playwright_test_result`

Read a SINGLE test result from a Playwright report, or list S3 blob artifacts for a CI run. Prefer this over ci_get_playwright_report when you already know which test failed and want only its error, snippet, stdout/stderr, and attachments — it keeps the full report out of context. Identify the report with reportName or runId, and the test with testTitle and/or fileName/testFile; an ambiguous match returns a candidates list. Report naming, S3 blob handling, and the runId+testFile webhook lookup: .agents/skills/read-playwright-report/SKILL.md.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reportName` | string |  | — | Deployed report name (pr-N, manual-N, nightly-<runId>) or a bare numeric run ID. Alternative to runId; one is required. |
| `runId` | string \| number |  | — | GitHub Actions run ID (e.g. from the <integration-results> webhook). Alternative to reportName; one is required. |
| `testTitle` | string |  | min 1 | Case-insensitive substring of the full title (describe path joined by " > "). Optional when fileName/testFile is given. |
| `fileName` | string |  | — | Case-insensitive spec-filename substring, to disambiguate identical titles (gh-pages mode). Alias: testFile. |
| `testFile` | string |  | — | Alias for fileName, matching the <integration-results> webhook field. One of testTitle or fileName/testFile is required. |
| `source` | enum |  | — | "gh-pages" (default) or "s3" (presigned blob-archive URLs) — use s3 when the GH Pages report is absent. |
| `artifactType` | enum |  | — | s3 mode only: artifact prefix. Default "blobs". |
| `maxChars` | number |  | coerced, integer, > 0, max 100000 | Reserved for future use. gh-pages mode applies a fixed 4000-char per-field cap; s3 presigned URLs are never truncated. |

### `ci_installation_rate_limit`

Report the GitHub App installation token's core rate limit (remaining/limit/reset) — the SAME budget secrets.GITHUB_TOKEN draws from in workflows. Always mints a fresh installation token via AGENT_AUTHOR_APP_PRIVATE_KEY and queries GET /rate_limit directly, bypassing GH_TOKEN/GITHUB_TOKEN env precedence, so it's always the installation bucket — unlike ci_auth_status's rateLimit field. `gh api rate_limit` reports a DIFFERENT bucket (the CLI's own user/PAT token) and does not answer "is CI rate limited?" (LS-9570). Call this when a CI step failed with "API rate limit exceeded for installation", or silently withheld a status/verdict it otherwise computed correctly (a rate-limit signature, not a real verdict). Remedy: wait until resetsAt, then re-run — not an immediate retry.

_No parameters._

### `ci_list_runs`

Prefer this over `gh run list` via shell. List recent CI runs with optional filters.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `branch` | string |  | — | Branch name filter |
| `workflow` | string \| number |  | — | Workflow filename, display name, or numeric ID |
| `status` | string |  | — | Run status or conclusion |
| `event` | string |  | — | Trigger event name |
| `commit` | string |  | — | Commit SHA filter |
| `user` | string |  | — | GitHub username filter |
| `limit` | number |  | coerced, integer, > 0, max 100 | Max results (default: 10, max: 100) |

### `ci_rerun`

Prefer this over `gh run rerun` via shell. Rerun failed jobs, a specific job, the whole run, or up to 50 runs in one batch call. scope: "failed" (default) reruns only failed jobs, auto-escalating to a full run rerun when a job was left `cancelled` by an upstream dependency failure — GitHub's rerun-failed-jobs endpoint never reschedules those (LS-9212); check the response `scope`/`message` for `"run (escalated from failed-jobs)"`. scope: "job" reruns a single job via jobId or jobName (single-run only; see jobName param). scope: "all" reruns the entire run. Pass runIds (1-50) instead of runId to rerun several runs independently in one call — scope "job" and withDiagnostics are single-run only; batch results use the standard partial-failure shape { success, total, succeeded, failed }. withDiagnostics: true (single-run, scope "failed" only) is the triage-then-rerun one-shot: fetches a short failure-log snippet and richer per-job payload before rerunning, and errors clearly (never a silent no-op) when there are no failed jobs to rerun.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number |  | coerced, integer, > 0 | Run ID (single-run mode). Exactly one of runId/runIds is required. |
| `runIds` | number[] |  | min 1, max 50, coerced, integer, > 0 | Run IDs to rerun independently (1-50, batch mode). Not with runId, scope="job", or withDiagnostics. |
| `scope` | enum |  | — | What to rerun: "failed" (default), "job" (needs jobId/jobName, single-run only), or "all". |
| `jobId` | number |  | coerced, integer, > 0 | Job ID to rerun; scope="job", single-run only. |
| `jobName` | string |  | — | jobId alternative for scope="job": case-insensitive substring match against the run's job list; errors on zero or multiple matches. |
| `withDiagnostics` | boolean |  | — | Single-run, scope="failed" only. Fetch a failure-log snippet and richer per-job payload before rerunning. |
| `withFreshLogs` | boolean |  | — | withDiagnostics only. Include a follow-up hint pointing at the ci_get_logs call for fresh failure logs once the new attempt completes. |
| `debug` | boolean |  | — | Enable debug logging (ignored for scope="job") |

### `ci_retry_runner_flake`

Single-call detect-and-retry for the recurring self-hosted-runner-shutdown flake: given a PR number, checks whether the repo's own "CI: Runner Flake" label and "runner shutdown" bot comment are present (applied by ci-orchestrator.yml when a self-hosted runner shuts down mid-run), and if so, extracts the run ID and reruns the affected failed job(s) via the same path as ci_rerun({ withDiagnostics: true }) — without the caller first grepping logs to confirm the failure signature. When both are absent, falls back (LS-9334) to scanning the most recent run's failed/cancelled job logs for the shutdown signature first. Returns a clear, non-error result (never a false positive on a genuine failure) when no signal is found, pointing at ci_rerun({ runId, withDiagnostics: true }) as the manual fallback. Kept separate from ci_rerun: its prNumber input and shutdown-detection precondition give it a materially different schema — the documented escape hatch in the consolidation standard.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prNumber` | number | **required** | coerced, integer, > 0 | PR number to check for the runner-shutdown flake signal and retry if detected. |

### `ci_search_logs`

Prefer this over `gh run view --log | grep` via shell. Search CI logs by pattern with optional regex and context lines.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number |  | coerced, integer, > 0 | Run ID (required when jobId is not provided) |
| `pattern` | string | **required** | min 1 | Search string or regex pattern. Note: `\|` alone does NOT enable alternation (a\|b\|c) — it is matched as a literal pipe character unless isRegex is also set to true. |
| `jobId` | number |  | coerced, integer, > 0 | Job ID |
| `failedOnly` | boolean |  | — | Failed steps only (default: true). WARNING: when the job whose logs contain the searched-for text actually succeeded, this can silently exclude it from the search entirely — the response will still return totalMatches: 0, but with a scopeNote explaining 0 jobs were searched. Set false to search all jobs regardless of conclusion. |
| `attempt` | number |  | coerced, integer, > 0 | Attempt number |
| `isRegex` | boolean |  | — | Treat pattern as regex |
| `caseSensitive` | boolean |  | — | Case-sensitive match |
| `contextBefore` | number |  | coerced, integer, min 0, max 20 | Lines before each match |
| `contextAfter` | number |  | coerced, integer, min 0, max 20 | Lines after each match |
| `limitMatches` | number |  | coerced, integer, > 0, max 30 | Max matches to return |
| `truncateLineLength` | number |  | coerced, integer, > 0, max 10000 | Truncate every line (the matched line and every before/after context line) longer than this many characters. Defaults to 500 for the matched line and 200 for context lines when omitted. |
| `maxChars` | number |  | coerced, integer, > 0, max 200000 | Hard cap on total output characters (default: 50000). Prevents context overflow when limitMatches and context lines together still produce a large response — trailing matches are dropped until the response fits. |

### `ci_session_stats`

Summarise tool-use counts and message metrics for a Claude Code session transcript. Returns total messages, first/last timestamp, per-tool call counts, and bashFallbackRatio (Bash count / total tool uses) — a quick "how MCP-first was this session?" heuristic. Optionally aggregates subagent transcripts into the totals and breaks them out per-subagent. Defaults to the most recently modified parent JSONL when sessionId is omitted.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `sessionId` | string |  | — | Parent session UUID. Defaults to the most recently modified parent JSONL. |
| `project` | string |  | — | Project slug (e.g. "D--code-legacy-sports"). Auto-detected from CWD if omitted. |
| `lineRange` | [] |  | — | Only count messages in this 1-based [start, end] line range — useful for analysing a specific phase of a long session. |
| `includeSubagents` | boolean |  | — | Aggregate subagent stats into the parent totals and return per-subagent breakdowns (default: false). |

### `ci_unwedge_orchestrator`

Prefer this over the raw `gh run list`/`gh api .../jobs`/`gh run view` cancel+ci:run-label sequence. Detects and recovers a wedged ci-orchestrator.yml run: stuck `pending` with 0 jobs, holding the `orchestrator-<PR#>` concurrency group so CI Gate never posts (LS-7752). Finds the PR's stalest pending 0-job run older than staleAfterSeconds (default 300s), cancels it, polls for confirmed cancellation, then applies the "ci:run" label to redispatch via workflow_dispatch. Bounded ~12s per call — an unconfirmed cancellation returns { status: "cancelling", runId, hint } (never an error); re-invoke with that runId to resume without re-discovering/re-cancelling. Other outcomes: "clean" (no wedge found), "unnecessary" (run finished on its own, not wedged), "redispatched" (recovered).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `prNumber` | number | **required** | coerced, integer, > 0 | PR number whose ci-orchestrator.yml run may be wedged. |
| `runId` | number |  | coerced, integer, > 0 | Resume mode: runId from a prior { status: "cancelling" } response. Skips discovery/re-cancellation. |
| `staleAfterSeconds` | number |  | coerced, integer, >= 0 | Min age (s) before a pending 0-job run counts as wedged. Default 300. |
| `maxWaitSeconds` | number |  | coerced, integer, > 0, max 12 | Max wait for cancellation confirmation per call (default/cap: 12s). |

### `ci_view_run`

Prefer this over `gh run view` via shell. View a CI run summary with jobs and conclusions. Pass runIds (1-50) instead of runId to inspect several runs independently in one call (e.g. checking CI across multiple PRs before merging) — attempt and format are single-run only; batch results use the standard partial-failure shape { success, total, succeeded, failed }.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number |  | coerced, integer, > 0 | Run ID (single-run mode). Exactly one of runId/runIds is required. |
| `runIds` | number[] |  | min 1, max 50, coerced, integer, > 0 | Run IDs to inspect independently (1-50, batch mode). Not with runId or attempt. |
| `attempt` | number |  | coerced, integer, > 0 | Attempt number (single-run only). |
| `includeJobs` | boolean |  | — | Include jobs (default: true) |
| `format` | enum |  | — | Output format for single-run mode. "markdown" (default) returns a compact summary with a job table and a Failed Jobs section. "json" returns the full structured payload. Batch mode always returns structured JSON per run. |

### `ci_view_run_jobs`

Prefer this over `gh run view --json jobs` via shell. List per-job name, status, and conclusion for a specific CI run. Use this to confirm all jobs passed before merging a PR. Returns a summary (total, passed, failed, skipped, inProgress, allPassed) plus per-job details. Use filter to narrow to a specific conclusion (e.g. "failure" to see only failed jobs). This is complementary to ci_view_run (run-level summary) and ci_get_logs (log output for failed jobs).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number | **required** | coerced, integer, > 0 | Run ID |
| `attempt` | number |  | coerced, integer, > 0 | Attempt number |
| `filter` | enum |  | — | Filter jobs by conclusion ("failure"/"success"/"skipped"/"cancelled"), or by status for jobs with no conclusion yet ("in_progress" for currently running jobs, "queued"/"pending" for jobs still waiting on a runner — e.g. finding a wedged job directly instead of eyeballing a full job dump). Omit to return all jobs. |
| `includeSteps` | boolean |  | — | Include per-step breakdown for each job (default: false) |

### `ci_wait_run`

Wait for a workflow run to complete, bounded at 20s per call (stays under this Lambda-hosted server's own 30s execution timeout). Returns { status: "completed", conclusion } when the run finishes, or a { status: "in_progress", hint } snapshot (never an error) if it has not — re-invoke to continue waiting. Use after ci_dispatch_workflow returns in_progress, or after a session resume to re-attach to a run without re-dispatching.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `runId` | number | **required** | coerced, integer, > 0 | Run ID |
| `maxWaitSeconds` | number |  | coerced, integer, > 0, max 20 | Max wait per call in seconds (default and cap: 20) |

### `ci_workflow_info`

List workflows or get details for a specific workflow. Optionally includes App installation permissions.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `workflow` | string \| number |  | integer | Workflow filename or numeric ID; omit to list all |
| `includePermissions` | boolean |  | — | Include GitHub App installation permissions (default: false) |

### `ci_workflow_set_state`

Enable or disable a GitHub Actions workflow. Wraps `gh workflow enable/disable <workflow>` via the REST API. Returns the workflow state after the change. Use "enable" to restore a disabled workflow, "disable" to halt automatic runs (e.g. during incident recovery). To read state without modifying it, use ci_workflow_info with a specific workflow.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `workflow` | string \| number | **required** | integer | Workflow filename (e.g. "deploy.yml") or numeric ID |
| `action` | enum | **required** | — | "enable" restores a disabled workflow; "disable" halts automatic runs |

