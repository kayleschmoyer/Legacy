---
name: mcp-gap-audit
description: 'REQUIRED workflow step 12b — run after shipping PR, before cleanup. Audit all Bash commands from this session to identify MCP tooling gaps. Checks for existing tickets under LS-1455 and creates new ones for uncovered gaps. Load when finishing ticket work or when auditing MCP coverage.'
---

# Skill: MCP Gap Audit

## Overview

After every agent session, review the Bash commands that were executed and determine which ones should have been (or could become) MCP tool invocations. For each identified gap, check whether a ticket already exists under the **LS-1455** epic ("AI Workspace Improvements") and create one if not.

This skill enforces the **MCP-first principle** from AGENTS.md: shell commands are fallbacks, not defaults.

## When to Use

- At the end of any agent session that involved Bash commands
- When the user asks to audit MCP coverage or identify tooling gaps
- During retrospectives on agent workflow friction

## Steps

### 1. Collect non-MCP commands from the session

Review the conversation history for all `Bash` tool invocations. Ignore:

- **Git commands** already covered by `worktree_*` MCP tools (e.g., `git -C $wt status` → `worktree_status`)
- **One-off investigative commands** (e.g., `ls`, `cat` for quick file inspection) — these are not worth tooling
- **Commands with no realistic MCP equivalent** (e.g., interactive editors, ad-hoc `python -c` scripts)

Focus on commands that:

- Were used to accomplish a **repeatable workflow step** (build, test, deploy, query, migrate)
- Have an existing MCP server that _should_ cover them but doesn't
- Were run because the agent didn't know an MCP tool existed, or the MCP tool was missing a feature

### 2. Classify each command

For each candidate command, determine:

| Field               | Description                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell command**   | The exact command or pattern (e.g., `pnpm exec nx run <project>:test -- -u`)                                                                        |
| **Why it was used** | What the agent was trying to accomplish                                                                                                             |
| **MCP server**      | Which existing MCP server should own this (or "new server needed")                                                                                  |
| **Gap type**        | `missing-tool` (no tool exists), `missing-feature` (tool exists but lacks a flag/option), `missing-awareness` (tool exists but agent didn't use it) |

### 3. Filter out `missing-awareness` gaps

If the gap type is `missing-awareness` — the MCP tool already exists and is fully capable — this is a **skill/documentation issue**, not a tooling gap. Instead of creating a ticket:

- Note which AGENTS.md or skill doc failed to guide the agent to the right tool
- Consider whether a skill update or AGENTS.md clarification would fix it

### 4. Check for existing tickets under LS-1455

Search for child tickets of the **LS-1455** epic using one of these options:

- **Local-only (non-MCP) CLI** — if available on your machine:
  ```bash
  acli jira workitem search --jql "parent = LS-1455 ORDER BY created DESC"
  ```
- **Jira UI** — open Jira in the browser and run the same JQL in the search bar / advanced search:
  ```text
  parent = LS-1455 ORDER BY created DESC
  ```

Once you have the list of tickets, you can use the `jira_view` MCP tool on specific keys as needed to inspect details.

Scan summaries for matches. Common patterns in existing tickets:

- `feat(mcp): add <tool_name> ...`
- `MCP: add <tool_name> ...`
- `fix(mcp): <server>_<tool> ...`

### 5. Create tickets for new gaps

For each gap not already tracked, use the `jira_create_ticket` MCP tool:

- **Summary**: `feat(mcp): add <proposed_tool_name> to <server> for <purpose>`
- **Type**: `Task`
- **Parent**: `LS-1455`
- **Description** (template):

```
## Gap Identified

**Shell command observed**: `<command>`
**Agent intent**: <what the agent was trying to do>
**Gap type**: missing-tool | missing-feature

## Proposed MCP Tool

**Server**: <mcp-server-name>
**Tool name**: `<proposed_tool_name>`
**Parameters**: <key params and types>
**Returns**: <structured output description>

## Context

Identified during agent session on <date>.
<Any additional context about why this would improve agent workflows.>
```

### 6. Report findings

Summarize the audit results to the user:

- Total Bash commands reviewed
- Commands identified as MCP gaps
- Existing tickets found (with keys)
- New tickets created (with keys)
- Any `missing-awareness` issues noted (skill/doc fixes needed)

## Gotchas

- **Don't create duplicate tickets** — always search LS-1455 children first. Summaries may vary; match on the _underlying capability_, not exact wording.
- **Don't ticket one-off commands** — only commands that represent a repeatable pattern across sessions.
- **`missing-feature` vs `missing-tool`** — if a tool exists but needs a new parameter (e.g., `nx_run` lacking `--updateSnapshot`), that's `missing-feature`, not `missing-tool`. The ticket should reference the existing tool.
- **MCP server scope** — each server has a defined domain (see AGENTS.md MCP Servers table). Don't propose adding a git tool to the DB server.
