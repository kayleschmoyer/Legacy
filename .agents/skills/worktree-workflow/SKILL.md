---
name: worktree-workflow
description: 'Route agents to the correct worktree flow for Jira ticket work. Two flows exist: (1) native ephemeral worktree via Claude Code launcher `worktree` checkbox (primary, single-ticket, native branch detection); (2) sibling worktree under D:\code\legacy-sports-worktrees\ (legacy fallback for chained branch stacks, parent-ticket dispatch when chips/Agent isolation unavailable). Multi-ticket orchestrators (`/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`) dispatch chips via `mcp__ccd_session__spawn_task` — each chip is its own session and uses the native flow. Load when starting ticket work; routes to the right flow guide.'
---

# Skill: Worktree Workflow

This skill is a **router**. It describes the two worktree flows, when to use each, and which detailed guide to read next. Most agents should only need the native-flow section — the sibling-flow reference is loaded only when running a parallel / batch orchestrator.

## Choose your flow

| Flow                             | When                                                                                                                                                                                                                               | Detail guide                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Native ephemeral (primary)**   | Single-ticket leaf work. Session spawned with Claude Code launcher `worktree` checkbox checked.                                                                                                                                    | See "Native Flow" below + [AGENTS.md Workflow Step 4](../../../AGENTS.md) + [work-ticket SKILL.md](../work-ticket/SKILL.md) |
| **Chip dispatch (multi-ticket)** | Multi-ticket orchestrators: `/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`. Orchestrator spawns one chip per ticket/PR via `mcp__ccd_session__spawn_task`; each chip is an independent session that uses the native flow internally. | See "Chip Dispatch" below + orchestrator command files                                                                      |
| **Subagent dispatch (legacy)**   | Fallback when chips (`mcp__ccd_session__spawn_task`) are unavailable. All current multi-ticket orchestrators (including `/work-ticket` Parent Mode) use chip dispatch instead.                                                     | See "Subagent Dispatch" below + orchestrator command files                                                                  |
| **Sibling worktree (legacy)**    | Fallback when `Agent(isolation: "worktree")` is unavailable, or chained branch stacks requiring twig.                                                                                                                              | See [references/sibling/sibling-worktree-flow.md](references/sibling/sibling-worktree-flow.md)                              |

> **Both flows keep `D:\code\legacy-sports` on `main`.** Working in the main repo directory with HEAD on a feature branch is forbidden. The native flow puts the branch in `.claude/worktrees/<name>/`; the sibling flow puts it in `D:\code\legacy-sports-worktrees\<ticket>\`.

## Native Flow (primary)

The Claude Code session was spawned with the launcher `worktree` checkbox checked. The session's primary working directory is already `.claude/worktrees/<name>/` on an auto-generated `claude/<random>` branch. Claude Code's header, `Create PR` button, and `gitStatus` in the system prompt all reflect the ticket branch natively — no custom tooling needed.

### Steps

1. **Jira auth** — `jira_auth_status()`. Stop if not configured.
2. **Inspect ticket** — `jira_view(key: "LS-####")` / `jira_list_children(key: "LS-####")` for parents.
3. **Blocker check** — `jira_check_blockers(key: "LS-####")`. Stop if blockers are not In Review/Done.
4. **Jira → In Progress** — `jira_transition(key: "LS-####", status: "In Progress")`.
5. **Precondition for any branch operation: leave the auto-generated branch name (`claude/<random>`) as-is.** Claude Code caches the branch name at session start and never refreshes it, so a rename permanently disables PR detection and "Create PR" (anthropics/claude-code#18690). Jira linking flows through PR title and commit messages containing `LS-####`, not the branch name. See `.agents/skills/branch-naming/SKILL.md`.
6. **Register the active worktree** — so MCP tools target the right tree:
   ```
   worktree_set(key: "<absolute .claude/worktrees/... path from pwd>")
   ```
7. **Link `node_modules` and secret env files from the main repo** (REQUIRED before any pnpm/make command — LS-2903/LS-3003):

   ```
   node scripts/modules-pool/link.mjs
   ```

   Run from the worktree root. It hashes the worktree's `pnpm-lock.yaml` and links `node_modules` to the matching content-addressable pool slot (`<main>/.modules-pool/<hash>/node_modules`), materialising the slot on a miss (`pnpm install --frozen-lockfile` → atomic publish) and re-linking in milliseconds on a hit. Uses Node.js `fs`/`cmd` internally — no shell escaping needed. Idempotent. Requires Windows Developer Mode for the directory symlink. **Precondition for any manual symlink creation in a worktree: the resolver has failed.** Manual `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, and `mklink /J` bypass `.modules.yaml` path consistency checks and cause Nx graph failures, so they are not a supported fallback.

   In addition to `node_modules`, the resolver also links the main repo's gitignored secret files (`.env`, `.env.local`) into the worktree as file symlinks. This is what lets agents run integration tests locally — `playwright.integration.config.ts` loads `<repo>/.env` for `E2E_COMMISSIONER_*`, `E2E_MANAGER_*`, `VITE_OAUTH_PROXY_URL`, etc. — without manual per-worktree credential copying. Symlinks (not copies) ensure secret rotations in main propagate automatically. If a real file is already present in the worktree (not a symlink), the resolver leaves it alone — delete it manually if you want to switch to the linked copy.

   > **Verify after setup**: confirm the linked slot is populated:
   >
   > ```
   > test -d node_modules/nx && echo ok || echo EMPTY
   > ```
   >
   > If `EMPTY`, the slot did not materialise — re-run `node scripts/modules-pool/link.mjs` and read its output for a `pnpm install` error or a Developer-Mode symlink failure.

   > **Installing new packages in a worktree** — a worktree's `node_modules` is a symlink into an **immutable** shared pool slot, so never `pnpm add`/`pnpm install` straight through it. Adding a package changes the lockfile → a new slot:
   >
   > 1. `powershell -NoProfile -Command "Remove-Item -Path node_modules -Force"` — removes the symlink only, not the pool slot
   > 2. `pnpm add -w <package>` — adds the package to root `package.json` (rewrites the lockfile)
   > 3. `make install` (or `node scripts/modules-pool/link.mjs`) — materialises and links the new slot
   >
   > See [install-packages.md](../repo-tooling/references/install-packages.md) for the full procedure.

   > **Broken or missing `node_modules` recovery**: use `worktree_install_recover()` (MCP-first) — it handles symlink repair and slot materialisation without a shell fallback. Shell fallback (only if the worktree MCP server is unavailable): re-run `node scripts/modules-pool/link.mjs` from the worktree root. If a healthy slot exists it re-links instantly; otherwise it materialises a fresh one. **Precondition for manual symlink recreation: the resolver has failed.** `mklink /J`, `mklink /D`, `New-Item -ItemType Junction`, and `New-Item -ItemType SymbolicLink` bypass `.modules.yaml` path consistency checks and cause Nx graph failures, so they are not a supported fallback.
   >
   > See also [workflow-recovery-procedures.md](references/shared/workflow-recovery-procedures.md).

8. **Plan then implement** — run the [planning skill](../planning/SKILL.md) (Step 1b) to classify risk and read affected code before writing anything. Skip for trivial tasks (typos, doc-only, single-line changes). Then read the full ticket description, investigate, and write code + tests. See [work-ticket SKILL.md Step 5](../work-ticket/SKILL.md) for self-review + implementation notes.
9. **Migrations** — `db_migration_status()` then `db_migrate()`.
10. **Validate** — `make_run(target: "pc")`. Must pass before pushing. If it fails with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "nx" not found`, the `node_modules` symlink is broken — repair with `worktree_install_recover()` (MCP-first, **not** `node scripts/modules-pool/link.mjs` via Bash), then restart the session before retrying.
11. **Self-review (mandatory gate)** — run `/review` and produce a Self-Review Summary before pushing. See `skills/pr-lifecycle/references/self-review.md`.
12. **Ship** — `worktree_commit` → `worktree_push` → `github_create_pr(draft: true)` → `github_manage_labels([+"agent-in-progress"])` → `github_mark_pr_ready` → subscribe to PR activity → `jira_transition("In Review")`.
    - **Precondition for any commit/push: use the worktree MCP tool.** `git add <files> && git commit -m "..."` → `worktree_commit({ files: ["<file>"], message: "..." })`; `git push -u origin <branch>` (or `HEAD`) → `worktree_push({ setUpstream: true })`. The MCP tools enforce secret-file guards and worktree safety checks that raw git bypasses. Raw `git` is a fallback only after the MCP tool returns an explicit error. See the MCP-first substitution table in `.agents/skills/mcp-first/SKILL.md`.
    - **Pre-push hook fails with `nx` not found or `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`**: `node_modules/.bin` is empty or missing (where the pnpm shims live). Use `worktree_push({ skipLint: true })` — do **not** use `SKIP_PREPUSH_LINT=1 git push`. **Important:** `skipLint` bypasses the entire hook after the lockfile checks — conflict-marker and Terraform validations are also skipped, not just formatting. Only use as a last resort; manually run Prettier and check for conflict markers before pushing: `node node_modules/prettier/bin/prettier.cjs --write <files>`. Do not attempt `make install` from the worktree while symlinks exist — ask the user to repair the main repo instead.
13. **Watch to merge** — monitor CI, fix failures, respond to review comments, rebase as needed.
14. **After merge** — MCP gap audit, mark tracking tasks complete, cleanup.

### Native-flow specifics

- **`make_wt_setup` is NOT used** — it's sibling-only. The symlink command above replaces it.
- **`worktree_list` / `make_worktree_create` are NOT used** — you're already in a worktree, Claude Code created it for you.
- **On exit**, `ExitWorktree(action: "remove")` cleans up the ephemeral worktree. Only call this when explicitly done — the worktree can survive across sessions if kept.
- **All 9 MCP servers** should connect in every session (`MCP_TIMEOUT=10000` in `.claude/settings.json` ensures startup headroom). If a server is unexpectedly missing or timing out, **first verify the `node_modules` symlink exists** — all MCP servers use `pnpm exec tsx` and will time out immediately if the symlink is absent. Run `node scripts/modules-pool/link.mjs` (from the worktree root) to link `node_modules` to the worktree's content-addressable pool slot, then restart the session. Directory symlinks require Windows Developer Mode. **Never** use `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, or raw `mklink /J` — they bypass path consistency checks. The `SessionStart` hook attempts this automatically but may not fire in all session types (e.g., Copilot CLI).

## Chip Dispatch (preferred for multi-ticket orchestrators)

`/sweep-prs`, `/work-bugs`, and `/work-mcp-gaps` are **chip dispatchers**. The orchestrator scans/classifies, then spawns one chip per ticket-or-PR via `mcp__ccd_session__spawn_task`. Each chip is an independent Claude Code session with its own ephemeral worktree, and follows the native flow internally for that single ticket. The orchestrator never modifies its own working tree, never tracks chip state, and never drains/polls chips — the user sees chip progress in the UI. See the orchestrator command files (`.claude/commands/sweep-prs.md`, `work-bugs.md`, `work-mcp-gaps.md`) for the per-orchestrator chip prompt templates.

## Subagent Dispatch (legacy / parent-ticket iteration)

**`/work-ticket` Parent Mode dispatches chips** via `mcp__ccd_session__spawn_task` — use that first. `Agent(isolation: "worktree")` subagents are the **fallback** for environments where `mcp__ccd_session__spawn_task` is unavailable (ToolSearch returns no result). The orchestrator itself only makes API calls — it never modifies its own working tree.

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
      3. node scripts/modules-pool/link.mjs   # links node_modules to the pool slot (requires Developer Mode) — NEVER use mklink /J or New-Item junction commands
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
  node scripts/modules-pool/link.mjs   # idempotent — re-links instantly if the slot is already built
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
- [client-bug-triage.md](references/sibling/client-bug-triage.md) — historical `work-bugs` batch flow (legacy; `/work-bugs` now dispatches chips, see `.claude/commands/work-bugs.md`)

## Key Rules (both flows)

| Precondition                                                                                                                               | Detail                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Before any commit: HEAD is on a feature branch, not `main`.**                                                                            | Work in either `.claude/worktrees/<name>/` (native) or `D:\code\legacy-sports-worktrees\<ticket>\` (sibling). `.claude/hooks/guard-main-repo.sh` blocks edits in main on `main`. |
| **Before any git operation: prefer the worktree MCP tool over raw `git`.**                                                                 | `worktree_commit`, `worktree_push`, `worktree_rebase` apply worktree-path resolution and safety guards that raw `git` bypasses.                                                  |
| **Before removing a sibling worktree: use `twig worktree clean`.**                                                                         | `git worktree remove` and manual deletion destroy the symlinks that other worktrees depend on.                                                                                   |
| **Before `make clean` / `make install` / `pnpm install` in the main repo: confirm no worktree symlinks point into `<main>/node_modules`.** | These commands rebuild or wipe the directory every worktree's symlink targets — running them while any worktree is symlinked breaks them all simultaneously.                     |
