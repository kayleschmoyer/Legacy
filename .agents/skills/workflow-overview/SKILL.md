---
name: workflow-overview
description: 'Local (Windows worktree) implementation of the ticket-to-merge workflow. Load when: following the step-by-step ticket-to-merge runbook in a local session, setting up worktrees, or running local validation gates. The environment-neutral ordering lives in references/ticket-to-merge-spine.md; this skill is the local tool binding plus local-only setup and validation.'
metadata:
  scope: '**'
---

# Skill: Workflow Overview (Local)

This is the **local implementation** of the ticket-to-merge workflow. The ordering, the gates, and the task-graph enforcement are environment-neutral and live in **[references/ticket-to-merge-spine.md](references/ticket-to-merge-spine.md)** — read that first. This skill provides the **local tool binding** (which worktree/Make/Jira MCP tool performs each step on Windows) plus the local-only setup and validation that the spine defers to your environment skill.

> **Do not restate the spine here.** The ordering used to be duplicated across this skill and `cloud-agent-mode`, and the copies drifted (the cloud copy lost the task-graph enforcement). There is now one source of truth. If you change the _order_ or a _gate_, change it in the spine.

## Start here

1. Read **[references/ticket-to-merge-spine.md](references/ticket-to-merge-spine.md)** for the canonical Steps 0–16, the five critical gates (draft-PR-before-validate, `make pc`-before-mark-ready, migrations-before-`make pc`, self-review-before-mark-ready, PR-Ready-before-watch-to-merge), and the **mandatory tracking-task graph** (Step 1c) that makes the ordering survive context compaction.
2. Use **[references/local-tool-binding.md](references/local-tool-binding.md)** for the concrete worktree/Make/Jira MCP call behind each spine step, plus the local-only step nuances.
3. Use **[Local worktree setup](#local-worktree-setup)** below and **[references/local-validation-gates.md](references/local-validation-gates.md)** (pre-commit hook, `make pc`, pre-push hook, the self-review gate, and the local integration spec gate) for the local-only mechanics.
4. For everything after mark-ready, see the machinery references: [ci-and-merge-pipeline.md](references/ci-and-merge-pipeline.md), [post-merge-and-deploy.md](references/post-merge-and-deploy.md), [roles-checks-secrets.md](references/roles-and-required-checks.md).

## Local worktree setup

Two flows. Pick based on whether you need multiple worktrees active at once.

- **Native ephemeral (primary / default for single-ticket work)** — the launcher `worktree` checkbox spawns the session in `.claude/worktrees/<name>/` on an auto-generated `claude/<random>` branch. **Do not rename the local branch** — Claude Code caches it at session start and renaming breaks PR detection (anthropics/claude-code#18690). Jira links via PR title + commit messages containing `LS-####`. Verify with `pwd` → a `.claude/worktrees/<name>/` path.
  - **node_modules symlink (required before any pnpm/make command)** — the ephemeral worktree ships with no `node_modules`. Run from the worktree root:
    ```
    node scripts/modules-pool/link.mjs
    ```
    It links `node_modules` to the content-addressable pool slot for the worktree's lockfile and symlinks `.env`/`.env.local` from the main repo. Idempotent; auto-repairs broken links. Then verify the slot is populated:
    ```
    test -d node_modules/nx && echo ok || echo EMPTY
    ```
    If `EMPTY`, re-run the script and read its output for a `pnpm install` or Developer-Mode symlink error. **Never** create the link by hand (`mklink`, `New-Item -ItemType SymbolicLink/Junction`, `cmd //c mklink`) — those bypass path checks and break the Nx graph. The script is the only supported way.
- **Sibling worktree (parallel / batch only)** — for sweeps, batch workers, chained branches, or multi-ticket orchestration. `git fetch origin` in the main repo first, then `make_worktree_create({ ticket: "####", description: "...", parent: "LS-XXXX/branch" })` (registers the parent dependency), then `worktree_list()` + `worktree_set({ key: "LS-####" })`. Setup: `make_wt_setup({ worktreePath: "$wt" })`. Do **not** use `twig worktree create` directly (skips parent registration). In sibling worktrees, always pass `worktreePath` to `make_run` / use `worktree_run` (sets the Windows `windowsHide` `NODE_OPTIONS` patch).

> **Cleanup (after merge)**: remove all worktree symlinks first, then `twig worktree clean` — never `git worktree remove` or manual deletion (git follows NTFS links during recursive deletion and can wipe the main repo). See [post-merge-and-deploy.md](references/post-merge-and-deploy.md#cleanup) and [worktree-workflow/SKILL.md](../worktree-workflow/SKILL.md).

## What happens after mark-ready

Everything downstream of the ready PR is environment-neutral — see the machinery references rather than restating it here:

- **[ci-and-merge-pipeline.md](references/ci-and-merge-pipeline.md)** — CI orchestrator + pipeline stages, manual Playwright dispatch, CI failure labels, Copilot review flow, Jira branch sync, merge queue.
- **[post-merge-and-deploy.md](references/post-merge-and-deploy.md)** — deploy workflows, the lambda-upload CI guard, the NX_BASE race, PR previews, the web deploy pipeline, cleanup.
- **[roles-checks-secrets.md](references/roles-and-required-checks.md)** — GitHub App separation of duties, required vs advisory checks (incl. the aggregate `CI Gate`, LS-7991), secrets reference.

## Related Skills

- [ticket-to-merge-spine](references/ticket-to-merge-spine.md) -- the canonical environment-neutral ordering + enforcement (read first).
- [cloud-agent-mode](../cloud-agent-mode/SKILL.md) -- the cloud implementation of the same spine.
- [pr-lifecycle](../pr-lifecycle/SKILL.md) -- PR creation, self-review, Copilot fix workflow.
- [rebase](../worktree-workflow/references/rebase.md) -- rebase branches and resolve conflicts.
- [debugging](../debugging/SKILL.md) -- investigate and fix CI failures and code defects.
- [worktree-workflow](../worktree-workflow/SKILL.md) -- worktree creation and management.
- [repo-tooling](../repo-tooling/SKILL.md) -- Make targets, Nx commands, migration scripts.
- [error-recovery](references/error-recovery.md) -- decision trees for the top 11 failure scenarios.
