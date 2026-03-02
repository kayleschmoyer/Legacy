---
name: worktree-workflow
description: 'Implement a Jira ticket using a git worktree so multiple tickets can be worked in parallel without switching branches; covers setup, directory structure, VS Code window, validation, PR creation, and cleanup. Use whenever starting work on any Jira ticket — worktrees are the default workflow, not an alternative.'
---

# Skill: Implementing Tickets via Git Worktrees

## Overview

Git worktrees let you check out multiple branches simultaneously in separate directories — one directory per ticket. The main repo stays on `main` and is used only for creating new worktrees. Each ticket gets its own folder and its own VS Code window.

## Worktree Directory Structure

```
D:\code\
├── legacy-sports\                  ← main repo, always on main
└── LS-####\                        ← worktree created by twig (sibling of repo)
    └── short-description\          ← or flat LS-####, depending on branch name
```

`twig worktree create <branch>` places the worktree in the **repository's parent directory** (`D:\code\`), in a folder derived from the branch name. Run `twig worktree list` after creation to confirm the exact path — use that path for all subsequent steps.

> Worktrees created manually (or before twig worktree commands were available) may live at `D:\code\legacy-sports-worktrees\LS-####\`. That path is still valid; twig tracks worktrees by path, not by convention.

## When to Use

- **Starting work on any Jira ticket** (this is the default workflow)
- Working on multiple tickets in parallel without stashing
- Wanting full isolation between ticket branches

> **In-place branching (without a worktree) is only allowed when the user explicitly
> requests it** (e.g., "no worktree" or "in-place"). If the user does not specify,
> always default to a worktree.

## Prerequisites

- Main repo is on `main` and up to date
- After creating a worktree, run `make install` inside it to install Node.js and Python dependencies
- Copy `.env` and junction `.twig` into the worktree (see Step 3)

## Complete Workflow

### Step 0: Check for Parent Dependencies

Before creating the worktree, **inspect the Jira ticket** for linked issues or descriptions that reference another in-progress (unmerged) ticket. This determines which branch the worktree should be based on:

| Situation                                    | Parent               | How                              |
| -------------------------------------------- | -------------------- | -------------------------------- |
| Independent ticket (no dependency)           | `main`               | Use the default path in Step 1   |
| Depends on an unmerged ticket (e.g. LS-XXXX) | That ticket's branch | Use the dependent path in Step 1 |

> **⚠️ Getting this wrong creates sibling branches that will conflict when both merge to main.** Always check before proceeding.

### Step 1: Create the Branch + Worktree

**Independent ticket (parent = main):**

From the main repo, use `twig worktree create` — it creates the branch if it doesn't exist and creates the worktree in one command:

```powershell
cd "D:\code\legacy-sports"
twig worktree create LS-####/short-description

# Register the branch as a child of main in twig's tree
# (twig worktree create does NOT do this automatically)
twig branch depend LS-####/short-description main

# Verify — note the path twig chose
twig worktree list
```

**Dependent ticket (parent = another in-progress branch):**

Create the branch from the parent first so twig tracks the dependency, then create the worktree:

```powershell
cd "D:\code\legacy-sports"
git checkout LS-XXXX/parent-branch-name
twig switch LS-#### -p=current
git checkout main
twig worktree create LS-####/short-description

# Register the branch under the correct parent (NOT main)
twig branch depend LS-####/short-description LS-XXXX/parent-branch-name

# Verify — branch must appear under the parent, not under main
twig tree
twig worktree list
```

The worktree is placed in the repository's parent directory (`D:\code\`) in a folder derived from the branch name. Use `twig worktree list` to confirm the exact path before proceeding.

> If `twig worktree create` fails, fall back to manual creation:
>
> ```powershell
> git checkout main ; git pull
> git checkout -b "LS-####/short-description"
> git checkout main
> New-Item -ItemType Directory -Path "D:\code\legacy-sports-worktrees" -Force
> git worktree add "D:\code\legacy-sports-worktrees\LS-####" "LS-####/short-description"
> git worktree list
> ```

### Step 2: Transition Jira to In Progress

```powershell
acli jira workitem transition --key LS-#### --status "In Progress"
```

### Step 3: Install Dependencies, Copy .env, Link .twig

Git worktrees only contain tracked files — `node_modules`, `.env`, and `.twig` are gitignored and absent.

```powershell
# Use the path reported by `twig worktree list`
$wt = (twig worktree list --porcelain 2>$null | Select-String "path:" | Where-Object { $_ -match "LS-####" } | ForEach-Object { ($_ -split "path: ")[1].Trim() })
# OR just set it manually:
$wt = "<path-from-twig-worktree-list>"

cd $wt

# Install all dependencies (pnpm + poetry) using the standard Makefile target
make install

# Copy .env from main repo
Copy-Item "D:\code\legacy-sports\.env" "$wt\.env"

# Junction .twig so twig shares branch dependency state with the main repo
# (junction = no admin required; symlink would require admin on Windows)
cmd /c mklink /J "$wt\.twig" "D:\code\legacy-sports\.twig"
```

> **Why junction not copy?** `.twig/state.json` tracks branch dependencies. Both the main repo and worktree must read/write the same file or twig commands (`twig tree`, `twig branch depend`, etc.) will diverge.

### Step 4: Open in VS Code

```powershell
code $wt
```

This opens the worktree in a **new VS Code window**. Work exclusively in that window for this ticket.

> **Alternative — work from the main repo window (agent access):**
> If you want an agent running in the main VS Code window to edit files in the worktree,
> you do **not** need a separate window. Just reference the worktree path directly.
> VS Code will show a prompt: **"Allow reading/editing external files? … Allow this folder in this session"**.
> Click **Allow** and the agent has full read/write access to the worktree for the rest of the session.
>
> Agents should start by telling the user:
> _"I need access to `<worktree path>` — please click Allow when VS Code prompts you."_
> Then immediately attempt to read a file in that path to trigger the prompt.

### Step 5: Implement the Ticket

All commands run from within the worktree directory (`cd $wt`). Write code, add tests, update docs.

### Step 6: Commit and Push

```powershell
cd $wt
git add .
git commit -m "feat(scope): description (LS-####)"
git push -u origin HEAD
```

### Step 7: Pre-PR Validation

Run the full validation suite before opening the PR. Fix any failures and push again before continuing.

```powershell
make pc
```

### Step 7b: User Testing (Optional)

If you want to test the UI live against running dev servers before opening a PR,
see the [user-testing skill](../user-testing/SKILL.md). This checks the branch out in the
main repo where dev servers run, lets you verify visually, then returns main to `main`.

### Step 8: Create Pull Request

See the [create-pr skill](../create-pr/SKILL.md) for the full PR template workflow. For a quick PR:

```powershell
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main
```

### Step 9: Update Jira to In Review

```powershell
acli jira workitem transition --key LS-#### --status "In Review"
```

### Step 10: Cleanup After Merge

```powershell
cd "D:\code\legacy-sports"

# Remove worktrees whose branches have been merged or deleted
twig worktree clean

# Delete the branch locally
git branch -d "LS-####/short-description"

# Verify
twig worktree list
```

`twig worktree clean` detects worktrees with merged/deleted branches and prompts to remove them. It is safer than `git worktree remove` because it will not remove a worktree that still has an active branch.

## Moving an Existing Worktree

If a worktree was created at the wrong path, use `git worktree move` (not `mv`). You **must not** be inside the worktree directory when running this:

```powershell
cd "D:\code\legacy-sports"   # must be in another worktree or main repo
git worktree move "D:\code\old-path" "D:\code\new-path"
twig worktree list  # verify
```

## Key Rules

| Rule                          | Detail                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Main stays on main**        | Never check out a feature branch in the main repo — it's the base for new worktrees                    |
| **One worktree per branch**   | Git prevents two worktrees sharing the same branch                                                     |
| **Don't run from inside**     | `git worktree move/remove` must be run from outside the target worktree                                |
| **Run make install**          | `node_modules` and Python deps are absent in a fresh worktree — always run `make install` inside it    |
| **Separate VS Code window**   | Open each worktree in its own VS Code window for clean file watching                                   |
| **Agent cross-window access** | Agent in main window can edit worktree files — VS Code will prompt "Allow this folder in this session" |

## Troubleshooting

### twig tree / twig branch commands don't work in worktree

`.twig/state.json` is gitignored and absent. Create a junction pointing to the main repo's `.twig` (substitute `$wt` with the worktree path from `twig worktree list`):

```powershell
cmd /c mklink /J "$wt\.twig" "D:\code\legacy-sports\.twig"
```

Verify it worked:

```powershell
cd $wt
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
twig worktree clean
twig worktree list
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
cd $wt   # path from twig worktree list
make install
```

## Quick Reference

```powershell
# 0. Check Jira ticket for dependencies on unmerged branches
#    If dependent: use the dependent-ticket path in Step 1 of the full workflow

# 1. Create branch + worktree (independent ticket — parent = main)
cd "D:\code\legacy-sports"
twig worktree create LS-####/description
twig branch depend LS-####/description main  # register parentage — use actual parent branch if dependent
twig worktree list   # note the path twig chose

# 2. Jira
acli jira workitem transition --key LS-#### --status "In Progress"

# 3. Install deps + copy .env + link .twig  (use path from twig worktree list)
$wt = "<path-from-twig-worktree-list>"
cd $wt
make install
Copy-Item "D:\code\legacy-sports\.env" .env
cmd /c mklink /J ".twig" "D:\code\legacy-sports\.twig"

# 4. Open VS Code
code $wt

# 5. Work, commit (from inside the worktree)
git add . ; git commit -m "feat(scope): description (LS-####)" ; git push -u origin HEAD

# 6. Pre-PR validation
make pc

# 7. PR + Jira (see create-pr skill for full template)
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main
acli jira workitem transition --key LS-#### --status "In Review"

# 7. Cleanup after merge
cd "D:\code\legacy-sports"
twig worktree clean
git branch -d "LS-####/description"
twig worktree list
```
