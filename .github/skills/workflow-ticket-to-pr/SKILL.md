---
name: workflow-ticket-to-pr
description: 'Complete end-to-end workflow for implementing a Jira ticket: Jira status, branch creation, coding with Nx, pre-commit validation, and PR creation. NEVER commit to main.'
---

# Skill: Complete Workflow - Ticket to PR

## Overview

Complete workflow for implementing a Jira ticket from start to finish. **The preferred approach is to create a git worktree** so the work is fully isolated in its own directory and VS Code window. Use a simple in-place branch only for small, quick changes.

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

### Step 2: Verify You Are on Main

```powershell
# Must be on main before creating a worktree
git branch
git status

git checkout main
git pull
```

### Step 3: Create Branch + Worktree

**Preferred — worktree (full isolation):**

```powershell
cd "D:\code\legacy-sports"
twig worktree create LS-1234/short-description

# Confirm the path twig chose
twig worktree list
$wt = "<path-from-twig-worktree-list>"
```

Then set up the worktree environment before opening it:

```powershell
cd $wt
make install
Copy-Item "D:\code\legacy-sports\.env" .env
cmd /c mklink /J ".twig" "D:\code\legacy-sports\.twig"
code $wt   # open in a new VS Code window; do all work there
```

> For tickets that depend on an unmerged parent ticket, create the branch first so twig tracks the dependency, then add the worktree:
>
> ```powershell
> git checkout LS-XXXX/parent-branch-name
> twig switch LS-1234 -p=current
> git checkout main
> twig worktree create LS-1234/short-description
> ```

**Lightweight alternative (in-place, no separate window):**

```powershell
# For new independent ticket
git checkout main ; git pull
twig switch LS-1234 -p=main

# For ticket dependent on an in-progress branch
git checkout LS-XXXX/parent-branch-name
twig switch LS-1234 -p=current
```

> **⚠️ DEPENDENCY CHECK**: Before branching, check the Jira ticket for linked issues
> or descriptions that indicate a dependency on another in-progress ticket.
> Always verify with `twig tree` that the new branch appears under the right parent.

### Step 4: Update Jira Status

```powershell
# Transition ticket to "In Progress"
acli jira workitem transition --key LS-1234 --status "In Progress"
```

### Step 5: Make Your Changes

- Edit files
- Write code
- Update documentation
- Add tests

**✅ Now safe to modify files - you're on a feature branch**

### Step 6: Commit Changes

```powershell
# Stage all changes
git add .

# Commit with conventional format
git commit -m "feat(scope): description (LS-1234)"

# Push to remote
git push origin HEAD
```

### Step 7: Pre-PR Validation

Run the full validation suite before opening the PR. Fix any failures and amend/push before continuing.

```powershell
make pc
```

> ⚠️ **Formatting trap**: `make pc` runs `nx format:write` which **silently rewrites files in place**.
> CI runs `nx format:check` and **fails** if any committed file differs from what Prettier expects.
> After `make pc`, always check for unstaged changes and commit them:
>
> ```powershell
> git status          # look for modified files after make pc
> git diff --stat     # see what was reformatted
> git add -A
> git commit -m "style: fix code formatting"
> git push origin HEAD
> ```

### Step 7b: User Testing (Optional)

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
git rebase LS-199/branch-name  # resolve any conflicts

# Update twig dependency map
twig branch depend --exclusive LS-200/branch-name LS-199/branch-name

# Force push
git push --force-with-lease origin HEAD

# Verify tree
twig tree
```

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

### ❌ MISTAKE 3b: Not Committing Formatting Changes After `make pc`

`make pc` runs `nx format:write` which rewrites files silently — it does **not** fail if files were changed.
CI runs `nx format:check` which **does** fail on the same files. This is the most common cause of a CI
formatting failure on a PR that passed `make pc` locally.

```powershell
# WRONG - run make pc but ignore the reformatted files
make pc
git push origin HEAD  # ❌ reformatted files never committed — CI will fail!

# CORRECT - always check for and commit formatting changes after make pc
make pc
git status             # ✅ check for modified files
git add -A
git commit -m "style: fix code formatting"  # skip only if git status was clean
git push origin HEAD
```

### ❌ MISTAKE 4: No PR Created

All work must go through PR review, even for documentation.

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
- [ ] Update Jira to "In Progress"
- [ ] NOW safe to make changes

## Quick Reference

```powershell
# 0. Create ticket if one doesn't exist
$result = acli jira workitem create --summary "Description" --project LS --type Task --json | ConvertFrom-Json
$key = $result.key   # e.g. LS-225

# 1. Create branch + worktree (preferred)
cd "D:\code\legacy-sports"
git checkout main ; git pull
twig worktree create "$key/description"
twig worktree list   # note $wt path

# 1b. Set up worktree environment
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

# 5b. Commit any formatting changes make pc auto-fixed (REQUIRED)
git add -A
git diff --cached --stat   # confirm only formatting changes
git commit -m "style: fix code formatting"  # skip if nothing changed
git push origin HEAD

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

# 4. Create PR
twig github pr create-pr
```

### If You Pushed to Main by Mistake

```powershell
# 1. Create branch from before your commit
git checkout -b LS-1234/fix main~1

# 2. Cherry-pick your commit
git cherry-pick main

# 3. Revert main to previous state
git checkout main
git reset --hard origin/main~1
git push -f origin main

# 4. Push your branch
git checkout LS-1234/fix
git push origin HEAD

# 5. Create PR
twig github pr create-pr
```

**⚠️ Only use force-push if no one else has pulled your changes**

---

**Remember: Branch FIRST, Code SECOND, PR ALWAYS** 🚀
