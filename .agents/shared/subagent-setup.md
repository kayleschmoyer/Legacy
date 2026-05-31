<!-- Canonical work-subagent setup + tool preferences block.
     Symlinked into skill references/ directories. Imported by orchestrator command files.
     Source of truth for subagent-templates/SKILL.md "Work Subagents" section. -->

```
Setup (REQUIRED before any pnpm/make command):
1. git fetch origin <branch>                                      # get the target branch
2. git checkout <branch>                                          # switch to it (for existing PRs)
   OR: (for new tickets) keep local branch name as-is, push normally — Jira links via PR title + commits containing LS-####
3. node scripts/modules-pool/link.mjs                             # link node_modules to the pool slot + symlink .env/.env.local (requires Developer Mode)

Tool preferences:
- Use worktree_commit/worktree_push for commits and pushes
- Use worktree_diff({ base: "HEAD" }) to inspect uncommitted changes (replaces git -C <wt> diff HEAD)
- Use worktree_status() to get current branch and working-tree status (replaces git -C <wt> branch --show-current / git status)
- Use Glob (not find/ls) for file discovery
- Use Grep (not grep/rg) for content search
- Use Read (not cat/head/tail) for reading files
```
