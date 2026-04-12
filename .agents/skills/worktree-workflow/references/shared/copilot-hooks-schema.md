# Copilot CLI Hook Schema Reference

This document describes the correct hook configuration schema for `.github/hooks/*.json` files loaded by the **GitHub Copilot CLI**.

Official docs: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks  
Full reference: https://docs.github.com/en/copilot/reference/hooks-configuration

## Schema

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "./scripts/my-hook.sh",
        "powershell": "./scripts/my-hook.ps1",
        "cwd": ".",
        "timeoutSec": 30
      }
    ],
    "sessionEnd": [...],
    "preToolUse": [...],
    "postToolUse": [...],
    "userPromptSubmitted": [...],
    "errorOccurred": [...]
  }
}
```

## Field Reference

| Field        | Type    | Required | Notes                                                  |
| ------------ | ------- | -------- | ------------------------------------------------------ |
| `version`    | integer | **Yes**  | Must be `1`. Hooks silently fail to load without this. |
| `hooks`      | object  | **Yes**  | Map of event name → array of hook objects              |
| `type`       | string  | Yes      | Always `"command"`                                     |
| `bash`       | string  | No       | Shell command or script path (Linux/macOS)             |
| `powershell` | string  | No       | PowerShell command or script path (Windows)            |
| `cwd`        | string  | No       | Working directory for the command (default: `.`)       |
| `timeoutSec` | integer | No       | Timeout in seconds (default: 30)                       |
| `env`        | object  | No       | Additional environment variables                       |

## Event Names (camelCase)

| Event                 | When it fires                                        |
| --------------------- | ---------------------------------------------------- |
| `sessionStart`        | New session begins or an existing session resumes    |
| `sessionEnd`          | Session completes or is terminated                   |
| `userPromptSubmitted` | User submits a prompt                                |
| `preToolUse`          | Before the agent calls any tool (can deny execution) |
| `postToolUse`         | After a tool completes                               |
| `errorOccurred`       | When an error occurs during agent execution          |

## Input / Output

Each hook receives JSON on stdin. `sessionStart` input:

```json
{
  "timestamp": 1704614400000,
  "cwd": "/path/to/project",
  "source": "new",
  "initialPrompt": "..."
}
```

`preToolUse` can return JSON to deny tool execution:

```json
{ "permissionDecision": "deny", "permissionDecisionReason": "Reason here" }
```

All other hooks — output is ignored.

## ⚠️ Do Not Confuse with Claude Code Schema

The Copilot CLI bundle ships a `hooks.md` skill file inside the VS Code extension assets. That file describes the **Claude Code** hook format, which looks similar but uses a different schema:

| Field             | Copilot CLI ✅            | Claude Code ❌        |
| ----------------- | ------------------------- | --------------------- |
| Event names       | `sessionStart`            | `SessionStart`        |
| Command keys      | `bash` / `powershell`     | `command` / `windows` |
| Timeout           | `timeoutSec`              | `timeout`             |
| Version field     | required (`"version": 1`) | not present           |
| Session end event | `sessionEnd`              | `Stop`                |

**Never use the bundled extension `hooks.md` as a reference for `.github/hooks/*.json` files.**

## Troubleshooting Hooks Not Firing

1. **`"version": 1` missing** — hooks will not load at all
2. **Wrong event name casing** — `SessionStart` (PascalCase) is Claude Code format; use `sessionStart`
3. **Script not executable** — on Linux/macOS: `chmod +x script.sh`
4. **No shebang** — bash scripts need `#!/bin/bash` on the first line
5. **Hook file not in `.github/hooks/`** — the CLI loads hooks from the cwd's `.github/hooks/` directory
6. **Session not in the repo root** — hooks are loaded relative to cwd; if the session starts in a subdirectory, the `.github/hooks/` path may not resolve
7. **`disableAllHooks: true`** in `~/.copilot/config.json` — globally disables all hooks

## Our Hooks (`.github/hooks/worktree-setup.json`)

Registers these hooks for worktree sessions:

- **`sessionStart`**: Creates `node_modules` directory symlink when session opens in a `*.worktrees\<name>` directory. Also cleans up orphaned symlinks from prior sessions.
- **`sessionEnd`**: Cleans up the symlink on session exit.
- **`preToolUse`**: Guards against destructive operations targeting the main repo.

Hook scripts live in `.github/copilot/hooks/`.
