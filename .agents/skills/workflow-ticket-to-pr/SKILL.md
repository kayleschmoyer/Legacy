---
name: workflow-ticket-to-pr
description: 'Complete end-to-end workflow for implementing a Jira ticket: Jira status, branch creation, coding with Nx, pre-commit validation, and PR creation. NEVER commit to main.'
---

# Skill: Complete Workflow - Ticket to PR

## Overview

Complete workflow for implementing a Jira ticket from start to finish. **Always create a git worktree** so the work is fully isolated in its own directory and VS Code window.

> 🎯 **Definition of Done**: A ticket is not complete until **all acceptance criteria are fully implemented and validated**. If any scope remains unfinished when you open the PR, you must create follow-up Jira tickets for the remaining work (see [Common Mistake 7](#mistake-7-partial-implementation-without-follow-up-tickets)). Do not leave work half-done or silently drop scope — either finish it or track it.

## 🚨 CRITICAL RULE: NEVER COMMIT DIRECTLY TO MAIN

**ALWAYS create a feature branch BEFORE making any code changes.**

If you find yourself on `main` after making changes, STOP and create a branch immediately.

## When to Use

- Starting work on any Jira ticket
- Implementing new features
- Fixing bugs
- Making documentation changes
- ANY code or file modifications

## Complete Workflow Steps

### Step 1: Create a Jira Ticket (if one doesn't exist)

If a ticket already exists, skip to Step 2.

```powershell
# Create the ticket and capture the key
$result = acli jira workitem create `
  --summary "Short description of the work" `
  --project LS `
  --type Task `
  --json | ConvertFrom-Json
$key = $result.key   # e.g. "LS-225"
Write-Host "Created ticket: $key"
```

Common `--type` values: `Task`, `Bug`, `Story`. Add `--parent LS-####` to nest under an Epic.

### Step 2: Check Blockers Before Any Status Transition

Before transitioning the ticket, inspect Jira "blocked-by" links and verify blocker status:

- **Blocker not In Review or Done → STOP**. Do not proceed.
- **Blocker In Review → use blocker branch as parent** when creating the worktree.
- **Blocker Done (or no blockers) → base from** `origin/main`.

### Step 3: Transition Jira to In Progress

Run this only after Step 2 passes:

```powershell
# Transition ticket to "In Progress"
acli jira workitem transition --key LS-1234 --status "In Progress"
```

### Step 4: Verify You Are on Main

```powershell
# Must be on main before creating a worktree
git branch
git status

git checkout main
git pull
```

### Step 5: Create Branch + Worktree

```powershell
cd "D:\code\legacy-sports"
twig worktree create LS-1234/short-description

# Confirm the path twig chose
twig worktree list
$wt = "<path-from-twig-worktree-list>"
```

Then set up the worktree environment before opening it:

```powershell
# Smart setup — handles node_modules, .env, and .twig in one command:
make wt-setup WT=$wt

# Or manually:
cd $wt
make install
Copy-Item "D:\code\legacy-sports\.env" .env
cmd /c mklink /J ".twig" "D:\code\legacy-sports\.twig"

code $wt   # open in a new VS Code window; do all work there
```

> **Agent multi-root access (optional):** Run `make sync-worktrees` from the main
> repo, then `code legacy-sports.code-workspace` to open one VS Code window with
> the main repo and all active worktrees. This gives agents full search access
> across worktrees. See [worktree-workflow](../worktree-workflow/SKILL.md) for details.
> **⚠️ CRITICAL — switch your working context now.** From this point forward, every file
> edit, terminal command, and git operation must happen inside `$wt`. Never edit files
> under `D:\code\legacy-sports` when working on a ticket.

> **Reminder**: The Jira ticket should already be "In Progress" from Step 3. If you skipped
> that step, run the transition command now before proceeding.

> For tickets that depend on an unmerged parent ticket, create the branch first so twig tracks the dependency, then add the worktree:
>
> ```powershell
> git checkout LS-XXXX/parent-branch-name
> twig switch LS-1234 -p=current
> git checkout main
> twig worktree create LS-1234/short-description
> ```

> **In-place branching (without a worktree) is only allowed when the user explicitly
> requests it** (e.g., "no worktree" or "in-place"). If the user does not specify,
> always default to a worktree.
>
> In-place (if explicitly requested):
>
> ```powershell
> # For new independent ticket
> git checkout main ; git pull
> twig switch LS-1234 -p=main
>
> # For ticket dependent on an in-progress branch
> git checkout LS-XXXX/parent-branch-name
> twig switch LS-1234 -p=current
> ```

> **⚠️ DEPENDENCY CHECK**: Step 2 must be completed before transitioning status or branching:
>
> - **Blocker not In Review or Done → 🛑 STOP.** Do not proceed — the blocking ticket must reach at least "In Review" first.
> - **Blocker In Review → branch from the blocker's branch** (use the dependent path above).
> - **Blocker Done (or no blockers) → branch from `origin/main`** (use the independent path).
>   Always verify with `twig tree` that the new branch appears under the right parent.

### Step 6: Make Your Changes

- Edit files
- Write code
- Update documentation
- Add tests

**✅ Now safe to modify files - you're on a feature branch**

> 🎯 **Completion requirement**: Before opening a PR, ensure the ticket is **fully implemented**.
>
> - If the full scope can be completed: implement it all and validate.
> - If unforeseen complexity makes full completion impractical: implement what you can, then **create follow-up Jira tickets** for the remaining work before opening the PR. Reference the follow-up ticket keys in your PR description.
> - **Never silently drop acceptance criteria** or leave work partially done without tracking it.

### Step 7: Commit Changes

```powershell
# Stage all changes
git add .

# Commit with conventional format
git commit -m "feat(scope): description (LS-1234)"

# Push to remote
git push origin HEAD
```

### Step 8: Rebase onto Parent Branch

Before validating, rebase onto the parent branch (either `main` or a stacked feature branch) so `make pc` reflects the same base CI will use.

```powershell
git fetch origin
twig rebase   # rebases onto twig-tracked parent: main for independent branches, parent feature branch for stacked work
```

If conflicts occur, see the [rebase-conflicts skill](../rebase-conflicts/SKILL.md). After resolving:

### Step 8b: Post-Rebase Stabilization + Validation

> 🚨 **Do NOT push until `make pc` passes.** Pushing before validating is the #1 cause of post-rebase CI failures.

```powershell
# Stabilize: main may have changed deps, schema, or formatting
make install
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main

# Validate
make pc
```

> ⚠️ **Formatting**: `make pc` runs `nx format:write` then checks `git diff`. If any files were
> reformatted, `make pc` **fails** and prints the list of changed files. Commit them and re-run:
>
> ```powershell
> git add -A
> git commit -m "style: fix code formatting"
> make pc  # re-run to confirm clean
> ```

Only push **after `make pc` passes**:

```powershell
git push --force-with-lease origin HEAD
```

> 🚨 **DO NOT STOP HERE.** Passing `make pc` is a checkpoint, not the finish line. You **must**
> continue to Step 9 (create PR) and Step 10 (Jira "In Review"). Stopping after validation
> without opening a PR is the single most common agent failure mode.

### Step 8c: Apply Pending Migrations 🚨

If you added or modified any migration files under `lib/db-client/migrations/`, apply them now — **before** opening the PR:

```powershell
cd lib/db-client
pnpm run db:up
```

Confirm the output shows `Applied N new migrations`. If it throws, fix the migration SQL before proceeding.

> ⚠️ **Do not skip this step.** A PR with an unapplied migration leaves the local DB out of sync and means reviewers cannot run the app without manual intervention.

### Step 8d: User Testing (Optional)

If you want live UI verification before opening the PR, see the [user-testing skill](../user-testing/SKILL.md).
This temporarily checks the branch out in the main repo (where dev servers run) so you can test changes
visually, then returns `main` to main.

### Step 9: Create Pull Request

See the [create-pr skill](../create-pr/SKILL.md) for the full PR template workflow. For a quick PR:

```powershell
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main
```

### Step 10: Update Jira Status

```powershell
# Transition to "In Review"
acli jira workitem transition --key LS-1234 --status "In Review"
```

### Step 11: After PR Merge

```powershell
# Transition to "Done"
acli jira workitem transition --key LS-1234 --status "Done"

# Clean up the worktree (run from main repo)
cd "D:\code\legacy-sports"
twig worktree clean
git branch -d "LS-1234/short-description"
```

> 📎 **Common mistakes** (mistakes 0-7: editing main repo, committing to main, forgetting Jira, skipping validation, formatting failures, no PR, wrong parent, partial implementation): see [references/workflow-common-mistakes.md](references/workflow-common-mistakes.md)

## Branch Naming Convention

Twig automatically creates proper names:

- `feature/LS-####-description` for features
- `bugfix/LS-####-description` for bugs
- `hotfix/LS-####-description` for urgent fixes

## Exit Codes

- **0**: Success at each step
- **Non-zero**: Error - fix before proceeding

## Pre-Flight Checklist

Before starting ANY work:

- [ ] Jira ticket exists — create one with `acli jira workitem create` if not
- [ ] Pull latest main (`git checkout main ; git pull`)
- [ ] Run `twig worktree create LS-####/description` from main repo
- [ ] Run `make install`, copy `.env`, junction `.twig` in the new worktree
- [ ] Open worktree in a new VS Code window (`code $wt`)
- [ ] **All file edits and terminal commands will target `$wt`, NOT the main repo**
- [ ] Update Jira to "In Progress"
- [ ] NOW safe to make changes

## Definition-of-Done Checklist

Before opening the PR, confirm every item:

- [ ] All acceptance criteria from the Jira ticket are implemented
- [ ] Any unfinished scope has a **new follow-up Jira ticket** created and referenced in the PR description
- [ ] `make pc` passes with no errors
- [ ] Formatting changes from `make pc` are committed
- [ ] If migration files were added: `pnpm run db:up` succeeded (`Applied N new migrations`)
- [ ] PR title includes the ticket key (e.g. `LS-#### type(scope): description`)

After the PR is created (work is NOT done without these):

- [ ] `gh pr create` has been run and a PR URL exists
- [ ] Jira ticket has been moved to "In Review"

## Quick Reference

```powershell
# 0. Create ticket if one doesn't exist
$result = acli jira workitem create --summary "Description" --project LS --type Task --json | ConvertFrom-Json
$key = $result.key   # e.g. LS-225

# 1. Create branch + worktree
cd "D:\code\legacy-sports"
git checkout main ; git pull
twig worktree create "$key/description"
twig worktree list   # note $wt path

# 1b. Set up worktree environment — ALL remaining steps happen here
$wt = "<path-from-twig-worktree-list>"
cd $wt ; make install
Copy-Item "D:\code\legacy-sports\.env" .env
cmd /c mklink /J ".twig" "D:\code\legacy-sports\.twig"
code $wt   # open new VS Code window, do all work there

# 2. Update Jira
acli jira workitem transition --key $key --status "In Progress"

# 3. Make changes (in the worktree VS Code window)
# ... edit files ...

# 4. Commit
git add .
git commit -m "feat(scope): description ($key)"
git push origin HEAD

# 5. Pre-PR validation
make pc

# 🚨 DO NOT STOP HERE — make pc passing is a checkpoint, not the finish line.
# You MUST continue to step 6 (PR) and step 7 (Jira). Stopping here is the #1 agent failure mode.

# 5b. Commit any formatting changes make pc auto-fixed (REQUIRED)
git add -A
git diff --cached --stat   # confirm only formatting changes
git commit -m "style: fix code formatting"  # skip if nothing changed
git push origin HEAD

# 5c. Apply pending migrations (if any migration files were added)
cd lib/db-client ; pnpm run db:up   # confirm "Applied N new migrations"
cd $wt

# 6. Create PR (see create-pr skill for full template)
gh pr create --title "$key type(scope): description" --body-file ".github/tmp-pr-body.md" --base main

# 7. Update Jira
acli jira workitem transition --key $key --status "In Review"

# 8. After merge — cleanup
cd "D:\code\legacy-sports"
twig worktree clean
git branch -d "$key/description"
acli jira workitem transition --key $key --status "Done"
```

## Related Skills

- [Branch Creation](branch-create.md) - Detailed branch creation
- [Jira Ticket Management](jira-ticket.md) - Jira operations
- [Pull Request Creation](create-pr.md) - PR workflow
- [Type Checking](typecheck.md) - Validation step 1
- [Linting](lint.md) - Validation step 2
- [Testing](test.md) - Validation step 3
- [Building](build.md) - Validation step 4

> 📎 **Recovery procedures** (committed to main recovery, pushed to main revert workflow): see [references/workflow-recovery-procedures.md](references/workflow-recovery-procedures.md)

---

**Remember: Branch FIRST, Code SECOND, PR ALWAYS** 🚀
