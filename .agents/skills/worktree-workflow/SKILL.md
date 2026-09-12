---
name: worktree-workflow
description: 'Route agents to the correct worktree flow for Jira ticket work, plus branch naming and rebase conventions as sub-references. Two flows: (1) native ephemeral worktree via Claude Code launcher `worktree` checkbox (primary, single-ticket); (2) sibling worktree under D:\code\legacy-sports-worktrees\ (legacy fallback for chained stacks). Multi-ticket orchestrators (`/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`) dispatch chips via `mcp__ccd_session__spawn_task` — each chip uses the native flow. Sub-references cover branch naming (human/launcher/agent drivers, Jira linking via PR title and commits) and rebase (rebasing onto main, resolving merge conflicts, updating stale branches, post-rebase stabilization, recovery). Load when starting ticket work, creating or naming a branch, first push to remote, rebasing onto main, or resolving a merge conflict.'
metadata:
  scope: '**'
---

# Skill: Worktree Workflow

This skill is a **router**. It describes the two worktree flows, when to use each, and which detailed guide to read next. Most agents should only need the native-flow section — the sibling-flow reference is loaded only when running a parallel / batch orchestrator.

## Choose your flow

- **Native ephemeral (primary)** — single-ticket leaf work; the session was spawned with the Claude Code launcher `worktree` checkbox checked. See [Native Flow](#native-flow-primary) below, [AGENTS.md](../../../AGENTS.md) Workflow Step 4, and [work-ticket](../work-ticket/SKILL.md).
- **Chip dispatch (multi-ticket)** — orchestrators (`/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`) spawn one chip per ticket/PR via `mcp__ccd_session__spawn_task`; each chip is an independent session running the native flow internally. See [Chip Dispatch](#chip-dispatch-preferred-for-multi-ticket-orchestrators) below plus the orchestrator command files.
- **Subagent dispatch (legacy)** — fallback when chips are unavailable; every current orchestrator uses chip dispatch instead. See [references/subagent-dispatch.md](references/subagent-dispatch.md).
- **Sibling worktree (legacy)** — fallback when `Agent(isolation: "worktree")` is unavailable, or for chained branch stacks requiring twig. See [references/sibling/sibling-worktree-flow.md](references/sibling/sibling-worktree-flow.md).

## Native Flow (primary)

The Claude Code session was spawned with the launcher `worktree` checkbox checked. The session's primary working directory is already `.claude/worktrees/<name>/` on an auto-generated `claude/<random>` branch. Claude Code's header, `Create PR` button, and `gitStatus` in the system prompt all reflect the ticket branch natively — no custom tooling needed.

### Steps

1. **Jira auth** — `jira_auth_status()`. Stop if not configured.
2. **Inspect ticket** — `jira_view(key: "LS-####")` / `jira_list_children(key: "LS-####")` for parents.
3. **Blocker check** — `jira_check_blockers(key: "LS-####")`. Stop if blockers are not In Review/Done. Checking several tickets at once? Pass `keys: [...]` (1-50, one JQL call), or get the state inline from `jira_search` / `jira_list_children` / `jira_get_all_descendants` with `includeBlockers` — never loop or spawn a subagent for it.
4. **Jira → In Progress** — `jira_transition(key: "LS-####", status: "In Progress")`.
5. **Precondition for any branch operation: leave the auto-generated branch name (`claude/<random>`) as-is.** Claude Code caches the branch name at session start and never refreshes it, so a rename permanently disables PR detection and "Create PR" (anthropics/claude-code#18690). Jira linking flows through PR title and commit messages containing `LS-####`, not the branch name. See [references/branch-naming.md](references/branch-naming.md).
6. **Register the active worktree** — so MCP tools target the right tree:
   ```
   worktree_set(key: "<absolute .claude/worktrees/... path from pwd>")
   ```
7. **Link `node_modules` and secret env files from the main repo** (REQUIRED before any pnpm/make command — LS-2903/LS-3003) — run `node scripts/modules-pool/link.mjs` from the worktree root. It links `node_modules` to the content-addressable pool slot matching the worktree's `pnpm-lock.yaml`, and symlinks the main repo's gitignored `.env` / `.env.local` so integration tests run locally without per-worktree credential copying. Verify with `test -d node_modules/nx && echo ok || echo EMPTY`. **Precondition for any manual symlink creation: the resolver has failed** — `mklink /J`, `New-Item -ItemType Junction`, and `New-Item -ItemType SymbolicLink` bypass `.modules.yaml` path consistency checks and cause Nx graph failures, so they are not a supported fallback. Installing a package, regenerating the lockfile (`make lockfile`), recovering a broken link (`worktree_install_recover()`), and the full rationale: [references/module-linking.md](references/module-linking.md).

> **Ordering is owned by the [ticket-to-merge spine](../workflow-overview/references/ticket-to-merge-spine.md)** — the steps below are the native-flow tool bindings for that sequence (spine step in parentheses). The load-bearing reorder: **the draft PR opens _before_ validation** as a durable checkpoint. If numbering here ever disagrees with the spine, the spine wins.

8. **Plan then implement** (spine 1b, 6) — run the [planning reference](../plan-ticket/references/planning.md) (Step 1b) to classify risk and read affected code before writing anything. Skip for trivial tasks (typos, doc-only, single-line changes). Then read the full ticket description, investigate, and write code + tests. See [work-ticket leaf-mode](../work-ticket/references/leaf-mode.md) steps 4 and 7 for implementation notes + self-review.
9. **Commit → push → open draft PR (durable checkpoint)** (spine 7–9) — `worktree_commit({ message: "type(scope): LS-#### msg" })` → `worktree_push({ setUpstream: true })` → `github_open_pr(draft: true)` → `github_manage_labels([+"agent-in-progress"])` → post a continuation checkpoint. The draft PR is inert (CI/review gate on `draft == false`) and exists **before** the long validation run, so a session kill mid-validation loses nothing ([draft-PR-before-validation gate](../workflow-overview/references/ticket-to-merge-spine.md#critical-gates-preconditions)).
   - **Precondition for any commit/push: use the worktree MCP tool.** `git add <files> && git commit -m "..."` → `worktree_commit({ files: ["<file>"], message: "..." })`; `git push -u origin <branch>` (or `HEAD`) → `worktree_push({ setUpstream: true })`. The MCP tools enforce secret-file guards and worktree safety checks that raw git bypasses. Raw `git` is a fallback only after the MCP tool returns an explicit error. See the MCP-first substitution table in `.agents/skills/mcp-first/references/substitutions.md`.
10. **Migrations** (spine 11) — `pnpm --prefix lib/db-client run db:status` then `db:up` (or `make db-migrate`).
11. **Validate** (spine 12) — `make_run(target: "pc")`. Must pass before the PR is marked ready (the draft PR from step 9 already exists and may stay draft until this is green). An `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "nx" not found` failure means the `node_modules` symlink is broken — see [references/module-linking.md](references/module-linking.md).
12. **Self-review (mandatory gate)** (spine 13) — run `/review`, fix everything it raises, and produce a Self-Review Summary before marking the PR ready; push fix commits as needed (the draft PR absorbs them). See `skills/pr-lifecycle/references/self-review.md`.
13. **Mark ready** (spine 14) — `github_mark_pr_ready` (applies the bot trigger label) → subscribe to PR activity → `jira_transition("In Review")`. Never end a turn with the PR still in draft.
14. **Watch to merge** (spine 15) — monitor CI, fix failures, respond to review comments, rebase as needed.
15. **After merge** (spine 16) — MCP gap audit, mark tracking tasks complete, cleanup.

## Chip Dispatch (preferred for multi-ticket orchestrators)

`/sweep-prs`, `/work-bugs`, and `/work-mcp-gaps` are **chip dispatchers**. The orchestrator scans/classifies, then spawns one chip per ticket-or-PR via `mcp__ccd_session__spawn_task`. Each chip is an independent Claude Code session with its own ephemeral worktree, and follows the native flow internally for that single ticket. The orchestrator never modifies its own working tree, never tracks chip state, and never drains/polls chips — the user sees chip progress in the UI. See the orchestrator command files (`.claude/commands/sweep-prs.md`, `work-bugs.md`, `work-mcp-gaps.md`) for the per-orchestrator chip prompt templates.

## Sibling Worktree Flow (legacy / chained branches)

The sibling worktree flow under `D:\code\legacy-sports-worktrees\` is a **legacy fallback**, retained for chained branch stacks needing `twig` parent tracking, environments without `Agent(isolation: "worktree")`, and pre-existing sibling worktrees from before the native-checkbox migration. Load the full guide only when you specifically need that pattern: [references/sibling/sibling-worktree-flow.md](references/sibling/sibling-worktree-flow.md).

## References

These references cover topics that always travel with worktree work:

- [branch-naming.md](references/branch-naming.md) — branch naming conventions by driver (human, Claude Code launcher checkbox, cloud/bot agents). Load when creating branches, first pushing to remote, or naming remote branches.
- [rebase.md](references/rebase.md) — rebasing branches onto main (or another base), resolving merge conflicts, post-rebase stabilization, recovery. Load when rebasing, resolving merge conflicts, or updating a stale branch.

> **Both flows keep `D:\code\legacy-sports` on `main`.** Working in the main repo directory with HEAD on a feature branch is forbidden. The native flow puts the branch in `.claude/worktrees/<name>/`; the sibling flow puts it in `D:\code\legacy-sports-worktrees\<ticket>\`.

### Shared (both flows)

Some topics apply regardless of which flow you are in:

- [concurrent-agent-safety.md](references/shared/concurrent-agent-safety.md) — shared `node_modules` rules, safe parallel operations (applies whenever multiple worktrees exist, native or sibling)
- [service-validation.md](references/shared/service-validation.md) — validating against real local dev services before committing (flow-agnostic — applies to any worktree)
- [user-testing.md](references/shared/user-testing.md) — testing UI live against running dev servers (flow-agnostic)
- [workflow-common-mistakes.md](references/shared/workflow-common-mistakes.md) — wrong parent, duplicate branches, partial implementation (both flows)
- [workflow-recovery-procedures.md](references/shared/workflow-recovery-procedures.md) — recovering from common failure modes

### Sibling-flow only

These are loaded by `references/sibling/sibling-worktree-flow.md` and are not relevant to native-flow sessions:

- [branch-tree-management.md](references/sibling/branch-tree-management.md) — stacked branches, cascade rebase (sibling-specific)
- [manual-worktree-setup.md](references/sibling/manual-worktree-setup.md) — alternative to `make wt-setup`
- [worktree-multi-root-details.md](references/sibling/worktree-multi-root-details.md) — multi-root VS Code workspace for sibling orchestrators
- [worktree-troubleshooting.md](references/sibling/worktree-troubleshooting.md) — sibling-worktree-specific issues (stale entries, symlink repair)
- [worktree-design-rationale.md](references/sibling/worktree-design-rationale.md) — historical context for one-worktree-per-branch (sibling flow)
- [in-place-branching.md](references/sibling/in-place-branching.md) — legacy doc for explicit "no worktree" requests (mostly obsolete — the native flow IS an in-place checkout of sorts, in an ephemeral directory)
- [client-bug-triage.md](references/sibling/client-bug-triage.md) — historical `work-bugs` batch flow (legacy; `/work-bugs` now dispatches chips, see `.claude/commands/work-bugs.md`)

## Key Rules (both flows)

- **Before any commit: HEAD is on a feature branch, not `main`.** Work in `.claude/worktrees/<name>/` (native) or `D:\code\legacy-sports-worktrees\<ticket>\` (sibling); `.claude/hooks/guard-main-repo.sh` blocks edits in the main repo on `main`.
- **Before any git operation: prefer the worktree MCP tool over raw `git`.** `worktree_commit`, `worktree_push`, and `worktree_rebase` apply worktree-path resolution and safety guards raw `git` bypasses — including `worktree_rebase()` for the initial rebase onto main (LS-8007).
- **Before removing a sibling worktree: use `twig worktree clean`.** `git worktree remove` and manual deletion destroy symlinks other worktrees depend on.
- **Before writing through a worktree's `node_modules`: don't** — it is a symlink into a shared, immutable pool slot. `make install` in the **main repo** is safe while worktrees are active (each points at its own slot); the danger is installing or writing _through_ a worktree symlink. Full rules: [references/shared/concurrent-agent-safety.md](references/shared/concurrent-agent-safety.md).

## Provenance and maintenance

- 2026-07-02: Native-flow steps re-sequenced to the ticket-to-merge spine (commit → push → draft PR before validation) during the skills audit; hardcoded MCP-server count and the stale main-repo-install rule replaced with pool-model truth.
- Verify ordering: diff native-flow steps 8–15 against `.agents/skills/workflow-overview/references/ticket-to-merge-spine.md` — the spine wins.
- Verify stdio server list: `node -e "console.log(Object.keys(require('./.mcp.json').mcpServers))"`
- Verify pool-install safety rules: `Read .agents/skills/worktree-workflow/references/shared/concurrent-agent-safety.md`
