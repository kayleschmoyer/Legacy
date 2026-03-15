# MCP Worktree Server

An MCP (Model Context Protocol) server that tracks the active git worktree and ensures all commands run in the correct directory. Prevents the #1 agent failure mode: running commands in the main repo instead of the active worktree.

## Tools

### `worktree_list`

List all active worktrees with junction status and branch info.

### `worktree_set`

Set the active worktree for subsequent commands.

| Parameter | Type   | Required | Description                         |
| --------- | ------ | -------- | ----------------------------------- |
| `key`     | string | Yes      | Ticket key like `LS-1134` or `1134` |

### `worktree_run`

Run a shell command in the active (or specified) worktree. Refuses to execute in the main repo when worktrees are active unless overridden.

| Parameter       | Type    | Required | Description                                  |
| --------------- | ------- | -------- | -------------------------------------------- |
| `command`       | string  | Yes      | Shell command to execute                     |
| `worktree`      | string  | No       | Ticket key. Uses active worktree if omitted. |
| `allowMainRepo` | boolean | No       | Override: allow running in the main repo.    |

### `worktree_guard`

Check whether a path is inside the main repo and warn if worktrees are active.

| Parameter | Type   | Required | Description   |
| --------- | ------ | -------- | ------------- |
| `path`    | string | Yes      | Path to check |

## Setup

The server is configured in `.vscode/mcp.json`:

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

### Prerequisites

- `@modelcontextprotocol/sdk` installed (workspace root devDependency)
- `tsx` installed (workspace root devDependency)

## How It Works

1. **Worktree discovery** — uses `git worktree list --porcelain` to enumerate all worktrees, regardless of where they live on disk.
2. **Junction detection** — checks `node_modules` in each worktree via `fs.lstatSync` to distinguish junctioned (shared) vs independent installs.
3. **Main-repo guard** — `worktree_run` refuses to execute commands in the main repo when any worktrees are active, preventing accidental mutation of the shared `node_modules` or dirty commits on `main`.
4. **Active tracking** — `worktree_set` stores the active worktree in memory (session-scoped) so subsequent `worktree_run` calls don't need to specify the target.
