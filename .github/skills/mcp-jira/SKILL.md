---
name: mcp-jira
description: 'Use the Jira MCP server tools for ticket operations: create tickets (avoids --json duplication bug), transition status with validation, view structured ticket details, check blocker dependencies (3-way check), and set parent epic via REST API. Load when performing any Jira operation through MCP tools.'
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

## Prerequisites

- Jira credentials available to the MCP server, resolved in this priority order:
  1. Environment variables: `JIRA_EMAIL` and `JIRA_API_TOKEN`
  2. `~/.netrc` with Atlassian credentials:
     ```
     machine bkrupa.atlassian.net
     login your-email@example.com
     password your-api-token
     ```
- MCP server configured in `.vscode/mcp.json` (already included in the repo)

## Available Tools

### jira_create_ticket

Create a Jira ticket with proper defaults.

| Parameter     | Type   | Required | Default | Description              |
| ------------- | ------ | -------- | ------- | ------------------------ |
| `summary`     | string | yes      |         | Ticket summary / title   |
| `type`        | enum   | no       | Task    | Task, Bug, or Story      |
| `description` | string | no       |         | Ticket description       |
| `parent`      | string | no       |         | Parent epic key (LS-640) |

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

Returns: `{ key, summary, status, type, description, assignee, parent, blockers[] }`

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

## Configuration

The server is configured in `.vscode/mcp.json`:

```json
{
  "servers": {
    "legacy-sports-jira": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "tools/mcp/jira-server/src/index.ts"]
    }
  }
}
```

## Troubleshooting

### Missing Jira credentials

The Jira MCP server authenticates to Jira using either environment variables or your `~/.netrc` file.

- Check that `JIRA_EMAIL` and `JIRA_API_TOKEN` are set in your environment.
- If you prefer `~/.netrc`, ensure it exists and contains your Atlassian email and API token.

### "No Atlassian credentials found in ~/.netrc"

If you see this message, either:

- Create `~/.netrc` with your Atlassian email and API token, **or**
- Set `JIRA_EMAIL` and `JIRA_API_TOKEN` environment variables for the process running the MCP server.

### Tool returns error about status validation

Only `In Progress`, `In Review`, and `Done` are supported transitions. For other Jira statuses, use the Jira web UI or a direct REST client.
