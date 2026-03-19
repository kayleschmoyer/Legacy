---
name: mcp-jira
description: 'Manage Jira tickets via MCP tools (primary) or acli CLI (fallback). Load when creating tickets, checking blocker status before starting work, transitioning status (In Progress → In Review), or managing sprints and dependencies.'
---

# Skill: Jira MCP Server

## Overview

The Jira MCP server (`tools/mcp/jira-server/`) wraps Jira operations with guardrails using the Jira REST API directly. Credentials are resolved from environment variables (`JIRA_EMAIL` / `JIRA_API_TOKEN`) or `~/.netrc`, so no external CLI tools are required.

## When to Use

- Creating Jira tickets programmatically
- Transitioning ticket status (In Progress, In Review, Done)
- Viewing ticket details with blocker information
- Checking if a ticket's blockers are resolved before starting work
- Setting or changing a ticket's parent epic
- Reading ticket comments for additional context

## Prerequisites

- `JIRA_EMAIL` and `JIRA_API_TOKEN` environment variables set in your shell. VS Code passes them through to the server process automatically (see [Configuration](#configuration)).
- If you prefer not to use environment variables, you can instead create `~/.netrc`:
  ```
  machine bkrupa.atlassian.net
  login your-email@example.com
  password your-api-token
  ```

Credentials are resolved in this priority order by the server:

1. `JIRA_EMAIL` + `JIRA_API_TOKEN` env vars
2. `~/.netrc` Atlassian entry

## Available Tools

### jira_create_ticket

Create a Jira ticket with proper defaults.

| Parameter     | Type   | Required | Default | Description                                                               |
| ------------- | ------ | -------- | ------- | ------------------------------------------------------------------------- |
| `summary`     | string | yes      |         | Ticket summary / title                                                    |
| `type`        | enum   | no       | Task    | Task, Bug, or Story                                                       |
| `description` | string | no       |         | Ticket description                                                        |
| `parent`      | string | no       |         | Parent epic key (LS-640)                                                  |
| `sprint`      | string | no       |         | `"current"` for active sprint, or numeric sprint ID. Omit to leave unset. |

**Guardrail:** Uses Jira REST API directly (no external CLI dependencies).

### jira_transition

Transition a ticket to a new status.

| Parameter | Type   | Required | Description                     |
| --------- | ------ | -------- | ------------------------------- |
| `key`     | string | yes      | Ticket key (LS-1137)            |
| `status`  | enum   | yes      | In Progress, In Review, or Done |

**Guardrail:** Validates the status value and only allows transitions to these statuses via the Jira REST API.

### jira_view

View ticket details in a structured JSON format.

| Parameter | Type   | Required | Description          |
| --------- | ------ | -------- | -------------------- |
| `key`     | string | yes      | Ticket key (LS-1137) |

Returns: `{ key, summary, status, type, priority, description, assignee, reporter, parent, labels[], created, updated, blockers[] }`

### jira_check_blockers

Check if a ticket's blockers are resolved. Implements the 3-way dependency check from the workflow.

| Parameter | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| `key`     | string | yes      | Ticket key to check |

Returns:

```json
{
  "canProceed": true,
  "blockers": [{ "key": "LS-100", "status": "Done", "reason": "..." }],
  "recommendation": "base off main"
}
```

Recommendations:

- `"base off main"` — no blockers or all Done
- `"base off LS-XXXX branch"` — blocker is In Review
- `"STOP — blocker(s) not ready: ..."` — blocker not In Review or Done

### jira_set_parent

Set or change the parent epic of an existing ticket.

| Parameter | Type   | Required | Description          |
| --------- | ------ | -------- | -------------------- |
| `key`     | string | yes      | Ticket key to update |
| `parent`  | string | yes      | Parent epic key      |

**Guardrail:** Uses Jira REST API PUT to set the parent field on existing issues.

### jira_get_comments

Fetch all comments on a Jira ticket.

| Parameter | Type   | Required | Description          |
| --------- | ------ | -------- | -------------------- |
| `key`     | string | yes      | Ticket key (LS-1137) |

Returns: `{ key, total, comments: [{ id, author, body, created, updated }] }`

## Configuration

The server is configured in `.vscode/mcp.json`. It reads `JIRA_EMAIL` and `JIRA_API_TOKEN` directly from your shell environment — no prompting required:

```json
{
  "servers": {
    "legacy-sports-jira": {
      "type": "stdio",
      "command": "node",
      "args": ["--import", "tsx", "tools/mcp/jira-server/src/index.ts"],
      "env": {
        "JIRA_EMAIL": "${env:JIRA_EMAIL}",
        "JIRA_API_TOKEN": "${env:JIRA_API_TOKEN}"
      }
    }
  }
}
```

Set the variables in your shell profile (e.g. `~/.zshrc` or `~/.bashrc`) and restart VS Code. Generate an API token at <https://id.atlassian.com/manage-profile/security/api-tokens>.

Alternatively, create `~/.netrc` — the server falls back to it automatically when env vars are absent.

## Troubleshooting

### Missing Jira credentials / "No Jira credentials found"

1. Confirm `JIRA_EMAIL` and `JIRA_API_TOKEN` are exported in your shell (`echo $JIRA_EMAIL`).
2. Restart VS Code so it picks up the updated environment.
3. As a fallback, create `~/.netrc` with your Atlassian email and API token.

### Tool returns error about status validation

Only `In Progress`, `In Review`, and `Done` are supported transitions. For other Jira statuses, use the Jira web UI or a direct REST client.

## CLI Fallback (acli)

When MCP tools are unavailable, use the `acli` CLI. **Read [references/jira-cli-fallback.md](references/jira-cli-fallback.md)** for the full CLI command reference including: attachment downloads, REST API for parent epics, sprint management, JQL search, investigation ticket workflow, and de-scoping patterns.

**Never use `fetch_webpage` or raw HTTP to access Jira.** If neither MCP tools nor `acli` are available, inform the user that Jira credentials need configuration.

## Best Practices

1. **Update status immediately** when state changes (start work, create PR, merge)
2. **Add to current sprint** for new tickets before implementation
3. **Link related tickets** when de-scoping or splitting work
4. **Close investigation tickets** immediately once a follow-up backlog ticket is created
