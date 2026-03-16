# MCP CI Server

GitHub Actions workflow run triage for Legacy Sports.

## Tools

- **ci_list_runs** - List recent workflow runs with optional branch, workflow, status, event, and commit filters.
- **ci_view_run** - Inspect a workflow run summary, including jobs and conclusions.
- **ci_get_logs** - Retrieve full or failed-only logs for a run or specific job.
- **ci_search_logs** - Search run logs with optional regex and context lines for evidence-first debugging.
- **ci_rerun** - Rerun failed jobs, a specific job, or an entire workflow run.

## How It Works

The server wraps `gh run` commands behind structured MCP tools so agents can inspect CI state without shelling out manually. It executes GitHub CLI commands from the repo root and returns JSON-formatted results that are easier to consume in agent workflows.
