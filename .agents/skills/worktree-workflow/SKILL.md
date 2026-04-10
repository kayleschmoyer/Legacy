---
name: worktree-workflow
description: 'Route agents to the correct worktree flow for Jira ticket work. Two flows exist: (1) native ephemeral worktree via Claude Code launcher `worktree` checkbox (primary, single-ticket, native branch detection); (2) sibling worktree under D:\code\legacy-sports-worktrees\ (parallel / batch orchestrators only: sweep, work-bugs, work-mcp-gaps, chained branches, parent tickets). Load when starting ticket work; routes to the right flow guide.'
---

# Skill: Worktree Workflow

This skill is a **router**. It describes the two worktree flows, when to use each, and which detailed guide to read next. Most agents should only need the native-flow section — the sibling-flow reference is loaded only when running a parallel / batch orchestrator.

## Choose your flow

| Flow                                 | When                                                                                                  | Detail guide                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Native ephemeral (primary)**       | Single-ticket leaf work. Session spawned with Claude Code launcher `worktree` checkbox checked.       | See "Native Flow" below + [AGENTS.md Workflow Step 4](../../../AGENTS.md) + [work-ticket SKILL.md](../work-ticket/SKILL.md) |
| **Subagent dispatch (multi-ticket)** | Multi-ticket orchestrators: sweep, work-bugs, work-mcp-gaps, parent/epic iteration, batch workers.    | See "Subagent Dispatch" below + orchestrator command files                                                                  |
| **Sibling worktree (legacy)**        | Fallback when `Agent(isolation: "worktree")` is unavailable, or chained branch stacks requiring twig. | See [references/sibling/sibling-worktree-flow.md](references/sibling/sibling-worktree-flow.md)                              |

> **Both flows keep `D:\code\legacy-sports` on `main`.** Working in the main repo directory with HEAD on a feature branch is forbidden. The native flow puts the branch in `.claude/worktrees/<name>/`; the sibling flow puts it in `D:\code\legacy-sports-worktrees\<ticket>\`.

## Native Flow (primary)

The Claude Code session was spawned with the launcher `worktree` checkbox checked. The session's primary working directory is already `.claude/worktrees/<name>/` on an auto-generated `claude/<random>` branch. Claude Code's header, `Create PR` button, and `gitStatus` in the system prompt all reflect the ticket branch natively — no custom tooling needed.

### Steps

1. **Jira auth** — `jira_auth_status()`. Stop if not configured.
2. **Inspect ticket** — `jira_view(key: "LS-####")` / `jira_list_children(key: "LS-####")` for parents.
3. **Blocker check** — `jira_check_blockers(key: "LS-####")`. Stop if blockers are not In Review/Done.
4. **Jira → In Progress** — `jira_transition(key: "LS-####", status: "In Progress")`.
5. **Rename the auto-generated branch** — Claude Code gave you `claude/<random>`. You must rename to include the `LS-####` key **before the first push** (Jira Branch Sync reads the branch name):
   ```
   worktree_run(command: "git branch -m claude/LS-####-short-kebab-description")
   ```
6. **Register the active worktree** — so MCP tools target the right tree:
   ```
   worktree_set(key: "<absolute .claude/worktrees/... path from pwd>")
   ```
7. **Junction `node_modules` from the main repo** (REQUIRED before any pnpm/make command — LS-2903/LS-3003):
   ```
   worktree_setup_node_modules()
   ```
   Uses Node.js path APIs internally — no shell escaping needed. Idempotent (safe to call if junction already exists). Fallback if MCP unavailable: `powershell -Command "New-Item -ItemType Junction -Path '<worktree>\node_modules' -Target 'D:\code\legacy-sports\node_modules'"`
8. **Implement** — read the ticket description, investigate, write code + tests. See [work-ticket SKILL.md Step 5](../work-ticket/SKILL.md) for self-review + implementation notes.
9. **Migrations** — `db_migration_status()` then `db_migrate()`.
10. **Validate** — `make_run(target: "pc")`. Must pass before pushing.
11. **Ship** — `worktree_commit` → `worktree_push` → `github_create_pr(draft: true)` → `github_manage_labels([+"agent-in-progress"])` → `github_mark_pr_ready` → `github_request_review` → subscribe to PR activity → `jira_transition("In Review")`.
    - **Pre-push hook fails with `nx` not found or `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`**: `node_modules/.bin` is empty or missing (where the pnpm shims live). Use `worktree_push({ skipLint: true })` — do **not** use `SKIP_PREPUSH_LINT=1 git push`. **Important:** `skipLint` bypasses the entire hook after the lockfile checks — conflict-marker and Terraform validations are also skipped, not just formatting. Only use as a last resort; manually run Prettier and check for conflict markers before pushing: `node node_modules/prettier/bin/prettier.cjs --write <files>`.
12. **Watch to merge** — monitor CI, fix failures, respond to review comments, rebase as needed.
13. **After merge** — MCP gap audit, mark tracking tasks complete, cleanup.

### Native-flow specifics

- **`make_wt_setup` is NOT used** — it's sibling-only. The junction command above replaces it.
- **`worktree_list` / `make_worktree_create` are NOT used** — you're already in a worktree, Claude Code created it for you.
- **On exit**, `ExitWorktree(action: "remove")` cleans up the ephemeral worktree. Only call this when explicitly done — the worktree can survive across sessions if kept.
- **If MCP servers are missing** from the session (LS-2902 — Claude Code connects only the first few servers from `.mcp.json` in worktree-spawned sessions), the critical ticket-work servers (`worktree`, `github`, `make`, `nx`) are now at the top of `.mcp.json` so they load first. Fallback for missing ones: `gh` CLI, raw `git`, `pnpm exec nx` — all work from Bash.

## Subagent Dispatch (multi-ticket orchestrators)

Multi-ticket commands (`/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`, `/work-ticket` on an epic/parent with children) dispatch **`Agent(isolation: "worktree")` subagents** for each ticket or PR that needs code work. The orchestrator itself only makes API calls — it never modifies its own working tree.

**Why subagents?**

- Each subagent gets its own ephemeral worktree — no contamination between tickets
- Subagents **inherit the parent's MCP connections** (all 9 servers), bypassing the LS-2902 first-N loading cap that affects session-launcher worktrees
- Automatic cleanup — ephemeral worktrees are discarded after the subagent returns
- **Session-type-agnostic** — works identically whether the orchestrator was launched with the worktree checkbox, from the main repo, or from a cloud environment

**Subagent dispatch pattern:**

```
for each ticket/PR needing code work:
  result = Agent(
    isolation: "worktree",
    prompt: """
      Implement/fix <ticket-or-PR-description>.

      Setup:
      1. git fetch origin <branch-or-main>
      2. git checkout <existing-branch>  (for PRs)  OR  stay on the ephemeral branch (for new tickets)
      3. worktree_setup_node_modules()   # or PowerShell fallback if MCP unavailable
      4. <rename branch if new ticket: git branch -m claude/LS-####-description>

      Work:
      5. <specific instructions — implement ticket, fix review, rebase, etc.>
      6. make_run(target: "pc")
      7. worktree_commit + worktree_push
      8. github_create_pr (if new) or push to existing PR branch

      Tool preferences:
      - Use worktree_commit/worktree_push for commits and pushes
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
  worktree_setup_node_modules()  # idempotent — skips if junction already correct
  # ... do work, commit, push ...
  # (must commit+push before switching — dirty working tree blocks checkout)
git checkout $original_branch
```

## Sibling Worktree Flow (legacy / chained branches)

The sibling worktree flow under `D:\code\legacy-sports-worktrees\` is now a **legacy fallback**, retained for:

- Chained branch stacks that require `twig` parent dependency tracking
- Environments where `Agent(isolation: "worktree")` is not available AND sequential branch switching is impractical
- Pre-existing sibling worktrees from before the native-checkbox migration

> **📎 Full sibling-flow guide**: [references/sibling/sibling-worktree-flow.md](references/sibling/sibling-worktree-flow.md). Load this only when you specifically need the sibling worktree pattern.

Quick sibling-flow reference:

```
make_worktree_create({ ticket: "####", description: "desc" })   # create branch + sibling worktree
make_wt_setup({ worktreePath: "<path>" })                       # junction node_modules, copy .env, link .twig
worktree_set(key: "LS-####")                                    # make it active
# ... work ...
worktree_commit + worktree_push + github_create_pr
twig worktree clean                                             # after merge
```

## Shared References (applicable to both flows)

Some topics apply regardless of which flow you are in:

- [concurrent-agent-safety.md](references/shared/concurrent-agent-safety.md) — shared `node_modules` rules, safe parallel operations (applies whenever multiple worktrees exist, native or sibling)
- [service-validation.md](references/shared/service-validation.md) — validating against real local dev services before committing (flow-agnostic — applies to any worktree)
- [user-testing.md](references/shared/user-testing.md) — testing UI live against running dev servers (flow-agnostic)
- [workflow-common-mistakes.md](references/shared/workflow-common-mistakes.md) — wrong parent, duplicate branches, partial implementation (both flows)
- [workflow-recovery-procedures.md](references/shared/workflow-recovery-procedures.md) — recovering from common failure modes

## Sibling-Flow-Only References

These are loaded by `references/sibling/sibling-worktree-flow.md` and are not relevant to native-flow sessions:

- [branch-tree-management.md](references/sibling/branch-tree-management.md) — stacked branches, cascade rebase (sibling-specific)
- [manual-worktree-setup.md](references/sibling/manual-worktree-setup.md) — alternative to `make wt-setup`
- [worktree-multi-root-details.md](references/sibling/worktree-multi-root-details.md) — multi-root VS Code workspace for sibling orchestrators
- [worktree-troubleshooting.md](references/sibling/worktree-troubleshooting.md) — sibling-worktree-specific issues (stale entries, junction repair)
- [worktree-design-rationale.md](references/sibling/worktree-design-rationale.md) — historical context for one-worktree-per-branch (sibling flow)
- [in-place-branching.md](references/sibling/in-place-branching.md) — legacy doc for explicit "no worktree" requests (mostly obsolete — the native flow IS an in-place checkout of sorts, in an ephemeral directory)
- [client-bug-triage.md](references/sibling/client-bug-triage.md) — `work-bugs` batch entry point (orchestrator)

## Key Rules (both flows)

| Rule                                                                  | Detail                                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Never commit to the `main` branch**                                 | Always work on a feature branch, in either `.claude/worktrees/<name>/` (native) or `D:\code\legacy-sports-worktrees\<ticket>\` (sibling). |
| **Never edit `D:\code\legacy-sports` with HEAD on `main`**            | The `.claude/hooks/guard-main-repo.sh` hook enforces this.                                                                                |
| **MCP-first**                                                         | Prefer worktree MCP tools (`worktree_commit`, `worktree_push`, `worktree_rebase`) over raw `git` commands.                                |
| **Never manually remove a sibling worktree**                          | Always `twig worktree clean`. `git worktree remove` destroys junctions.                                                                   |
| **Never `make clean`/`make install`/`pnpm install` in the main repo** | Breaks all junctions.                                                                                                                     |
