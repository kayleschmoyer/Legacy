# MCP CI Server

GitHub Actions workflow run triage and management for Legacy Sports.

## Tools

### Authentication

- **ci_auth_status** — Check GitHub auth status including rate limit info. Also see `github_auth_status` for basic auth status.

### Workflow Runs

- **ci_list_runs** — List recent workflow runs with optional branch, workflow, status, event, and commit filters
- **ci_view_run** — Inspect a workflow run summary, including jobs and conclusions. Pass `runIds` (array, max 50) instead of `runId` to inspect several runs in one call (partial-failure result shape)
- **ci_is_head_sha** — Check whether a SHA (from a webhook check-run/CI-comment event) is still a PR's current head, in one call — replaces the manual `pull_request_read` + `ci_list_runs`/`ci_view_run` cross-check for staleness
- **ci_get_logs** — Retrieve full or failed-only logs for a run or specific job
- **ci_search_logs** — Search run logs with optional regex and context lines
- **ci_rerun** — Rerun failed jobs, a specific job, or an entire workflow run (`scope: "failed" | "job" | "all"`); pass `withDiagnostics: true` for the triage-then-rerun one-shot (failure-log snippet + rerun in one call). Pass `runIds` (array, max 50) instead of `runId` to rerun several runs in one call (partial-failure result shape)
- **ci_cancel_run** — Cancel a single in-flight run via `runId`, or every in-flight run of a workflow on a branch via `workflow`+`branch` (partial-failure result shape)
- **ci_retry_runner_flake** — Detect-and-retry the self-hosted-runner-shutdown flake for a PR in one call
- **ci_dispatch_workflow** — Trigger a workflow_dispatch event

### Workflow State

- **ci_workflow_info** — List all workflows or get info on a specific one (name, state, run counts). Returns `state` field when a specific workflow is given.
- **ci_workflow_set_state** — Enable or disable a GitHub Actions workflow (`action: "enable" | "disable"`)

### Session & Analysis

- **ci_find_session** — Locate a Claude/Copilot agent session by ID
- **ci_session_stats** — Session-level statistics
- **ci_audit_session_bash** — Audit bash commands from agent sessions for MCP gap analysis. Auto-detects the transcript via the server process's own filesystem (`projectsDir` override for CCR path/permission mismatches); when the server has no shared filesystem with the client at all (e.g. a local Windows session against a hosted server, LS-9362), pass `transcriptContent` with the JSONL text read client-side instead — see `.agents/skills/mcp-first/references/audit-workflow.md`.
- **ci_auto_fix** — Classify a CI failure with confidence, evidence, and fix recommendation
- **ci_get_playwright_report** — Retrieve a Playwright HTML test report

## How It Works

The server wraps GitHub REST API calls behind structured MCP tools so agents can inspect and manage CI state without shelling out manually. All API calls use authenticated HTTP requests, resolving credentials from `GH_TOKEN`, `GITHUB_TOKEN`, or `gh` CLI.
