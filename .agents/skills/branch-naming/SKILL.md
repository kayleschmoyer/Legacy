---
name: branch-naming
description: Branch naming conventions by driver type (human, Claude Code launcher, cloud/bot agents). Load when creating branches, pushing for the first time, or naming remote branches.
---

# Skill: Branch Naming

Jira's GitHub integration links development info to tickets by scanning **PR titles**, **commit messages**, and **branch names** for `LS-####` keys. All three are independent — branch name is NOT required if PR title and commits contain the key.

## Jira Linking Strategy

| Signal              | Required?    | Notes                                                                                                                                                             |
| ------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR title**        | Yes          | Must contain `LS-####`. Primary Jira link signal.                                                                                                                 |
| **Commit messages** | Yes          | Include `LS-####` in the commit body or scope (e.g. `feat(auth): LS-1234 add oauth`).                                                                             |
| **Branch name**     | Nice-to-have | Helps but is not required. Claude Code caches the branch name at session start and never refreshes — renaming breaks PR detection (anthropics/claude-code#18690). |

## Patterns by Driver

| Driver                        | Branch pattern                                                                | Jira linking                |
| ----------------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| Human / `make worktree`       | `LS-####/short-kebab-description`                                             | Branch + PR title + commits |
| Claude Code launcher checkbox | **Leave as `claude/<random>`** — do not rename or use `remoteBranch` override | PR title + commits only     |
| Agent (cloud, Copilot, bots)  | `<agent>/LS-####-short-kebab-description[-<suffix>]`                          | Branch + PR title + commits |

## Key Rules

- **Do not rename branches** in native-checkbox sessions — Claude Code caches the branch name at session start; renaming permanently disables PR detection and "Create PR" button (anthropics/claude-code#18690)
- **Do not use `remoteBranch` override** on `worktree_push` — local/remote name mismatch confuses PR association
- `<agent>` prefix identifies the runner (`claude/`, `copilot/`, `bot/`)
- Separator after `LS-####` in agent branches is `-`, not `/`
- Description is short kebab-case, max 5 words
- One ticket = one branch = one PR
- PR title format: `LS-#### type(scope): description` — this is the primary Jira link for launcher-checkbox sessions
