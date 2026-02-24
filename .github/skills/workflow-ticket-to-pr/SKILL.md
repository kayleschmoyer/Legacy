---
name: workflow-ticket-to-pr
description: 'Complete end-to-end workflow for implementing a Jira ticket: Jira status, branch creation, coding with Nx, pre-commit validation, and PR creation. NEVER commit to main.'
---

# Skill: Complete Workflow - Ticket to PR

## Overview

Complete workflow for implementing a Jira ticket from start to finish, following proper branching and PR creation practices.

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

### Step 1: Verify Current Branch

```powershell
# ALWAYS check your branch first
git branch
git status

# If on main, STOP and create feature branch before proceeding
```

### Step 2: Create Feature Branch

```powershell
# For new ticket from main (ALWAYS specify -p=main)
git checkout main
git pull
twig switch LS-1234 -p=main

# For follow-up work from current branch
twig switch LS-1234 -p=current

# For ticket that depends on ANOTHER in-progress ticket (not yet merged)
# First check out the parent ticket's branch, then branch from it:
git checkout LS-XXXX/parent-branch-name
twig switch LS-1234 -p=current
```

> **⚠️ DEPENDENCY CHECK**: Before branching, check the Jira ticket for linked issues
> or descriptions that indicate a dependency on another in-progress ticket.
> Always verify with `twig tree` that the new branch appears under the right parent.

**⚠️ DO NOT SKIP THIS STEP**

### Step 3: Update Jira Status

```powershell
# Transition ticket to "In Progress"
acli jira workitem transition --key LS-1234 --status "In Progress"
```

### Step 4: Make Your Changes

- Edit files
- Write code
- Update documentation
- Add tests

**✅ Now safe to modify files - you're on a feature branch**

### Step 5: Pre-Commit Validation

```powershell
# Run validation in order
pnpm exec nx run db:print-schema     # 1. Regenerate GraphQL schema
pnpm exec nx affected -t codegen     # 2. Regenerate TypeScript types from schema
pnpm exec nx affected -t typecheck   # 3. Type checking
pnpm exec nx affected -t lint --fix  # 4. Linting with auto-fix
pnpm exec nx affected -t test        # 5. Testing
pnpm exec nx affected -t build       # 6. Building
```

### Step 6: Commit Changes

```powershell
# Stage all changes
git add .

# Commit with conventional format
git commit -m "feat(scope): description (LS-1234)"

# Push to remote
git push origin HEAD
```

### Step 7: Create Pull Request

```powershell
# Create PR with twig
twig github pr create-pr
```

### Step 8: Update Jira Status

```powershell
# Transition to "In Review"
acli jira workitem transition --key LS-1234 --status "In Review"
```

### Step 9: After PR Merge

```powershell
# Transition to "Done"
acli jira workitem transition --key LS-1234 --status "Done"
```

## Common Mistakes to Avoid

### ❌ MISTAKE 5: Forgetting `-p=main` on `twig switch`

```powershell
# WRONG - no parent specified
twig switch LS-1234  # ❌ twig may pick wrong parent!

# CORRECT - always specify parent explicitly
twig switch LS-1234 -p=main     # new independent feature
twig switch LS-1234 -p=current  # follow-up/dependent work
```

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

### ❌ MISTAKE 3: Skipping Validation

Never skip pre-commit checks. They catch issues early.

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

- [ ] Check current branch (`git branch`)
- [ ] Verify NOT on main
- [ ] Create feature branch if needed
- [ ] Update Jira to "In Progress"
- [ ] NOW safe to make changes

## Quick Reference

```powershell
# 1. Create branch (ALWAYS FIRST — specify parent!)
twig switch LS-1234 -p=main

# 2. Update Jira
acli jira workitem transition --key LS-1234 --status "In Progress"

# 3. Make changes
# ... edit files ...

# 4. Validate
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
pnpm exec nx affected -t build

# 5. Commit
git add .
git commit -m "feat(scope): description (LS-1234)"
git push origin HEAD

# 6. Create PR
twig github pr create-pr

# 7. Update Jira
acli jira workitem transition --key LS-1234 --status "In Review"
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
