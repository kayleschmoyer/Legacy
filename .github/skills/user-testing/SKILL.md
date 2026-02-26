---
name: user-testing
description: 'Optionally check out a feature branch in the main repo to test UI changes live against running dev servers before opening a PR; covers checkout, testing, and returning to main. Use when the user wants to verify UI/UX changes visually before review.'
---

# Skill: Optional User Testing Before PR

## Overview

Dev servers (`dev:web`, `dev:db-lambda`) run from the **main repo** (`D:\code\legacy-sports`).
To test a feature branch's UI changes live, temporarily check it out in the main repo,
run your manual tests, then return to `main`.

This step is **optional** and sits between pre-PR validation (`make pc`) and PR creation.
It is only needed when you want live visual verification — not for every ticket.

## When to Use

- Feature branches with UI changes (new pages, components, forms)
- Bug fixes where you want to visually confirm the fix
- Anything where automated tests are insufficient to verify correctness
- When a teammate or stakeholder wants to see changes before PR review

## Prerequisites

- The worktree branch has been committed and pushed (`git push -u origin HEAD`)
- `make pc` has passed (no type errors, lint errors, or test failures)
- Dev servers are running (or you are ready to start them)

## Workflow

### Step 1: Confirm the Branch Is Pushed

From the worktree:

```powershell
cd $wt   # path from twig worktree list
git status        # should be clean
git log --oneline -3   # confirm your commits are there
git push -u origin HEAD   # push if not already pushed
```

### Step 2: Check Out the Branch in the Main Repo

> **Important**: the main repo will be temporarily on a feature branch.
> Do NOT commit from the main repo while testing — all commits must come from the worktree.

```powershell
cd "D:\code\legacy-sports"

# Stash any accidental changes (should be none)
git stash

# Check out the feature branch
git fetch origin
git checkout LS-####/branch-name
```

### Step 3: Restart Dev Servers

The dev servers need to pick up the new code:

```powershell
# Restart web server (if running)
# Stop the existing process (Ctrl+C in the Web Server terminal), then:
pnpm exec nx run web:dev

# Restart API lambda (if running)
# Stop the existing process, then:
pnpm exec nx run db:serve
```

### Step 4: Test

Open the app in your browser and manually verify:

- [ ] New features work as expected
- [ ] Existing features are not broken
- [ ] UI looks correct on expected screen sizes
- [ ] Any edge cases you are worried about

### Step 5: Return Main Repo to Main

When testing is done (pass or fail):

```powershell
cd "D:\code\legacy-sports"
git stash pop   # restore any stashed changes (usually none)
git checkout main
```

Verify:

```powershell
git branch   # should show: * main
```

### Step 6: Act on Test Results

**If testing passed** — proceed to PR creation from the worktree:

```powershell
cd $wt
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main
acli jira workitem transition --key LS-#### --status "In Review"
```

**If testing found issues** — fix them in the worktree, push, and repeat:

```powershell
cd $wt
# ... fix issues ...
git add .
git commit -m "fix(scope): address user testing feedback (LS-####)"
git push origin HEAD

# Re-run validation
make pc

# Then repeat Steps 2-5 to re-test
```

## Key Rules

| Rule                                      | Detail                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Never commit from main during testing** | The main repo is on the feature branch only for testing — all commits must go through the worktree |
| **Always return to main**                 | Run `git checkout main` in the main repo when testing is done, whether it passed or failed         |
| **Push before testing**                   | Always push the worktree branch before checking it out in main so you are testing the same code    |
| **Don't start new tickets**               | While main is on a feature branch, don't create new worktrees — return to main first               |

## Quick Reference

```powershell
# 1. Push from worktree
cd $wt ; git push -u origin HEAD

# 2. Check out in main repo for testing
cd "D:\code\legacy-sports"
git checkout LS-####/branch-name

# 3. Restart servers, test manually

# 4. Return to main when done
cd "D:\code\legacy-sports"
git checkout main

# 5a. Tests passed — open PR from worktree
cd $wt
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main
acli jira workitem transition --key LS-#### --status "In Review"

# 5b. Tests failed — fix in worktree, push, repeat
```
