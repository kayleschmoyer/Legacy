---
name: mcp-worktree
description: 'Use the MCP worktree server to run commands in the correct git worktree directory; covers worktree_list, worktree_set, worktree_run, and worktree_guard tools. Load when working with multiple worktrees, running make/nx/git commands, or when you need to ensure commands target the right worktree instead of the main repo.'
---

# Skill: MCP Worktree Server

## Overview

The worktree MCP server prevents the #1 agent failure mode: running commands in the main repo (`D:\code\legacy-sports`) instead of the active worktree. It tracks which worktree you're working in and routes all commands there.

## When to Use

- Working on any Jira ticket (worktree is the default workflow)
- Running `make`, `nx`, or `git` commands when multiple worktrees are active
- Checking whether a path is in the main repo vs a worktree
- Listing worktree status (junction info, branch names)

## Available Tools

### `worktree_list`

Lists all active worktrees with branch, path, and `node_modules` junction status.

### `worktree_set`

Sets the active worktree for subsequent `worktree_run` calls.

```
worktree_set(key: "LS-1134")
```

### `worktree_run`

Runs a shell command in the active worktree. Refuses to run in the main repo when worktrees are active (safety guard).

```
worktree_run(command: "make pc")
worktree_run(command: "git status", worktree: "LS-1134")
worktree_run(command: "make clean", allowMainRepo: true)  // override guard
```

### `worktree_guard`

Checks if a path is inside the main repo and warns if worktrees exist.

```
worktree_guard(path: "D:\\code\\legacy-sports")
// → { isMainRepo: true, activeWorktrees: ["LS-1134", ...], warning: "..." }
```

## Typical Workflow

1. Start work on a ticket → agent creates worktree
2. `worktree_set(key: "LS-1136")` → sets active worktree
3. `worktree_run(command: "make pc")` → runs in the worktree, not main repo
4. If the agent accidentally targets main repo → gets a clear refusal with guidance

## Setup

The server is configured in `.vscode/mcp.json` (already included in the repo):

```json
{
  "servers": {
    "worktree": {
      "type": "stdio",
      "command": "node",
      "args": ["--import", "tsx", "tools/mcp/worktree-server/src/index.ts"]
    }
  }
}
```

No additional setup required — VS Code discovers MCP servers from this file automatically.

## Troubleshooting

| Problem                     | Fix                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------- |
| Server won't start          | Run `node --import tsx tools/mcp/worktree-server/src/index.ts` manually to see errors |
| "No worktree found for key" | Run `worktree_list` to see available keys; ensure the worktree exists                 |
| Command times out           | Default timeout is 2 minutes; long-running commands may need the terminal instead     |
