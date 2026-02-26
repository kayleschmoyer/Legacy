---
name: worktree-workflow
description: 'Implement a Jira ticket using a git worktree so multiple tickets can be worked in parallel without switching branches; covers setup, directory structure, VS Code window, validation, PR creation, and cleanup. Use whenever the user says "worktree" or wants to work on a ticket in isolation.'
---

# Skill: Implementing Tickets via Git Worktrees

## Overview

Git worktrees let you check out multiple branches simultaneously in separate directories — one directory per ticket. The main repo stays on `main` and is used only for creating new worktrees. Each ticket gets its own folder and its own VS Code window.

## Worktree Directory Structure

```
D:\code\
├── legacy-sports\                  ← main repo, always on main
└── legacy-sports-worktrees\
    ├── LS-221\                     ← worktree for LS-221
    ├── LS-222\                     ← worktree for LS-222
    └── LS-219\                     ← worktree for LS-219
```

**Why this layout:**

- Other repos in `D:\code\` are unaffected by worktree file-watching
- Easy cleanup: delete the folder, then `git worktree prune`
- `node_modules` and `.env` are gitignored and **not** present in a fresh worktree — see Prerequisites

## When to Use

- Starting a new ticket while another is already in progress
- Working on multiple tickets in parallel without stashing
- Wanting full isolation between ticket branches
- User explicitly asks to use a worktree

## Prerequisites

- Main repo is on `main` and up to date
- `D:\code\legacy-sports-worktrees\` directory exists (create it if not)
- After creating a worktree, run `make install` inside it to install Node.js and Python dependencies
- Copy `.env` and junction `.twig` into the worktree (see Step 4)

## Complete Workflow

### Step 1: Create the Feature Branch

Try twig first (it also updates Jira):

```powershell
cd "D:\code\legacy-sports"
twig switch LS-#### -p=main
```

If twig fails to find the Jira issue, create the branch manually:

```powershell
git checkout main
git pull
git checkout -b "LS-####/short-description"
git checkout main   # return to main before creating worktree
```

### Step 2: Create the Worktree

```powershell
# Ensure the worktrees directory exists
New-Item -ItemType Directory -Path "D:\code\legacy-sports-worktrees" -Force

# Create the worktree
git worktree add "D:\code\legacy-sports-worktrees\LS-####" "LS-####/short-description"

# Verify
git worktree list
```

### Step 3: Transition Jira to In Progress

```powershell
acli jira workitem transition --key LS-#### --status "In Progress"
```

### Step 4: Install Dependencies, Copy .env, Link .twig

Git worktrees only contain tracked files — `node_modules`, `.env`, and `.twig` are gitignored and absent.

```powershell
cd "D:\code\legacy-sports-worktrees\LS-####"

# Install all dependencies (pnpm + poetry) using the standard Makefile target
make install

# Copy .env from main repo
Copy-Item "D:\code\legacy-sports\.env" "D:\code\legacy-sports-worktrees\LS-####\.env"

# Junction .twig so twig shares branch dependency state with the main repo
# (junction = no admin required; symlink would require admin on Windows)
cmd /c mklink /J "D:\code\legacy-sports-worktrees\LS-####\.twig" "D:\code\legacy-sports\.twig"
```

> **Why junction not copy?** `.twig/state.json` tracks branch dependencies. Both the main repo and worktree must read/write the same file or twig commands (`twig tree`, `twig branch depend`, etc.) will diverge.

### Step 5: Open in VS Code

```powershell
code "D:\code\legacy-sports-worktrees\LS-####"
```

This opens the worktree in a **new VS Code window**. Work exclusively in that window for this ticket.

### Step 6: Implement the Ticket

All commands run from within the worktree directory:

```powershell
cd "D:\code\legacy-sports-worktrees\LS-####"

# Use Nx as normal — affects are scoped to this branch's changes
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
pnpm exec nx affected -t build
```

### Step 7: Commit and Push

```powershell
cd "D:\code\legacy-sports-worktrees\LS-####"
git add .
git commit -m "feat(scope): description (LS-####)"
git push -u origin HEAD
```

### Step 8: Create Pull Request

```powershell
gh pr create --title "type(scope): description" --body "..." --base main
```

### Step 9: Update Jira to In Review

```powershell
acli jira workitem transition --key LS-#### --status "In Review"
```

### Step 10: Cleanup After Merge

```powershell
cd "D:\code\legacy-sports"

# Remove the worktree and its directory
git worktree remove "D:\code\legacy-sports-worktrees\LS-####"

# Delete the branch locally
git branch -d "LS-####/short-description"

# Prune stale metadata
git worktree prune

# Verify
git worktree list
```

## Moving an Existing Worktree

If a worktree was created at the wrong path, use `git worktree move` (not `mv`). You **must not** be inside the worktree directory when running this:

```powershell
cd "D:\code\legacy-sports"   # must be in another worktree or main repo
git worktree move "D:\code\old-path" "D:\code\legacy-sports-worktrees\LS-####"
git worktree list  # verify
```

## Key Rules

| Rule                        | Detail                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| **Main stays on main**      | Never check out a feature branch in the main repo — it's the base for new worktrees                 |
| **One worktree per branch** | Git prevents two worktrees sharing the same branch                                                  |
| **Don't run from inside**   | `git worktree move/remove` must be run from outside the target worktree                             |
| **Run make install**        | `node_modules` and Python deps are absent in a fresh worktree — always run `make install` inside it |
| **Separate VS Code window** | Open each worktree in its own VS Code window for clean file watching                                |

## Troubleshooting

### twig tree / twig branch commands don't work in worktree

`.twig/state.json` is gitignored and absent. Create a junction pointing to the main repo's `.twig`:

```powershell
cmd /c mklink /J "D:\code\legacy-sports-worktrees\LS-####\.twig" "D:\code\legacy-sports\.twig"
```

Verify it worked:

```powershell
cd "D:\code\legacy-sports-worktrees\LS-####"
twig tree
```

### Permission denied on `git worktree move`

You're inside the worktree being moved. `cd` to the main repo first:

```powershell
cd "D:\code\legacy-sports"
git worktree move ...
```

### Worktree list shows stale entries

```powershell
git worktree prune
git worktree list
```

### Twig fails with "Issue not found"

Twig couldn't fetch the Jira issue. Create the branch manually and transition Jira separately:

```powershell
git checkout -b "LS-####/description"
git checkout main
acli jira workitem transition --key LS-#### --status "In Progress"
```

### node_modules missing in worktree

`node_modules` is gitignored so it is never present in a fresh worktree. Install all deps using the standard Makefile target:

```powershell
cd "D:\code\legacy-sports-worktrees\LS-####"
make install
```

## Quick Reference

```powershell
# 1. Create branch + worktree
cd "D:\code\legacy-sports"
git checkout -b "LS-####/description"
git checkout main
git worktree add "D:\code\legacy-sports-worktrees\LS-####" "LS-####/description"

# 2. Jira
acli jira workitem transition --key LS-#### --status "In Progress"

# 3. Install deps + copy .env + link .twig
cd "D:\code\legacy-sports-worktrees\LS-####"
make install
Copy-Item "D:\code\legacy-sports\.env" .env
cmd /c mklink /J ".twig" "D:\code\legacy-sports\.twig"

# 4. Open VS Code
code "D:\code\legacy-sports-worktrees\LS-####"

# 5. Work, validate, commit (from inside the worktree)
cd "D:\code\legacy-sports-worktrees\LS-####"
pnpm exec nx affected -t typecheck ; pnpm exec nx affected -t lint --fix ; pnpm exec nx affected -t test ; pnpm exec nx affected -t build
git add . ; git commit -m "feat(scope): description (LS-####)" ; git push -u origin HEAD

# 5. PR + Jira
gh pr create --title "type(scope): description" --body "..." --base main
acli jira workitem transition --key LS-#### --status "In Review"

# 6. Cleanup after merge
cd "D:\code\legacy-sports"
git worktree remove "D:\code\legacy-sports-worktrees\LS-####"
git branch -d "LS-####/description"
git worktree prune
```
