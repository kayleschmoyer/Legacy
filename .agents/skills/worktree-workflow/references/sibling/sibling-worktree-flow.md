# Reference: Sibling Worktree Flow (Parallel / Batch Work)

> **When to load this reference**: you are running a parallel / batch orchestrator and chips (`mcp__ccd_session__spawn_task`) are unavailable. The current multi-ticket orchestrators (`/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`, `/work-ticket` Parent Mode) all dispatch **chips** via `mcp__ccd_session__spawn_task` — none of those need sibling worktrees. Load this only for the legacy chained-branch case or environments without chip support, where you need sibling worktrees under `D:\code\legacy-sports-worktrees\` to isolate each branch from the main repo session.
>
> **When NOT to load this reference**: you are working a single leaf ticket. Use the **native ephemeral worktree flow** instead — spawn Claude Code with the launcher `worktree` checkbox checked and follow AGENTS.md Workflow Step 4 (native path) + the work-ticket skill. That flow gives you correct branch detection, a working `Create PR` button, and `gitStatus` in the system prompt — none of which sibling worktrees offer.

## Overview

Git worktrees let you check out multiple branches simultaneously in separate directories — one directory per ticket. In the sibling flow, the main repo directory stays on `main` and serves as the orchestrator that creates sibling worktrees for each in-flight ticket. Each ticket gets its own folder. All sibling worktrees are available in the multi-root VS Code workspace.

> **MCP-first:** When running shell commands (`make`, `nx`, `git`) inside a sibling worktree, use worktree MCP tools (`worktree_set` / `worktree_run`) instead of the bash tool. This prevents the most common failure mode — running commands in the main repo instead of the active worktree.

## Worktree Directory Structure

```
D:\code\
├── legacy-sports\                         ← main repo, always on main (orchestrator session)
└── legacy-sports-worktrees\
    ├── LS-1234-my-feature\                ← sibling worktree for LS-1234/my-feature branch
    └── LS-1235-another-ticket\            ← sibling worktree for LS-1235/another-ticket branch
```

`twig worktree create <branch>` places worktrees under `D:\code\legacy-sports-worktrees\` in a folder derived from the branch name (slashes replaced with hyphens). Run `twig worktree list` after creation to confirm the exact path — use that path for all subsequent steps.

Scripts like `scripts/pr-enter-worktree.ps1` and `.vscode/settings.json` assume this `legacy-sports-worktrees` base directory.

### Epic-Level Work

If you need to commit **epic-level artifacts** (design docs, architecture decisions, shared
config) that span multiple child tickets, create a **separate worktree for the epic ticket
itself** — not a child task:

```powershell
# Epic LS-640 with child tasks LS-634, LS-642, etc.
make worktree TICKET=640 DESC=salary-cap-design   # ← uses the epic key
```

This ensures the branch name, PR title, and Jira transition all reference the correct
ticket. Do **not** commit epic-scoped work to a child task's branch — it misattributes the
work and confuses traceability.

> 📎 **Design rationale** (why one-worktree-per-branch beats reusable static worktrees, disk cost analysis): see [worktree-design-rationale.md](./worktree-design-rationale.md)

## ⚠️ Concurrent Agent Safety (node_modules pool)

Each sibling worktree's `node_modules` is a symlink into an immutable content-addressable pool slot keyed by its lockfile (`<main>\.modules-pool\<hash>\node_modules`). Key rules:

- **Never run raw `pnpm install`/`pnpm add` straight through a worktree's `node_modules`** — it would mutate a shared immutable slot. Use the resolver (`node scripts/modules-pool/link.mjs`) or Makefile targets, which build a fresh slot.
- **`make install` in the main repo is safe** while sibling worktrees exist — they link their own slots, not main's `node_modules`.
- **Never manually remove worktrees** — always use `twig worktree clean` (unlinks symlinks safely). Orphan slots are reclaimed by `make modules-gc`.
- **Broken node_modules?** Re-run `node scripts/modules-pool/link.mjs` from the worktree root — it re-links a healthy slot instantly or materialises a fresh one.

> 📎 **Full concurrent safety rules, recovery steps, and what's safe in parallel**: see [concurrent-agent-safety.md](../shared/concurrent-agent-safety.md)

## Multi-Agent Worktree Locking

When multiple agents work concurrently, use advisory locks to signal worktree ownership:

```
worktree_lock(worktree: "LS-1234", agent: "work-ticket", task: "implementing feature")
# ... do work ...
worktree_unlock(worktree: "LS-1234")
```

- **Lock on entry**: call `worktree_lock` after `worktree_set` when starting work
- **Unlock on exit**: call `worktree_unlock` before `worktree_clean` or when done
- **Check before entering**: `worktree_list` displays lock status (ACTIVE/STALE/none) for each worktree — skip ones with ACTIVE locks
- **Stale locks auto-expire**: default TTL is 2 hours; stale locks are replaced automatically
- **Force override**: pass `force: true` to `worktree_lock` to break another agent's lock (use sparingly)
- **Advisory only**: locks are not enforced — they signal intent, not prevent access

## Key Rules

| Rule                    | Detail                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| **Main stays on main**  | Never check out a feature branch in the main repo — it's the base for new worktrees                    |
| **No edits in main**    | All file edits must happen inside `$wt`. Staging changes in main creates phantom diffs.                |
| **Never manual remove** | **Always** `twig worktree clean` — never `git worktree remove` or manual deletion (destroys symlinks). |
| **Run make install**    | `node_modules` is absent in a fresh worktree — always run `make wt-setup` or `make install` inside it  |

## Prerequisites

- Main repo is on `main` and up to date
- After creating a worktree, run `make install` inside it to install Node.js and Python dependencies
- Copy `.env` and symlink `.twig` into the worktree (see Step 3)

## Complete Workflow

> **🔑 Auth check comes first** — call `jira_auth_status()` before touching any Jira tool. If `configured: false`, **stop and prompt the user** (see AGENTS.md Critical Rules for the exact wording and env vars to check). Do not silently fall back to the Atlassian plugin.

> **🔔 Blocker check comes next** — always verify "blocked-by" dependencies before changing Jira status.

### Step 0: Check for Parent Dependencies

Before creating the worktree, **inspect the Jira ticket** for "blocked-by" linked issues. Query the status of each blocker to decide how to proceed:

Use the `jira_check_blockers` MCP tool (primary):

```
jira_check_blockers(key: "LS-####")
```

This returns a `canProceed` flag, the blocker list, and a `recommendation` ("base off main", "base off LS-XXXX branch", or "STOP — blocker(s) not ready: …").

| Blocker status               | Action                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Not In Review / not Done** | **🛑 STOP — do not proceed.** Inform the user that the blocking ticket must reach at least "In Review" before this ticket can be worked. |
| **In Review**                | Use the blocker's branch as the parent (dependent path in Step 1).                                                                       |
| **Done** (or no blockers)    | Base off `origin/main` (default path in Step 1).                                                                                         |

> **⚠️ Getting this wrong creates sibling branches that will conflict when both merge to main.** Always check before proceeding.
> **⚠️ Working on a ticket whose blocker is still in progress wastes effort** — the blocker's changes may invalidate your work.

### Step 0b: Transition Jira to In Progress (Only After Step 0 Passes)

Once blockers are verified as In Review/Done (or absent), transition the ticket using the `jira_transition` MCP tool (primary):

```
jira_transition(key: "LS-####", status: "In Progress")
```

### Step 1: Create the Branch + Worktree

Use `make worktree` — it fetches origin, creates the branch, worktree, registers the parent dependency, and
auto-adds to the VS Code workspace in one atomic command:

> `make worktree` automatically runs `git fetch origin` before creating the branch, so the
> worktree is always cut from the latest remote state. If you fall back to manual creation
> (see below), you **must** fetch first yourself.

**Independent ticket (parent = main):**

```powershell
cd "D:\code\legacy-sports"
make worktree TICKET=#### DESC=short-description

# Verify — note the path twig chose
twig worktree list
```

**Dependent ticket (parent = another in-progress branch):**

```powershell
cd "D:\code\legacy-sports"
make worktree TICKET=#### DESC=short-description PARENT=LS-XXXX/parent-branch-name

# Verify — branch must appear under the parent, not under main
twig tree
twig worktree list
```

> **Note:** `PARENT` accepts a branch name (`LS-XXXX/description`), a bare Jira key
> (`LS-XXXX` — auto-resolved to the matching local branch), or `none` (no dependency).
> When omitted it defaults to `main`.

> **⚠️ Parent branch must be pushed to origin before creating a stacked worktree.**
> `make worktree` checks `git ls-remote --heads origin <parent>` after fetching and
> **fails fast** if the parent only exists locally:
>
> ```
> [ERROR] Parent branch 'LS-XXXX/parent-branch-name' was not found on origin.
>         Stacked worktrees must base off a branch that is already pushed.
>         Push the parent PR first, then retry:
>           git -C <parent-worktree-path> push -u origin HEAD
>           OR: worktree_push() in the parent worktree
> ```
>
> A parent that only exists locally causes the child to silently base off the wrong
> commit — the resulting PR will have an incorrect diff and the stack will break.

> **⚠️ CRITICAL**: Do **NOT** use `twig switch LS-#### -p=...` before `twig worktree create`.
> `twig switch` auto-generates a dash-format branch name from the Jira summary (e.g.,
> `LS-490-fix-rollbar-init`), while `twig worktree create` uses your slash-format name
> (`LS-490/fix-rollbar-init`). This creates **two branches per ticket** — the dash-format
> branch becomes an orphan. Use `make worktree` (or `scripts/worktree-create.ps1`)
> which handles both steps correctly.

> If `make worktree` fails (e.g. `twig` not found), fall back to manual creation:
>
> ```powershell
> git fetch origin   # ensure branch is cut from latest origin/main
> twig worktree create LS-####/short-description
> twig branch depend LS-####/short-description main   # or the actual parent branch
> twig worktree list
> ```
>
> **Deep fallback — if the PowerShell script itself is broken** (e.g. a parse error in
> `scripts/worktree-create.ps1`), bypass the script entirely with `git worktree add`:
>
> ```bash
> git -C D:/code/legacy-sports fetch origin
> git -C D:/code/legacy-sports worktree add \
>   -b LS-####/short-description \
>   D:/code/legacy-sports-worktrees/LS-####-short-description \
>   origin/main    # or origin/<parent-branch>
> ```
>
> Then run `make_wt_setup` (MCP) or `make wt-setup WT=<path>` as normal to symlink
> `node_modules`, copy `.env`, etc.
>
> Note: twig parent registration is skipped with this fallback. For tickets based off
> `main`, `worktree_rebase` defaults to rebasing onto `origin/main`, which is correct.
> For stacked tickets created with this fallback, either:
>
> - Once `twig` is available, register the dependency explicitly: `twig branch depend <child-branch> <parent-branch>`, so `worktree_rebase` knows the stack parent; or
> - If you stay in plain git, remember that `worktree_rebase` will not rebase onto the stack parent; instead, manually run `git -C <worktree> rebase origin/<parent-branch>` when you need to sync with the parent.
>
> **Always file a bug under the current MCP gaps bucket epic** (get key via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`) for the underlying script failure so it gets fixed.

> **⚠️ Read before Edit in a fresh worktree.** The `Edit` tool's "have I read this file?"
> tracking is keyed on the **absolute path**, so reading `D:\code\legacy-sports\foo.ts` does
> NOT satisfy the requirement for editing `D:\code\legacy-sports-worktrees\LS-####-bar\foo.ts`.
> Always issue a `Read` against the worktree path before the first `Edit` of any file in a
> newly created worktree, even if you already inspected the same file in the main repo earlier
> in the session. Skipping this triggers a "File has not been read yet. Read it first before
> writing to it." tool error — observed 3 times in a single `/work-mcp-gaps` run on 2026-04-06
> across LS-2406, LS-2413, and LS-2408 worktrees.

### Step 2: Confirm Jira is In Progress

If you haven't already transitioned the ticket (see the note at the top of this section), do it now using the `jira_transition` MCP tool:

```
jira_transition(key: "LS-####", status: "In Progress")
```

### Step 3: Install Dependencies, Copy .env, Link .twig

Git worktrees only contain tracked files — `node_modules`, `.env`, and `.twig` are gitignored and absent.

**Recommended — use the smart setup script** (handles all three in one command):

```powershell
# From the main repo:
$wt = "<path-from-twig-worktree-list>"
make wt-setup WT=$wt
```

`make wt-setup` compares lockfile hashes — if they match main, it creates a `node_modules` symlink (instant, zero disk) when Developer Mode is enabled; if symlinks are unavailable or lockfiles differ, it falls back to `pnpm install`. It also copies `.env` and symlinks `.twig`, `certs/`, and `.github/skills`.

Pass `-Force` to skip the lockfile check and always run a full `pnpm install`:

```powershell
make wt-setup WT=$wt FORCE=-Force
```

> 📎 **Manual alternative** (without `make wt-setup`): see [manual-worktree-setup.md](./manual-worktree-setup.md)

### Step 4: Add to Multi-Root Workspace

If a `legacy-sports.code-workspace` file exists, **always** add the new worktree to it so agents
have search access:

```powershell
cd "D:\code\legacy-sports"
make sync-worktrees-add TICKET=####
```

If no workspace file exists yet (first time), create one:

```powershell
cd "D:\code\legacy-sports"
make sync-worktrees TICKETS=####
code legacy-sports.code-workspace
```

> 📎 **Multi-root workspace details** (TS tradeoffs, incremental updates, auto-add, per-session fallback): see [worktree-multi-root-details.md](./worktree-multi-root-details.md)

### Step 5: Implement the Ticket

> **🚨 ALL edits happen in the worktree — never in `D:\code\legacy-sports`.**
> File edits, terminal commands, and git operations must target `$wt`. Editing files in
> the main repo (even without committing) leaves behind staged or unstaged changes that
> are easy to miss and cannot be pushed to a PR branch.

All commands run from within the worktree directory (`cd $wt`). Write code, add tests, update docs.

### Step 5a: Service Validation (Optional)

If you changed backend code (resolvers, migrations, Lambda logic), validate against real local services before committing. See [service-validation.md](../shared/service-validation.md) for the decision tree and procedures.

### Step 5b: Self-Review Changes

Before committing, run a self-review of all changes on the branch. This catches project-rule violations and code-quality issues that `make pc` does not cover.

See the [pr-lifecycle skill](../../../pr-lifecycle/SKILL.md) for the full checklist. Key checks:

- No `console.*` (use `LOGGER`)
- No `@ts-ignore` / `eslint-disable`
- Prefer `.graphql` + codegen over inline `gql`
- No dead code, duplication, or loose `any` types
- Leverage existing shared utilities

Fix any issues found before proceeding to commit.

### Step 6: Commit and Push

> **MCP-first**: prefer `worktree_commit` over raw `git add`/`git commit` — it handles staging and committing in one operation and refuses to stage likely credential/secret files (e.g., `.env`, `credentials.*`, `*.pem`, `*.key`). Requires an active worktree via `worktree_set` or an explicit `worktree:` argument. Use `worktree_push` over raw `git push` — it supports `setUpstream`, uses `--force-with-lease`, and refuses dangerous operations.

```
worktree_commit(message: "feat(scope): description (LS-####)")
worktree_push(setUpstream: true)
```

Fall back to shell only when MCP is unavailable:

```powershell
cd $wt
git add .
git commit -m "feat(scope): description (LS-####)"
git push -u origin HEAD
```

> **⚠️ `--no-verify` skips Prettier.** If you use `git commit --no-verify` (e.g., the
> worktree lacks pre-commit hooks or `node_modules`), formatting is **not checked**.
> You **must** run Prettier manually before pushing — otherwise CI will fail the
> formatting gate. See Step 7 for how to run a minimal formatting check.

### Step 6b: Apply Pending Migrations 🚨 Required

**Always do this step — even if you think no migrations were added.**
Run `db_migration_status` to check, then apply any pending migrations before running `make pc`.
Tests may depend on the updated schema, so migrations must be applied first.

```
# MCP tools (preferred)
db_migration_status(worktreePath: "$wt")
db_migrate(worktreePath: "$wt")

# Shell fallback
pnpm --prefix $wt/lib/db-client run db:status
pnpm --prefix $wt/lib/db-client run db:up
```

Confirm the MCP response contains `"applied": N` (with N >= 0) or the shell output shows `Applied N new migrations` / `No new migrations to apply`.
If it throws an error, fix the migration SQL, re-commit, push, and re-run.

> 🛑 **Blocked here? Do NOT open the PR.** A PR with an unapplied migration leaves the
> local database out of sync and breaks any developer who pulls the branch.

### Step 7: Pre-PR Validation

> **⚠️ CRITICAL: Run `make pc` before pushing.** Every agent that modifies code must validate before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time. Minimum alternative: `make format && make lint-fix && make typecheck`.

Run the full validation suite before opening the PR. Fix any failures and push again before continuing.

```powershell
make pc
```

> **Docs-only changes?** Use main repo's Prettier: `node D:\code\legacy-sports\node_modules\prettier\bin\prettier.cjs --check .`

> **Formatting failures?** Run `make format-commit` (formats + stages + commits). The working tree must be otherwise clean. Then re-run `make pc`.

> 🚨 **DO NOT STOP HERE.** Passing `make pc` is a checkpoint, not the finish line. You **must**
> continue to Step 8 (create PR) and Step 9 (Jira "In Review"). Stopping after validation
> without opening a PR is the single most common agent failure mode.

### Step 7c: User Testing (Optional)

If you want to test the UI live against running dev servers before opening a PR,
see [user-testing.md](../shared/user-testing.md). This checks the branch out in the
main repo where dev servers run, lets you verify visually, then returns main to `main`.

### Step 7b: Run Affected E2E Tests

Before opening the PR, run all E2E tests affected by your changes. This catches UI regressions that `make pc` does not cover.

Use the `nx_run_affected` MCP tool (`nx_run_affected(target: "e2e")`) when available. Fall back to shell only when MCP is unavailable (run from the worktree root):

```powershell
pnpm exec nx affected -t e2e --base=origin/main
```

> **What this runs:** Playwright tests in any `*-e2e` project whose source or dependencies changed. For most web-app tickets this means `web-e2e`. The command uses the same `@critical|@smoke` filter as CI by default.

If no e2e project is affected (pure back-end / library change), the command exits immediately with a "no affected projects" message — this is fine, continue to step 8.

If tests fail:

1. Read the Playwright error output carefully.
2. Fix the failing test or the underlying UI bug in the worktree.
3. Commit the fix: `git add -A ; git commit -m "fix(web-e2e): ..."`.
4. Re-run `pnpm exec nx affected -t e2e --base=origin/main` until all tests pass.
5. Then re-run `make pc` to ensure nothing regressed.

> **🚨 DO NOT OPEN THE PR until E2E tests pass.** A PR with known E2E failures blocks CI and forces reviewers to context-switch back to you.

### Step 8: Create Pull Request

See the [pr-lifecycle skill](../../../pr-lifecycle/SKILL.md) for the full PR template workflow. Use the MCP tool (preferred):

```
github_create_pr(title: "LS-#### type(scope): description", body: <markdown>, draft: true, head: <branch-name>)
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])
github_mark_pr_ready(number: <PR#>)
```

<details>
<summary>CLI fallback (only when MCP server is unavailable)</summary>

```bash
gh pr create --draft --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main
bash scripts/cleanup-pr-body.sh
gh pr edit <PR#> --add-label "agent-in-progress"
gh pr ready <PR#>
```

</details>

### Step 9: Update Jira to In Review

Use the `jira_transition` MCP tool (primary):

```
jira_transition(key: "LS-####", status: "In Review")
```

### Step 10: Cleanup After Merge

```powershell
cd "D:\code\legacy-sports"
make sync-worktrees-remove TICKET=####
twig worktree clean
git branch -d "LS-####/short-description"
```

> **🚨 NEVER use `git worktree remove` or manually delete a worktree directory** — it destroys `node_modules` symlinks. Always use `twig worktree clean`. See [concurrent-agent-safety.md](../shared/concurrent-agent-safety.md).

## Moving an Existing Worktree

If a worktree was created at the wrong path, use `git worktree move` (not `mv`). You **must not** be inside the worktree directory when running this:

```powershell
cd "D:\code\legacy-sports"   # must be in another worktree or main repo
git worktree move "D:\code\old-path" "D:\code\new-path"
twig worktree list  # verify
```

> 📎 **Troubleshooting** (twig commands, permissions, stale entries, node_modules, cleanup cadence): see [worktree-troubleshooting.md](./worktree-troubleshooting.md)

> 📎 **In-place branching** (without worktrees): for users who explicitly ask to skip worktrees, see [in-place-branching.md](./in-place-branching.md)

> 📎 **Dependent branch trees** (stacked branches, cascade rebase, skip-commits): see [branch-tree-management.md](./branch-tree-management.md)

> 📎 **Common workflow mistakes & recovery** (wrong parent, duplicate branches, partial implementation): see [workflow-common-mistakes.md](../shared/workflow-common-mistakes.md)

> 📎 **Client bug triage** (specialized entry point: pick up bugs from the current client bugs bucket epic): see [client-bug-triage.md](./client-bug-triage.md)

## Quick Reference

```powershell
# 1. Create branch + sibling worktree
cd "D:\code\legacy-sports"
make worktree TICKET=#### DESC=description                           # independent
make worktree TICKET=#### DESC=description PARENT=LS-XXXX/branch     # dependent

# 2. Jira → In Progress (MCP tool — primary)
jira_transition(key: "LS-####", status: "In Progress")

# 3. Setup (node_modules + .env + .twig)
$wt = "<path-from-twig-worktree-list>"
make wt-setup WT=$wt

# 4. Work + self-review + commit + push (MCP tools — primary)
# Run /review (see review skill) to catch rule violations and quality issues
worktree_commit(worktree: "LS-####", message: "feat(scope): msg (LS-####)")
worktree_push(worktree: "LS-####", setUpstream: true)
# Shell fallback: git -C $wt add . ; git -C $wt commit -m "feat(scope): msg (LS-####)" ; git -C $wt push -u origin HEAD

# 5. Migrations + validate
db_migration_status(worktreePath: "$wt")
db_migrate(worktreePath: "$wt")
make -C $wt pc

# 6. PR + Jira (DO NOT stop at make pc) — MCP tools primary
github_create_pr(title: "LS-#### type(scope): msg", body: <markdown>, draft: true, head: <branch-name>)
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])  # apply while still draft
github_mark_pr_ready(number: <PR#>)
jira_transition(key: "LS-####", status: "In Review")
# Shell fallback (only if MCP unavailable): gh pr create --draft --title "..." --body-file ".github/tmp-pr-body.md" --base main
#   gh pr edit <PR#> --add-label "agent-in-progress"
#   gh pr ready <PR#>

# 7. Cleanup after merge
cd "D:\code\legacy-sports"
make sync-worktrees-remove TICKET=####
twig worktree clean ; git branch -d "LS-####/description"
```
