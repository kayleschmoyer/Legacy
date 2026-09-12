# Subagent Dispatch (legacy / parent-ticket iteration)

> Loaded from [worktree-workflow SKILL](../SKILL.md).

## Subagent Dispatch (legacy / parent-ticket iteration)

**`/work-ticket` Parent Mode dispatches chips** via `mcp__ccd_session__spawn_task` — use that first. `Agent(isolation: "worktree")` subagents are the **fallback** for environments where `mcp__ccd_session__spawn_task` is unavailable (ToolSearch returns no result). The orchestrator itself only makes API calls — it never modifies its own working tree.

**Why subagents?**

- Each subagent gets its own ephemeral worktree — no contamination between tickets
- Subagents **inherit the parent's MCP connections** (every stdio server in `.mcp.json`)
- Automatic cleanup — ephemeral worktrees are discarded after the subagent returns
- **Session-type-agnostic** — works identically whether the orchestrator was launched with the worktree checkbox, from the main repo, or from a cloud environment

**Subagent dispatch pattern** (setup + tool preferences from [`.agents/shared/subagent-setup.md`](subagent-setup.md)):

```
for each ticket/PR needing code work:
  result = Agent(
    isolation: "worktree",
    prompt: """
      Implement/fix <ticket-or-PR-description>.

      Setup (REQUIRED before any pnpm/make command):
      1. git fetch origin <branch-or-main>
      2. git checkout <existing-branch>  (for PRs)  OR  stay on the ephemeral branch (for new tickets)
      3. node scripts/modules-pool/link.mjs   # links node_modules to the pool slot (requires Developer Mode) — NEVER use mklink /J or New-Item junction commands
      4. <do NOT rename branch — Jira links via PR title + commits containing LS-####>
      5. If you need to install new packages: powershell -NoProfile -Command "Remove-Item -Path node_modules -Force" first, then pnpm add -w <pkg>, then make install

      Work (order per .agents/skills/workflow-overview/references/ticket-to-merge-spine.md — draft PR before validation):
      6. <specific instructions — implement ticket, fix review, rebase, etc.>
      7. worktree_commit + worktree_push
      8. github_open_pr(draft: true) (if new) or push to existing PR branch
      9. make_run(target: "pc") — then self-review and github_mark_pr_ready when green

      Tool preferences:
      - Use worktree_commit/worktree_push for commits and pushes
      - Use worktree_diff({ base: "HEAD" }) to inspect uncommitted changes
      - Use worktree_status() to get current branch and working-tree status
      - Use Glob (not find/ls) for file discovery
      - Use Grep (not grep/rg) for content search
      - Use Read (not cat/head/tail) for reading files

      Return: { prNumber, status, issues }
    """
  )
  # Orchestrator processes result, updates tracking, moves to next item
```

**Orchestrator responsibilities** (API calls only, no file edits):

- Scan PRs (`github_pr_dashboard`) or list tickets (`jira_list_children`)
- Route decisions (what each PR/ticket needs: rebase, fix review, implement)
- Dispatch subagents with specific instructions
- Track in-flight PRs and drain them (check merge status, re-dispatch for fixes)
- Report results

**Fallback — sequential branch switching** (if `Agent(isolation: "worktree")` is unavailable):

```
original_branch = git branch --show-current
for each target:
  git fetch origin <branch>
  git checkout <branch>
  node scripts/modules-pool/link.mjs   # idempotent — re-links instantly if the slot is already built
  # ... do work, commit, push ...
  # (must commit+push before switching — dirty working tree blocks checkout)
git checkout $original_branch
```
