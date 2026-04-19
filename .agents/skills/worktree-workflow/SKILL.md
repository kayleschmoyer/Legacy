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
5. **Do NOT rename the branch** — Claude Code caches the branch name at session start and never refreshes it. Renaming permanently disables PR detection and "Create PR" (anthropics/claude-code#18690). Leave the branch as `claude/<random>`. Jira linking works via PR title and commit messages containing `LS-####` — branch name is not required. See `.agents/skills/branch-naming/SKILL.md`.
6. **Register the active worktree** — so MCP tools target the right tree:
   ```
   worktree_set(key: "<absolute .claude/worktrees/... path from pwd>")
   ```
7. **Symlink `node_modules` from the main repo** (REQUIRED before any pnpm/make command — LS-2903/LS-3003):

   ```
   node scripts/setup-worktree-node-modules.mjs
   ```

   Run from the worktree root. Uses Node.js `fs` APIs internally — no shell escaping needed. Idempotent (safe to call if symlink already exists). Requires Windows Developer Mode for directory symlinks. **Never** use `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, or raw `mklink /J` — they bypass `.modules.yaml` path consistency checks and cause Nx graph failures.

   If Windows Developer Mode is not available, use `make install` inside the worktree instead — this creates an independent `node_modules` and is always safe.

   > **Verify after setup — main repo `node_modules` may be empty**: The symlink target (`D:\code\legacy-sports\node_modules`) may contain **0 packages** if the last `make install` ran inside a sibling worktree rather than the main repo — the symlink resolves without error but all tools (`nx`, `prettier`, etc.) are missing. After running the script, confirm the install is populated:
   >
   > ```
   > test -d node_modules/nx && echo ok || echo EMPTY
   > ```
   >
   > If `EMPTY`, fall back to an independent install:
   >
   > 1. `powershell -NoProfile -Command "Remove-Item -Path node_modules -Force"` — removes the empty symlink
   > 2. `make install` inside the worktree — creates a standalone `node_modules`
   >
   > Never attempt to re-point the junction/symlink manually.

   > **Installing new packages in a worktree**: while `node_modules` is symlinked to the main repo, you must never run `pnpm add` or `make install` from the worktree. Those commands are unsafe in this setup: the repo's guardrails are meant to stop them, but attempting to run them with the symlink still in place risks corrupting the shared `node_modules` used by every worktree. If your implementation requires adding/removing/updating dependencies, you **must** break the symlink first and install independently:
   >
   > 1. `powershell -NoProfile -Command "Remove-Item -Path node_modules -Force"` — removes the symlink only, not the main repo's `node_modules`
   > 2. `pnpm add -w <package>` — adds the package to root `package.json`
   > 3. `make install` — creates independent `node_modules` in the worktree
   >
   > See [install-packages.md](../repo-tooling/references/install-packages.md) for the full procedure. **Never run `pnpm add` or `make install` while the symlink is still in place** — the `preinstall-guard` is there to catch this unsafe path, but you must not rely on it because even partial execution can damage every other worktree's shared `node_modules`.

   > **Broken, empty, or missing `node_modules` recovery**: if the symlink is broken, missing, pointing to the wrong location, **or the target resolved but contains 0 packages** (empty main-repo `node_modules`):
   >
   > 1. If `node_modules` exists as a broken symlink or points to the wrong location, remove it with `powershell -NoProfile -Command "Remove-Item -Path node_modules -Force"`. If `node_modules` is already missing, skip this step.
   > 2. Run `node scripts/setup-worktree-node-modules.mjs` to recreate the symlink, **or** run `make install` for an independent `node_modules`
   > 3. **Never** recreate the symlink with `mklink /J`, `mklink /D`, `New-Item -ItemType Junction`, `New-Item -ItemType SymbolicLink`, or any other manual command — they bypass `.modules.yaml` path consistency checks and cause Nx graph failures.
   >
   > See also [workflow-recovery-procedures.md](references/shared/workflow-recovery-procedures.md).

8. **Plan then implement** — run the [planning skill](../planning/SKILL.md) (Step 1b) to classify risk and read affected code before writing anything. Skip for trivial tasks (typos, doc-only, single-line changes). Then read the full ticket description, investigate, and write code + tests. See [work-ticket SKILL.md Step 5](../work-ticket/SKILL.md) for self-review + implementation notes.
9. **Migrations** — `db_migration_status()` then `db_migrate()`.
10. **Validate** — `make_run(target: "pc")`. Must pass before pushing.
11. **Self-review (mandatory gate)** — run `/review` and produce a Self-Review Summary before pushing. See `skills/pr-lifecycle/references/self-review.md`.
12. **Ship** — `worktree_commit` → `worktree_push` → `github_create_pr(draft: true)` → `github_manage_labels([+"agent-in-progress"])` → `github_mark_pr_ready` → `github_request_review` → subscribe to PR activity → `jira_transition("In Review")`.
    - **Never use raw `git` for commit or push**: `git add <files> && git commit -m "..."` → `worktree_commit({ files: ["<file>"], message: "..." })`; `git push -u origin <branch>` (or `HEAD`) → `worktree_push({ setUpstream: true })`. The MCP tools enforce secret-file guards and worktree safety checks that raw git bypasses. See the MCP-first substitution table in `.agents/skills/mcp-first/SKILL.md`.
    - **Pre-push hook fails with `nx` not found or `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`**: `node_modules/.bin` is empty or missing (where the pnpm shims live). Use `worktree_push({ skipLint: true })` — do **not** use `SKIP_PREPUSH_LINT=1 git push`. **Important:** `skipLint` bypasses the entire hook after the lockfile checks — conflict-marker and Terraform validations are also skipped, not just formatting. Only use as a last resort; manually run Prettier and check for conflict markers before pushing: `node node_modules/prettier/bin/prettier.cjs --write <files>`. Do not attempt `make install` from the worktree while symlinks exist — ask the user to repair the main repo instead.
13. **Watch to merge** — monitor CI, fix failures, respond to review comments, rebase as needed.
14. **After merge** — MCP gap audit, mark tracking tasks complete, cleanup.

### Native-flow specifics

- **`make_wt_setup` is NOT used** — it's sibling-only. The symlink command above replaces it.
- **`worktree_list` / `make_worktree_create` are NOT used** — you're already in a worktree, Claude Code created it for you.
- **On exit**, `ExitWorktree(action: "remove")` cleans up the ephemeral worktree. Only call this when explicitly done — the worktree can survive across sessions if kept.
- **All 9 MCP servers** should connect in every session (`MCP_TIMEOUT=10000` in `.claude/settings.json` ensures startup headroom). If a server is unexpectedly missing or timing out, **first verify the `node_modules` symlink exists** — all MCP servers use `pnpm exec tsx` and will time out immediately if the symlink is absent. Run `node scripts/setup-worktree-node-modules.mjs` (from the worktree root) to recreate the symlink, then restart the session. If Windows Developer Mode is unavailable, run `make install` inside the worktree instead. **Never** use `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, or raw `mklink /J` — they bypass path consistency checks. The `SessionStart` hook attempts this automatically but may not fire in all session types (e.g., Copilot CLI).

## Subagent Dispatch (multi-ticket orchestrators)

Multi-ticket commands (`/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`, `/work-ticket` on an epic/parent with children) dispatch **`Agent(isolation: "worktree")` subagents** for each ticket or PR that needs code work. The orchestrator itself only makes API calls — it never modifies its own working tree.

**Why subagents?**

- Each subagent gets its own ephemeral worktree — no contamination between tickets
- Subagents **inherit the parent's MCP connections** (all 9 servers)
- Automatic cleanup — ephemeral worktrees are discarded after the subagent returns
- **Session-type-agnostic** — works identically whether the orchestrator was launched with the worktree checkbox, from the main repo, or from a cloud environment

**Subagent dispatch pattern** (setup + tool preferences from [`.agents/shared/subagent-setup.md`](references/subagent-setup.md)):

```
for each ticket/PR needing code work:
  result = Agent(
    isolation: "worktree",
    prompt: """
      Implement/fix <ticket-or-PR-description>.

      Setup (REQUIRED before any pnpm/make command):
      1. git fetch origin <branch-or-main>
      2. git checkout <existing-branch>  (for PRs)  OR  stay on the ephemeral branch (for new tickets)
      3. node scripts/setup-worktree-node-modules.mjs   # or `make install` if Developer Mode unavailable — NEVER use mklink /J or New-Item junction commands
      4. <do NOT rename branch — Jira links via PR title + commits containing LS-####>
      5. If you need to install new packages: powershell -NoProfile -Command "Remove-Item -Path node_modules -Force" first, then pnpm add -w <pkg>, then make install

      Work:
      6. <specific instructions — implement ticket, fix review, rebase, etc.>
      7. make_run(target: "pc")
      8. worktree_commit + worktree_push
      9. github_create_pr (if new) or push to existing PR branch

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
  node scripts/setup-worktree-node-modules.mjs   # idempotent — skips if symlink already correct
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
make_wt_setup({ worktreePath: "<path>" })                       # symlink node_modules, copy .env, link .twig
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
- [worktree-troubleshooting.md](references/sibling/worktree-troubleshooting.md) — sibling-worktree-specific issues (stale entries, symlink repair)
- [worktree-design-rationale.md](references/sibling/worktree-design-rationale.md) — historical context for one-worktree-per-branch (sibling flow)
- [in-place-branching.md](references/sibling/in-place-branching.md) — legacy doc for explicit "no worktree" requests (mostly obsolete — the native flow IS an in-place checkout of sorts, in an ephemeral directory)
- [client-bug-triage.md](references/sibling/client-bug-triage.md) — `work-bugs` batch entry point (orchestrator)

## Key Rules (both flows)

| Rule                                                                  | Detail                                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Never commit to the `main` branch**                                 | Always work on a feature branch, in either `.claude/worktrees/<name>/` (native) or `D:\code\legacy-sports-worktrees\<ticket>\` (sibling). |
| **Never edit `D:\code\legacy-sports` with HEAD on `main`**            | The `.claude/hooks/guard-main-repo.sh` hook enforces this.                                                                                |
| **MCP-first**                                                         | Prefer worktree MCP tools (`worktree_commit`, `worktree_push`, `worktree_rebase`) over raw `git` commands.                                |
| **Never manually remove a sibling worktree**                          | Always `twig worktree clean`. `git worktree remove` destroys symlinks.                                                                    |
| **Never `make clean`/`make install`/`pnpm install` in the main repo** | Breaks all symlinks.                                                                                                                      |
