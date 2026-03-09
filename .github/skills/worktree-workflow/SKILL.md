---
name: worktree-workflow
description: 'Implement a Jira ticket using a git worktree so multiple tickets can be worked in parallel without switching branches; covers setup, directory structure, validation, PR creation, and cleanup. Use whenever starting work on any Jira ticket — worktrees are the default workflow, not an alternative.'
---

# Skill: Implementing Tickets via Git Worktrees

## Overview

Git worktrees let you check out multiple branches simultaneously in separate directories — one directory per ticket. The main repo stays on `main` and is used only for creating new worktrees. Each ticket gets its own folder. All worktrees are available in the multi-root VS Code workspace.

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

## Design Rationale: One Worktree per Branch

This project uses **one worktree per branch** rather than a pool of static, reusable worktrees. Here's why:

**Why one-per-branch wins for async workflows:**

- **Instant context switching** — Multiple tickets sit in-flight simultaneously. Switch by changing directories, not by stashing, checking out, and reinstalling.
- **Full isolation** — No risk of stale build artifacts, cached Nx state, or leftover generated files bleeding between unrelated tickets.
- **Stacked branches are trivial** — Each dependent branch lives in its own tree rooted on its parent. No manual branch juggling.
- **Clean teardown** — `twig worktree clean` removes worktrees whose branches have been merged or deleted.

**Why reusable static worktrees would hurt:**

- Every branch swap requires a full clean: `git checkout`, potentially `pnpm install` (if the lockfile diverged), Nx cache invalidation, `.env` re-copy, and generated file rebuild — most of `make wt-setup` anyway.
- You lose the ability to park 3-4 tickets mid-work and resume any of them instantly.
- Leftover Nx cache from a previous branch can cause subtle build bugs that are hard to diagnose.

**Disk cost is minimal:**

- `make wt-setup` junctions `node_modules` to the main repo when lockfiles match, so worktrees share the ~1.8 GB `node_modules` with zero extra disk.
- pnpm's content-addressable store deduplicates packages globally — multiple worktrees don't multiply download or storage costs.
- The only per-worktree disk cost is the source files themselves (~50 MB), which is negligible.

## Prerequisites

- Main repo is on `main` and up to date
- After creating a worktree, run `make install` inside it to install Node.js and Python dependencies
- Copy `.env` and junction `.twig` into the worktree (see Step 3)

## Complete Workflow

> **🔔 Transition Jira to "In Progress" immediately** — the very first action after being asked
> to work on any ticket is to run:
>
> ```powershell
> acli jira workitem transition --key LS-#### --status "In Progress"
> ```
>
> Do this **before** creating the worktree, installing dependencies, or writing any code. Don't wait.

### Step 0: Check for Parent Dependencies

Before creating the worktree, **inspect the Jira ticket** for linked issues or descriptions that reference another in-progress (unmerged) ticket. This determines which branch the worktree should be based on:

| Situation                                    | Parent               | How                              |
| -------------------------------------------- | -------------------- | -------------------------------- |
| Independent ticket (no dependency)           | `main`               | Use the default path in Step 1   |
| Depends on an unmerged ticket (e.g. LS-XXXX) | That ticket's branch | Use the dependent path in Step 1 |

> **⚠️ Getting this wrong creates sibling branches that will conflict when both merge to main.** Always check before proceeding.

### Step 1: Create the Branch + Worktree

Use `make worktree` — it creates the branch, worktree, registers the parent dependency, and
auto-adds to the VS Code workspace in one atomic command:

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

> **⚠️ CRITICAL**: Do **NOT** use `twig switch LS-#### -p=...` before `twig worktree create`.
> `twig switch` auto-generates a dash-format branch name from the Jira summary (e.g.,
> `LS-490-fix-rollbar-init`), while `twig worktree create` uses your slash-format name
> (`LS-490/fix-rollbar-init`). This creates **two branches per ticket** — the dash-format
> branch becomes an orphan. Use `make worktree` (or `scripts/worktree-create.ps1`)
> which handles both steps correctly.

> If `make worktree` fails, fall back to manual creation:
>
> ```powershell
> twig worktree create LS-####/short-description
> twig branch depend LS-####/short-description main   # or the actual parent branch
> twig worktree list
> ```

### Step 2: Confirm Jira is In Progress

If you haven't already transitioned the ticket (see the note at the top of this section), do it now:

```powershell
acli jira workitem transition --key LS-#### --status "In Progress"
```

### Step 3: Install Dependencies, Copy .env, Link .twig

Git worktrees only contain tracked files — `node_modules`, `.env`, and `.twig` are gitignored and absent.

**Recommended — use the smart setup script** (handles all three in one command):

```powershell
# From the main repo:
$wt = "<path-from-twig-worktree-list>"
make wt-setup WT=$wt
```

The script (`scripts/setup-worktree.ps1`):

- **Compares lockfile hashes** between the worktree and main repo
- **If they match**: creates a Windows **junction** from the worktree's `node_modules` → main repo's `node_modules` (instant, zero extra disk)
- **If they differ**: runs `pnpm install --frozen-lockfile` (creates independent `node_modules`)
- **Copies `.env`** from the main repo (or updates it if stale)
- **Junctions `.twig`** so twig shares branch-dependency state

> **Why junctions save disk**: With 20+ worktrees and ~1.8 GB per `node_modules`, full copies consume **36+ GB**. Junction-based sharing reduces this to near zero for worktrees whose lockfile matches main.

Pass `-Force` to skip the lockfile check and always run a full `pnpm install`:

```powershell
make wt-setup WT=$wt FORCE=-Force
# Or directly:
.\scripts\setup-worktree.ps1 -WorktreePath $wt -Force
```

**Manual alternative** (if the script isn't available):

```powershell
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

> **About the multi-root workspace:**
>
> AI agents can only search files inside VS Code workspace folders. To give
> multiple agents search access to their assigned worktrees from a single
> VS Code window, generate a multi-root workspace file:
>
> ```powershell
> # In the main repo (D:\code\legacy-sports):
>
> # Include ONLY the worktrees your agents are actively using:
> make sync-worktrees TICKETS=501,493,498
>
> # Or include ALL active worktrees (use sparingly — see TS note below):
> make sync-worktrees
>
> code legacy-sports.code-workspace
> ```
>
> This opens **one** VS Code window with the main repo plus selected worktrees.
> Agents' semantic search, file search, and grep tools now cover all included
> folders.
>
> **Incremental updates** — add or remove individual worktrees without regenerating:
>
> ```powershell
> make sync-worktrees-add TICKET=507       # add one worktree
> make sync-worktrees-remove TICKET=493    # remove one worktree
> ```
>
> **Auto-add on create** — `make worktree` creates the worktree AND auto-adds it:
>
> ```powershell
> make worktree TICKET=507 DESC=fix-scoring
> ```
>
> **TypeScript tradeoff:** Each added worktree is a full monorepo copy with
> ~99 `tsconfig.json` files. The TS language server creates projects for each
> one, consuming memory. The generated workspace bumps TS memory to 12 GB and
> disables proactive diagnostics to mitigate this, but **limit to 3-4 worktrees**
> for best performance. If IntelliSense becomes slow, reduce the included set.
>
> **Fallback — per-session file access:**
> If you don't want a multi-root workspace, the agent can still edit worktree files by
> referencing absolute paths. VS Code will prompt: **"Allow reading/editing external
> files?"** — click **Allow** to grant access for the session. However, search/discovery
> tools will only cover the main repo.

### Step 5: Implement the Ticket

> **🚨 ALL edits happen in the worktree — never in `D:\code\legacy-sports`.**
> File edits, terminal commands, and git operations must target `$wt`. Editing files in
> the main repo (even without committing) leaves behind staged or unstaged changes that
> are easy to miss and cannot be pushed to a PR branch.

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

### Step 7b: Apply Pending Migrations 🚨

If you added or modified any migration files under `lib/db-client/migrations/`, apply them now:

```powershell
cd lib/db-client
pnpm run db:up
```

Confirm the output shows `Applied N new migrations`. If it throws, fix the migration SQL before proceeding.

> ⚠️ **Do not skip this step.** A PR with an unapplied migration leaves the local DB out of sync.

### Step 7c: User Testing (Optional)

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

# Remove from the multi-root workspace (if it exists)
make sync-worktrees-remove TICKET=####

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

| Rule                        | Detail                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main stays on main**      | Never check out a feature branch in the main repo — it's the base for new worktrees                                                                                                                                                   |
| **No edits in main**        | Never edit, stage, or commit files in `D:\code\legacy-sports` for ticket work. All file edits must happen inside `$wt`. Staging changes there and "forgetting" them is a common source of phantom diffs that linger until discovered. |
| **One worktree per branch** | Git prevents two worktrees sharing the same branch                                                                                                                                                                                    |
| **Don't run from inside**   | `git worktree move/remove` must be run from outside the target worktree                                                                                                                                                               |
| **Run make install**        | `node_modules` and Python deps are absent in a fresh worktree — always run `make install` inside it                                                                                                                                   |
| **Separate VS Code window** | Open each worktree in its own VS Code window for clean file watching                                                                                                                                                                  |
| **Multi-root for agents**   | Run `make sync-worktrees TICKETS=501,493` then open `legacy-sports.code-workspace` — limit to 3-4 worktrees for TS performance                                                                                                        |

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

`node_modules` is gitignored so it is never present in a fresh worktree. Use the smart setup script, which junctions to main when possible:

```powershell
# From the main repo (recommended — handles .env and .twig too):
make wt-setup WT=$wt

# Or install independently inside the worktree:
cd $wt   # path from twig worktree list
make install
```

## Maintenance & Cleanup Cadence

Worktrees accumulate over time. Periodic cleanup keeps the workspace lean and prevents confusion from stale branches.

### After Every PR Merge

```powershell
cd "D:\code\legacy-sports"
make sync-worktrees-remove TICKET=####   # remove from VS Code workspace
twig worktree clean                     # removes worktrees with merged/deleted branches
git branch -d "LS-####/description"     # delete the local branch
```

### Weekly Housekeeping

Run this periodically (e.g., start of week) to catch any missed cleanups:

```powershell
cd "D:\code\legacy-sports"

# List all active worktrees — review for any that are done
twig worktree list

# Clean up merged/deleted branch worktrees
twig worktree clean

# Prune remote-tracking branches that no longer exist
git fetch --prune

# Check disk usage of the worktrees directory
Get-ChildItem "D:\code\legacy-sports-worktrees" -Directory |
  ForEach-Object { $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB; [PSCustomObject]@{ Name = $_.Name; SizeMB = [math]::Round($size, 1) } } |
  Sort-Object SizeMB -Descending | Format-Table -AutoSize
```

### Signs You Should Clean Up

- `twig worktree list` shows worktrees for tickets that are already "Done" in Jira
- `git branch` shows branches with no corresponding open PR
- VS Code workspace has more than 3-4 worktrees (TypeScript performance degrades — see Step 4)
- Disk usage on the worktrees directory exceeds expectations

## Quick Reference

```powershell
# 0. Check Jira ticket for dependencies on unmerged branches
#    If dependent: pass PARENT=LS-XXXX/branch-name in step 1

# 1. Create branch + worktree + register parent (one command)
cd "D:\code\legacy-sports"
make worktree TICKET=#### DESC=description                           # independent (parent=main)
make worktree TICKET=#### DESC=description PARENT=LS-XXXX/branch     # dependent

# 2. Jira
acli jira workitem transition --key LS-#### --status "In Progress"

# 3. Smart setup (node_modules + .env + .twig in one command)
$wt = "<path-from-twig-worktree-list>"
make wt-setup WT=$wt
# Or manually:
#   cd $wt ; make install ; Copy-Item "D:\code\legacy-sports\.env" .env ; cmd /c mklink /J ".twig" "D:\code\legacy-sports\.twig"

# 4. Open VS Code
code $wt

# 4b. Workspace is auto-added by make worktree — no extra step needed

# 5. Work, commit (from inside the worktree)
git add . ; git commit -m "feat(scope): description (LS-####)" ; git push -u origin HEAD

# 6. Pre-PR validation
make pc

# 6b. Apply pending migrations (if any migration files were added)
cd lib/db-client ; pnpm run db:up   # confirm "Applied N new migrations"
cd $wt

# 7. PR + Jira (see create-pr skill for full template)
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main
acli jira workitem transition --key LS-#### --status "In Review"

# 7. Cleanup after merge
cd "D:\code\legacy-sports"
make sync-worktrees-remove TICKET=####   # remove from workspace (if exists)
twig worktree clean
git branch -d "LS-####/description"
twig worktree list
```
