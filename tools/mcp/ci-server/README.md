# MCP CI Server

GitHub Actions workflow run triage and management for Legacy Sports.

## Tools

### Authentication

- **ci_auth_status** — Check GitHub auth status including rate limit info. Also see `github_auth_status` for basic auth status.

### Workflow Runs

- **ci_list_runs** — List recent workflow runs with optional branch, workflow, status, event, and commit filters
- **ci_view_run** — Inspect a workflow run summary, including jobs and conclusions
- **ci_get_logs** — Retrieve full or failed-only logs for a run or specific job
- **ci_search_logs** — Search run logs with optional regex and context lines
- **ci_rerun** — Rerun failed jobs, a specific job, or an entire workflow run
- **ci_wait_for_run** — Poll until a workflow run reaches a terminal state
- **ci_dispatch_workflow** — Trigger a workflow_dispatch event

### Workflow State

- **ci_workflow_info** — List all workflows or get info on a specific one (name, state, run counts). Returns `state` field when a specific workflow is given.
- **ci_workflow_set_state** — Enable or disable a GitHub Actions workflow (`action: "enable" | "disable"`)

### Session & Analysis

- **ci_find_session** — Locate a Claude/Copilot agent session by ID
- **ci_session_stats** — Session-level statistics
- **ci_audit_session_bash** — Audit bash commands from agent sessions for MCP gap analysis
- **ci_auto_fix** — Classify a CI failure with confidence, evidence, and fix recommendation
- **ci_get_playwright_report** — Retrieve a Playwright HTML test report

## How It Works

The server wraps GitHub REST API calls behind structured MCP tools so agents can inspect and manage CI state without shelling out manually. All API calls use authenticated HTTP requests, resolving credentials from `GH_TOKEN`, `GITHUB_TOKEN`, or `gh` CLI.
