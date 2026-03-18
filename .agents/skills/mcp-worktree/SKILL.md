---
name: mcp-worktree
description: 'Run commands in the correct git worktree directory via MCP tools. Load when working with multiple worktrees, running make/nx/git commands, or ensuring commands target the right worktree instead of the main repo.'
---

# Skill: MCP Worktree Server

## Overview

The worktree MCP server prevents the #1 agent failure mode: running commands in the main repo (`D:\code\legacy-sports`) instead of the active worktree. It tracks which worktree you're working in and routes all commands there.

## When to Use

- Working on any Jira ticket (worktree is the default workflow)
- Running `make`, `nx`, or `git` commands when multiple worktrees are active
- Checking whether a path is in the main repo vs a worktree
- Listing worktree status (junction info, branch names)
- Rebasing a branch, stabilizing post-rebase, and pushing

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

### `worktree_rebase`

Fetches origin and rebases the active worktree branch onto its parent via `twig rebase`. Sets `GIT_EDITOR=true` to prevent blocking.

```
worktree_rebase()                      // rebase active worktree
worktree_rebase(worktree: "LS-1134")   // rebase specific worktree
worktree_rebase(abort: true)           // abort an in-progress rebase
```

### `worktree_stabilize`

Runs post-rebase stabilization: `make install` → `print-schema` → `codegen`. Must be run **before** pushing after a rebase.

```
worktree_stabilize()                   // stabilize active worktree
worktree_stabilize(worktree: "LS-1134")
```

### `worktree_push`

Pushes the current branch with `--force-with-lease`. Refuses to push `main`.

```
worktree_push()                        // push active worktree branch
worktree_push(setUpstream: true)       // push with -u
```

## Typical Workflow

1. Start work on a ticket → agent creates worktree
2. `worktree_set(key: "LS-1136")` → sets active worktree
3. `worktree_run(command: "make pc")` → runs in the worktree, not main repo
4. If the agent accidentally targets main repo → gets a clear refusal with guidance

## Rebase Workflow

1. `worktree_rebase()` → fetch + rebase onto parent
2. Resolve conflicts if any (manually or via `worktree_run`)
3. `worktree_stabilize()` → install deps + regenerate schema + codegen
4. `worktree_run(command: "make pc")` → validate everything passes
5. `worktree_push()` → force-push the validated branch

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
