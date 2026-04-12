---
name: branch-naming
description: Branch naming conventions by driver type (human, Claude Code launcher, cloud/bot agents). Load when creating branches, pushing for the first time, or naming remote branches.
---

# Skill: Branch Naming

All pushed branches must contain at least one `LS-####` Jira key -- Jira Branch Sync reads the branch name for "In Progress" transitions.

## Patterns by Driver

| Driver                        | Pattern                                                                                                                                                                                                             | Example                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Human / `make worktree`       | `LS-####/short-kebab-description`                                                                                                                                                                                   | `LS-2333/surface-resolved-worktree`                                                |
| Claude Code launcher checkbox | Local stays `claude/<random>`. On **first push**, use `worktree_push({ remoteBranch: "claude/LS-####-short-kebab-description" })` -- remote gets the LS key, local stays unchanged so Claude Code UI stays in sync. | Local: `claude/kind-kepler` / Remote: `claude/LS-3049-worktree-push-remote-branch` |
| Agent (cloud, Copilot, bots)  | `<agent>/LS-####-short-kebab-description[-<suffix>]`                                                                                                                                                                | `copilot/LS-2401-fix-rollbar-init`                                                 |

## Key Rules

- `<agent>` prefix identifies the runner (`claude/`, `copilot/`, `bot/`)
- Separator after `LS-####` in agent branches is `-`, not `/`
- Description is short kebab-case, max 5 words
- One ticket = one branch = one PR
- Do **not** use `worktree_rename_branch` for native-checkbox sessions -- it breaks Claude Code's branch detection
- If on a branch without `LS-####`, include ticket keys in PR title/body as backstop
