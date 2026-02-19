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
# For new ticket from main
git checkout main
git pull
twig switch LS-1234

# For follow-up work from current branch
twig switch LS-1234 -p=current
```

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
pnpm exec nx affected -t typecheck   # 1. Type checking
pnpm exec nx affected -t lint --fix  # 2. Linting with auto-fix
pnpm exec nx affected -t test        # 3. Testing
pnpm exec nx affected -t build       # 4. Building
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

# Create proper branch
twig switch LS-1234

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
# 1. Create branch (ALWAYS FIRST)
twig switch LS-1234

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

# 2. Create proper branch
twig switch LS-1234

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
