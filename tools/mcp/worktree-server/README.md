# MCP Worktree Server

An MCP (Model Context Protocol) server that tracks the active git worktree and ensures all commands run in the correct directory. Prevents the #1 agent failure mode: running commands in the main repo instead of the active worktree.

## Tools

### `worktree_list`

List all active worktrees with symlink status and branch info.

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

`worktree_run` enforces a fixed 120s process-level cap. For ad-hoc commands that legitimately run longer (e.g. an untargeted full-suite `jest` run with no dedicated nx target), use `worktree_run_long` instead.

### `worktree_run_long`

Like `worktree_run`, but with a caller-adjustable process-level timeout instead of the fixed 120s cap. Use for long (>120s) ad-hoc commands that have no dedicated nx target to run through `nx_run`'s job/wait support — especially when the command needs to run in a worktree other than the active one. Uses the same background job/poll pattern (`worktree_job_wait` / `worktree_job_status`) as `worktree_run`.

| Parameter        | Type    | Required | Description                                               |
| ---------------- | ------- | -------- | --------------------------------------------------------- |
| `command`        | string  | Yes      | Shell command to execute                                  |
| `worktree`       | string  | No       | Ticket key. Uses active worktree if omitted.              |
| `allowMainRepo`  | boolean | No       | Override: allow running in the main repo.                 |
| `tailLines`      | integer | No       | Cap output to the last N lines.                           |
| `timeoutSeconds` | number  | No       | Process-level timeout in seconds (default 600, max 3600). |

### `worktree_guard`

Check whether a path is inside the main repo and warn if worktrees are active.

| Parameter | Type   | Required | Description   |
| --------- | ------ | -------- | ------------- |
| `path`    | string | Yes      | Path to check |

### `worktree_rebase`

Fetch origin and rebase the active worktree branch onto its parent (via `twig rebase`). Injects a cross-platform no-op Git editor so agent workflows never block on commit-message prompts.

| Parameter  | Type    | Required | Description                                    |
| ---------- | ------- | -------- | ---------------------------------------------- |
| `worktree` | string  | No       | Ticket key. Uses active worktree if omitted.   |
| `abort`    | boolean | No       | If true, aborts an in-progress rebase instead. |

### `worktree_stabilize`

Run post-rebase stabilization: `make install`, regenerate schema, and run codegen on affected projects. Must be run **before** pushing after a rebase.

| Parameter  | Type   | Required | Description                                  |
| ---------- | ------ | -------- | -------------------------------------------- |
| `worktree` | string | No       | Ticket key. Uses active worktree if omitted. |

### `worktree_stash`

Temporarily shelve uncommitted changes. Equivalent to `git stash push -u -m <message>` (includes untracked files). Use before running baseline tests to verify whether failures are pre-existing, then restore with `worktree_stash_pop`.

| Parameter  | Type   | Required | Description                                  |
| ---------- | ------ | -------- | -------------------------------------------- |
| `message`  | string | No       | Optional label for the stash entry.          |
| `worktree` | string | No       | Ticket key. Uses active worktree if omitted. |

### `worktree_stash_pop`

Restore the most recently stashed changes. Equivalent to `git stash pop`.

| Parameter  | Type   | Required | Description                                  |
| ---------- | ------ | -------- | -------------------------------------------- |
| `worktree` | string | No       | Ticket key. Uses active worktree if omitted. |

### `worktree_push`

Push the current branch with `--force-with-lease`. Refuses to push the `main` branch.

| Parameter     | Type    | Required | Description                                  |
| ------------- | ------- | -------- | -------------------------------------------- |
| `worktree`    | string  | No       | Ticket key. Uses active worktree if omitted. |
| `setUpstream` | boolean | No       | If true, adds `-u` to set upstream tracking. |

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
2. **Symlink detection** — checks `node_modules` in each worktree via `fs.lstatSync` to distinguish symlinked (shared) vs independent installs.
3. **Main-repo guard** — `worktree_run` refuses to execute commands in the main repo when any worktrees are active, preventing accidental mutation of the shared `node_modules` or dirty commits on `main`.
4. **Active tracking** — `worktree_set` stores the active worktree in memory (session-scoped) so subsequent `worktree_run` calls don't need to specify the target.
5. **Rebase workflow** — `worktree_rebase` → `worktree_rebase_continue` → `worktree_stabilize` → `worktree_push` provides a complete rebase-to-push pipeline with agent-safe defaults (including a non-interactive Git editor) and main-branch push protection.
