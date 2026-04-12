# `.github/hooks/` — Hook Configs and Scripts

This directory contains both:

- **GitHub Copilot CLI** hook configuration files (`*.json`), which the Copilot CLI loads automatically during agent sessions
- **Git hook scripts** such as `pre-push`, installed via `core.hooksPath` / `make setup-hooks`

This document describes the Copilot CLI hook config `worktree-setup.json`.

## File: `worktree-setup.json`

Registers session lifecycle hooks for worktrees:

| Hook           | Script                                                                                                       | Purpose                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `sessionStart` | `.github/copilot/hooks/setup-worktree-symlink.ps1` / `.github/copilot/hooks/setup-worktree-symlink.sh`       | Creates `node_modules` symlink if session starts in a `*.worktrees\<name>` directory |
| `sessionStart` | `.github/copilot/hooks/cleanup-orphaned-symlinks.ps1` / `.github/copilot/hooks/cleanup-orphaned-symlinks.sh` | Removes broken symlinks from previous sessions                                       |
| `sessionEnd`   | `.github/copilot/hooks/cleanup-worktree-symlink.ps1` / `.github/copilot/hooks/cleanup-worktree-symlink.sh`   | Cleans up on session exit                                                            |
| `preToolUse`   | `.github/copilot/hooks/guard-main-repo.ps1` / `.github/copilot/hooks/guard-main-repo.sh`                     | Prevents destructive ops against the main repo                                       |

## Correct Schema (Copilot CLI)

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "./path/to/script.sh",
        "powershell": "./path/to/script.ps1",
        "cwd": ".",
        "timeoutSec": 15
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

**Key fields:**

- `version: 1` — **required**, hooks will not load without it
- Event names are **camelCase**: `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`
- Command keys: `bash` (Linux/macOS), `powershell` (Windows override)
- Timeout: `timeoutSec` (integer, seconds; default 30)

Docs: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks

## ⚠️ Common Trap: Claude Code Schema Confusion

The Copilot CLI bundle ships a `hooks.md` skill file at:

```
<vscode>/resources/app/extensions/copilot/assets/prompts/skills/agent-customization/references/hooks.md
```

That file describes the **Claude Code** hook format, not the Copilot CLI format. The two schemas look similar but are incompatible:

| Field         | Copilot CLI ✅             | Claude Code ❌ (wrong here) |
| ------------- | -------------------------- | --------------------------- |
| Event names   | `sessionStart` (camelCase) | `SessionStart` (PascalCase) |
| Command keys  | `bash` / `powershell`      | `command` / `windows`       |
| Timeout       | `timeoutSec`               | `timeout`                   |
| Version field | `"version": 1` (required)  | not used                    |
| Session end   | `sessionEnd`               | `Stop`                      |

**Do not use the bundled `hooks.md` skill as a schema reference for this file.**
