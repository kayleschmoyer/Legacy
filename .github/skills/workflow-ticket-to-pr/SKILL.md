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

### Step 2: Transition Jira to In Progress

**Do this immediately** — as soon as you begin working on a ticket, before creating the worktree or writing any code:

```powershell
# Transition ticket to "In Progress"
acli jira workitem transition --key LS-1234 --status "In Progress"
```

### Step 3: Verify You Are on Main

```powershell
# Must be on main before creating a worktree
git branch
git status

git checkout main
git pull
```

### Step 4: Create Branch + Worktree

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

> **Reminder**: The Jira ticket should already be "In Progress" from Step 2. If you skipped
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

> **⚠️ DEPENDENCY CHECK**: Before branching, check the Jira ticket for "blocked-by" linked issues and query their status:
>
> - **Blocker not In Review or Done → 🛑 STOP.** Do not proceed — the blocking ticket must reach at least "In Review" first.
> - **Blocker In Review → branch from the blocker's branch** (use the dependent path above).
> - **Blocker Done (or no blockers) → branch from `origin/main`** (use the independent path).
>   Always verify with `twig tree` that the new branch appears under the right parent.

### Step 5: Make Your Changes

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

### Step 6: Commit Changes

```powershell
# Stage all changes
git add .

# Commit with conventional format
git commit -m "feat(scope): description (LS-1234)"

# Push to remote
git push origin HEAD
```

### Step 7: Rebase onto Parent Branch

Before validating, rebase onto the parent branch (either `main` or a stacked feature branch) so `make pc` reflects the same base CI will use.

```powershell
git fetch origin
twig rebase   # rebases onto twig-tracked parent: main for independent branches, parent feature branch for stacked work
```

If conflicts occur, see the [rebase-conflicts skill](../rebase-conflicts/SKILL.md). After resolving:

### Step 7b: Post-Rebase Stabilization + Validation

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
> continue to Step 8 (create PR) and Step 9 (Jira "In Review"). Stopping after validation
> without opening a PR is the single most common agent failure mode.

### Step 7c: Apply Pending Migrations 🚨

If you added or modified any migration files under `lib/db-client/migrations/`, apply them now — **before** opening the PR:

```powershell
cd lib/db-client
pnpm run db:up
```

Confirm the output shows `Applied N new migrations`. If it throws, fix the migration SQL before proceeding.

> ⚠️ **Do not skip this step.** A PR with an unapplied migration leaves the local DB out of sync and means reviewers cannot run the app without manual intervention.

### Step 7d: User Testing (Optional)

If you want live UI verification before opening the PR, see the [user-testing skill](../user-testing/SKILL.md).
This temporarily checks the branch out in the main repo (where dev servers run) so you can test changes
visually, then returns `main` to main.

### Step 8: Create Pull Request

See the [create-pr skill](../create-pr/SKILL.md) for the full PR template workflow. For a quick PR:

```powershell
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main
```

### Step 9: Update Jira Status

```powershell
# Transition to "In Review"
acli jira workitem transition --key LS-1234 --status "In Review"
```

### Step 10: After PR Merge

```powershell
# Transition to "Done"
acli jira workitem transition --key LS-1234 --status "Done"

# Clean up the worktree (run from main repo)
cd "D:\code\legacy-sports"
twig worktree clean
git branch -d "LS-1234/short-description"
```

````

## Common Mistakes to Avoid

### ❌ MISTAKE 5: Forgetting `-p=main` on `twig switch`

```powershell
# WRONG - no parent specified
twig switch LS-1234  # ❌ twig may pick wrong parent!

# CORRECT - always specify parent explicitly
twig switch LS-1234 -p=main     # new independent feature
twig switch LS-1234 -p=current  # follow-up/dependent work
````

Without `-p=main`, twig may not correctly track the branch's parent,
causing issues with rebasing, PR targets, and the branch dependency tree.
**Always use `-p=main` for new features or `-p=current` for dependent work.**

### ❌ MISTAKE 6: Branching from main when ticket depends on an in-progress branch

```powershell
# WRONG - LS-200 depends on unmerged LS-199, but branched from main
git checkout main
twig switch LS-200 -p=main  # ❌ creates sibling branch, loses LS-199 changes!

# CORRECT - branch from the in-progress parent ticket
git checkout LS-199/branch-name
twig switch LS-200 -p=current  # ✅ properly stacked under LS-199
```

If you made this mistake, fix it by rebasing and updating twig:

```powershell
# Rebase child onto correct parent
git checkout LS-200/branch-name
git rebase --no-edit LS-199/branch-name  # resolve any conflicts

# Update twig dependency map
twig branch depend --exclusive LS-200/branch-name LS-199/branch-name

# Force push
git push --force-with-lease origin HEAD

# Verify tree
twig tree
```

### ❌ MISTAKE 7: Partial Implementation Without Follow-Up Tickets {#mistake-7-partial-implementation-without-follow-up-tickets}

Implementing only part of a ticket's scope without either finishing it or creating follow-up tickets causes scope to fall through the cracks.

```powershell
# WRONG - close ticket even though some acceptance criteria are incomplete
git commit -m "feat(x): partial implementation"
# ... open PR, mark ticket Done, some AC never addressed ❌

# CORRECT - either finish everything, or create follow-up tickets for remaining work
$result = acli jira workitem create `
  --summary "Follow-up: [remaining scope from LS-####]" `
  --project LS `
  --type Task `
  --json | ConvertFrom-Json
Write-Host "Created follow-up: $($result.key)"
# Reference $result.key in your PR description
```

**Rules:**

- Every acceptance criterion in the original ticket must be either **implemented** or **tracked in a follow-up ticket**.
- Reference all follow-up ticket keys in the PR description under a "Follow-up work" section.
- Do not mark the original ticket as Done if meaningful scope was punted — the follow-up must exist first.

### ❌ MISTAKE 0: Editing Files in the Main Repo Before Creating a Worktree

Reading files and running read-only commands (AWS CLI, `git log`, `gh run view`) from the main repo is fine. But **any file edit must happen inside a worktree**, even if you haven't committed yet.

```powershell
# WRONG - editing a file directly in the main repo
cd D:\code\legacy-sports
# ... open an editor, change a file ...
# Even if you don't commit, this pollutes the main repo and requires cleanup.
```

**Fix if this happens:**

```powershell
# 1. Stash the edit so main is clean again
cd D:\code\legacy-sports
git stash

# 2. Create a Jira ticket and worktree normally
$key = (acli jira workitem create --summary "..." --project LS --type Task --json | ConvertFrom-Json).key
acli jira workitem transition --key $key --status "In Progress"
twig worktree create "$key/description"
$wt = "<path from twig worktree list>"
make wt-setup WT=$wt

# 3. Re-apply the change inside the worktree
cd $wt
# Re-apply via your editor, or: git -C D:\code\legacy-sports stash show -p | git apply

# 4. From this point forward all edits and commands target $wt only
```

> This mistake is especially easy to make during **investigation tasks** (e.g. debugging a CI workflow): you find the problem, instinctively fix the file, and only then realize you were in the main repo. Stash → worktree → re-apply is the recovery pattern.

### ❌ MISTAKE 1: Committing to Main

```powershell
# WRONG - Making changes on main
git branch  # Shows: * main
# ... edit files ...
git commit -m "changes"  # ❌ WRONG!
```

**Fix if this happens:**

```powershell
# Undo the commit (keep changes)
git reset HEAD~1

# Create proper branch (ALWAYS specify -p=main)
twig switch LS-1234 -p=main

# Now commit properly
git add .
git commit -m "feat(scope): description (LS-1234)"
git push origin HEAD
```

### ❌ MISTAKE 2: Forgetting Jira Updates

Always update Jira status at:

- Start: "In Progress"
- PR Created: "In Review"
- PR Merged: "Done"

### ❌ MISTAKE 3: Skipping Pre-PR Validation

Always run `make pc` before creating a PR. It catches type errors, lint issues, test failures, and build breaks before reviewers see them.

### ❌ MISTAKE 3b: Ignoring Formatting Failures From `make pc`

`make pc` runs `nx format:write` and then **fails** if any files were reformatted, printing the list.
Commit the reformatted files and re-run `make pc` before pushing.

```powershell
# WRONG - bypass the failure or push without fixing it
git push origin HEAD  # ❌ reformatted files never committed — CI will fail!

# CORRECT - commit the reformatted files, then re-run
git add -A
git commit -m "style: fix code formatting"
make pc               # ✅ re-run to confirm clean
git push origin HEAD
```

### ❌ MISTAKE 4: No PR Created

All work must go through PR review, even for documentation. **This is the #1 agent failure mode**: agents write code, run `make pc`, and stop — thinking the task is done. Your work is **not complete** until:

1. `gh pr create` has been run and the PR URL is visible
2. Jira has been moved to "In Review"

If you find yourself about to end your turn after `make pc`: **STOP and keep going.**

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

## Recovery Procedures

### If You Committed to Main by Mistake

```powershell
# 1. Undo the commit (keep changes)
git reset HEAD~1

# 2. Create proper branch (ALWAYS specify -p=main)
twig switch LS-1234 -p=main

# 3. Commit on branch
git add .
git commit -m "feat(scope): description (LS-1234)"
git push origin HEAD

# 4. Create PR (see create-pr skill for full template)
gh pr create --title "LS-1234 feat(scope): description" --body-file ".github/tmp-pr-body.md" --base main
```

### If You Pushed to Main by Mistake

> **⚠️ NEVER force-push main.** The `non_fast_forward` ruleset blocks it, and even
> if you have admin bypass, force-pushing rewrites public history and can strip
> other people's commits. Use `git revert` instead — it's safe regardless of
> protection state.

```powershell
# 1. Revert the accidental commit on main (creates a new commit that undoes it)
git checkout main
git revert HEAD --no-edit
git push origin main

# 2. Create a feature branch from before the revert
git checkout -b LS-1234/fix HEAD~2   # the original good commit

# 3. Cherry-pick the original work (skip the revert)
git cherry-pick HEAD~1

# 4. Push and open a PR
git push origin HEAD
gh pr create --title "LS-1234 fix(scope): description" --body-file ".github/tmp-pr-body.md" --base main
```

> **Why revert instead of force-push?** `git revert` adds a new commit and never
> rewrites history. Force-pushing main can strip commits that others have already
> pulled or that CI has built against.

---

**Remember: Branch FIRST, Code SECOND, PR ALWAYS** 🚀
