---
name: rebase-conflicts
description: 'Guide Copilot through rebasing a branch onto main (or another base) and resolving all merge conflicts step-by-step; covers simple rebases, large multi-conflict rebases, generated-file conflicts, migration conflicts, interactive rebases, and recovery from failed rebases. Use when a developer says "rebase", "merge conflicts", "branch is behind", or "update my branch".'
---

# Skill: Rebase & Conflict Resolution

## Overview

Rebasing replays your branch's commits on top of another branch (usually `main`). When the same files were changed in both branches, Git pauses with **merge conflicts** that must be resolved before continuing. This skill walks through the entire process — from simple one-conflict rebases to massive multi-file conflict storms — and teaches Copilot how to resolve them automatically or guide the developer through manual resolution.

## When to Use

- Developer says "rebase", "update my branch", or "my branch is behind main"
- PR shows merge conflicts with the target branch
- `git rebase main` produces conflicts
- `twig rebase` or `twig cascade` hits conflicts
- Developer is stuck mid-rebase and doesn't know how to continue
- Branch tree (`twig tree`) shows stale or diverged branches

## Prerequisites

- Working directory is clean (`git status` shows no uncommitted changes)
- If dirty: stash first with `git stash` (or `git stash --include-untracked`)
- Remote is up to date: `git fetch origin`

---

## Quick Reference

| Situation                                | Command                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Simple rebase onto main                  | `git fetch origin ; git rebase origin/main`                                                                                |
| Rebase entire branch tree                | `make rebase-tree`                                                                                                         |
| Auto-rebase tree (no prompts)            | `make rebase-tree-auto`                                                                                                    |
| Rebase tree skipping commits             | `make rebase-tree-skip SKIP_COMMITS=hash1,hash2`                                                                           |
| See conflicted files                     | `git diff --name-only --diff-filter=U`                                                                                     |
| Accept **your** version of a file        | `git checkout --ours <file>`                                                                                               |
| Accept **incoming** version of a file    | `git checkout --theirs <file>`                                                                                             |
| Mark file as resolved after editing      | `git add <file>`                                                                                                           |
| Continue rebase after resolving          | `git rebase --continue`                                                                                                    |
| Continue rebase (no editor / agent-safe) | `$env:GIT_EDITOR = "true" ; $env:GIT_SEQUENCE_EDITOR = "true" ; git rebase --continue`                                     |
| Skip current commit entirely             | `git rebase --skip`                                                                                                        |
| Abort and return to pre-rebase state     | `git rebase --abort`                                                                                                       |
| Resolve generated file conflicts         | `.\scripts\resolve-generated-conflicts.ps1`                                                                                |
| Skip duplicate migration commits         | `.\scripts\skip-migration-conflict.ps1`                                                                                    |
| **Rebase a PR worktree (automated)**     | `.\scripts\rebase-pr.ps1 -Branch LS-1234/feature` (fetch + twig rebase + post-rebase stabilization)                        |
| **Stabilize before push (CRITICAL)**     | `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen --base=origin/main`                    |
| **Validate before push**                 | `make pc`                                                                                                                  |
| **Fix CI formatting failure**            | `pnpm exec nx format:write ; git add -A ; git commit -m "style: fix formatting" ; git push --force-with-lease origin HEAD` |

---

## ⚠️ Avoid Editor Blocking (Agent / CI Use)

When Git needs to open a text editor during rebase (e.g. to edit a commit message on `--continue`), it will **block indefinitely** in non-interactive environments. Always set these env vars before any rebase operation in automated or agent-driven workflows:

```powershell
$env:GIT_EDITOR = "true"
$env:GIT_SEQUENCE_EDITOR = "true"
```

This makes Git accept the default commit message without opening an editor. The `scripts/rebase-branch-tree.ps1` script already does this automatically.

---

## Step-by-Step: Simple Rebase

### Step 1: Ensure Clean Working Directory

```powershell
git status
# If dirty:
git stash --include-untracked
```

### Step 2: Fetch Latest and Start Rebase

```powershell
git fetch origin
git rebase origin/main
```

If it says "Already up to date" — you're done.

### Step 3: If Conflicts Occur — Identify Them

```powershell
# List all conflicted files
git diff --name-only --diff-filter=U
```

### Step 4: Resolve Each Conflict

Open each conflicted file. Git inserts conflict markers:

```
<<<<<<< HEAD
// Code from the base branch (main)
const MAX_TEAMS = 12;
=======
// Your code from the feature branch
const MAX_TEAMS = 16;
>>>>>>> your-commit-message
```

**Resolution strategies** (pick ONE per conflict):

> **Priority order**: (1) Regenerate if generated file or lock file, (2) Manual merge for source files, (3) Accept yours/theirs only if one side is obviously wrong. See the full [Decision Framework](#copilot-decision-framework) below for the 9-tier priority.

1. **Keep yours** — your branch's version is correct:

   ```powershell
   git checkout --ours <file>
   ```

2. **Keep theirs** — main's version is correct:

   ```powershell
   git checkout --theirs <file>
   ```

3. **Manual merge** — combine both changes:
   Edit the file to remove all `<<<<<<<`, `=======`, and `>>>>>>>` markers then write the correct merged code.

4. **Regenerate** — for generated files (see below):
   ```powershell
   .\scripts\resolve-generated-conflicts.ps1
   ```

### Step 5: Stage Resolved Files and Continue

```powershell
git add <resolved-file>
# After ALL conflicts in this commit are resolved:
# Use GIT_EDITOR=true to prevent Git from blocking on a commit-message editor
$env:GIT_EDITOR = "true" ; $env:GIT_SEQUENCE_EDITOR = "true" ; git rebase --continue
```

If more commits have conflicts, Git will pause again. Repeat Steps 3–5 for each commit.

### Step 6: Unstash (if you stashed in Step 1)

```powershell
git stash pop
```

### Step 7: Post-Rebase Stabilization (BEFORE push)

> 🚨 **Do NOT push until this step passes.** Pushing before validating is the #1 cause of post-rebase CI failures.

After the rebase completes, the working tree may be out of sync: main may have introduced new dependencies, changed the schema, or reformatted files. Run these steps **before** pushing:

```powershell
# 7a. Install dependencies (main may have added/updated packages)
make install
# If the lockfile itself was regenerated during conflict resolution, use:
# make install-force

# 7b. Regenerate codegen (schema or GraphQL types may have changed on main)
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main

# 7c. Run full pre-commit validation
make pc
```

If `make pc` fails:

- **Formatting**: `nx format:write` rewrote files → commit them and re-run `make pc`
- **Type errors**: the rebase resolution missed a rename or signature change → fix, commit, re-run
- **Lint errors**: new rules on main or unresolved conflicts → fix, commit, re-run
- **Test failures**: merged code broke a test → fix, commit, re-run

```powershell
# Fix whatever make pc found, then:
git add -A
git commit -m "fix: post-rebase stabilization"
make pc   # re-run until clean
```

### Step 8: Force-Push the Validated Branch

Only push **after `make pc` passes**:

```powershell
# Guard: never force-push main
$branch = git branch --show-current
if ($branch -eq 'main') { Write-Error "ABORT: Cannot force-push main. Use git revert instead."; exit 1 }

git push --force-with-lease origin HEAD
```

> **Always use `--force-with-lease`** instead of `--force`. It prevents overwriting someone else's commits if they pushed to the same branch.
> The branch guard above is a safety net — if you somehow end up on `main` after
> a botched checkout, the script stops before rewriting public history.

If `make pc` fails with a formatting error:

```powershell
# Fix formatting
pnpm exec nx format:write

# Check what changed
git status

# Commit and push
git add -A
git commit -m "style: fix Prettier formatting after rebase"
git push --force-with-lease origin HEAD
```

If `make pc` fails with lint or type errors, see the [fix-lint](../fix-lint/SKILL.md) and [fix-types](../fix-types/SKILL.md) skills.

---

## Bulk Rebase: Find All Conflicting Open PRs

When asked to "rebase all conflicting PRs" or "fix all merge conflicts", use `--limit 200` to avoid missing PRs. This repo can have 100+ open PRs; the default limit of 30 silently misses most of them.

```powershell
# Always use --limit 200 to avoid pagination gaps
$raw = gh pr list --author "@me" --state open --limit 200 --json number,headRefName,mergeable,mergeStateStatus
$conflicting = ($raw | ConvertFrom-Json) | Where-Object { $_.mergeable -eq "CONFLICTING" }
$conflicting | Select-Object number, headRefName
Write-Host "Total conflicting: $($conflicting.Count) of $(($raw | ConvertFrom-Json).Count) open PRs"
```

> **Never use the default `gh pr list` without `--limit 200`** — it caps at 30 and will silently miss the majority of open PRs.

---

> 📎 **Conflict resolution strategies** (automated tree rebase, Copilot-assisted resolution, special conflict types — generated files, migrations, pnpm-lock, schema): see [references/rebase-conflict-strategies.md](references/rebase-conflict-strategies.md)

> 📎 **Interactive rebase & recovery** (squash/fixup/reword/drop/edit, stuck mid-rebase diagnosis and recovery): see [references/rebase-interactive-and-recovery.md](references/rebase-interactive-and-recovery.md)

---

## Rebase in Worktrees

When working in a worktree (see [worktree-workflow skill](../worktree-workflow/SKILL.md)):

```powershell
# Fetch and rebase (use -C to target the worktree without cd)
git -C $wt fetch origin
git -C $wt rebase origin/main

# Resolve conflicts (same process as above)

# Stabilize before pushing (CRITICAL — prevents CI failures)
make -C $wt install
pnpm --prefix $wt exec nx run db:print-schema
pnpm --prefix $wt exec nx affected -t codegen --base=origin/main
make -C $wt pc

# Only push AFTER make pc passes
git -C $wt push --force-with-lease origin HEAD
```

> **Important**: Never rebase from the main repo directory if the branch is checked out in a worktree. Use `git -C $wt` to target the worktree directly.

---

## Branch Tree Rebase (Stacked Branches)

When you have dependent branches (child branches based on parent branches), rebasing requires cascading changes through the tree.

### View the Tree First

```powershell
twig tree
```

### Rebase the Entire Tree

```powershell
# Interactive (recommended for first time)
make rebase-tree

# Auto-resolve everything possible
make rebase-tree-auto

# Skip specific known-duplicate commits
make rebase-tree-skip SKIP_COMMITS=abc1234,def5678

# Or use a skip-commits file
make rebase-tree-skip SKIP_COMMITS_FILE=skip-commits.txt
```

### Manual Cascade

If the automated scripts fail, cascade manually:

```powershell
# 1. Rebase parent onto main
git checkout LS-100/parent-branch
git fetch origin
git rebase origin/main
# (resolve conflicts, continue)
git push --force-with-lease origin HEAD

# 2. Rebase child onto updated parent
git checkout LS-101/child-branch
git rebase LS-100/parent-branch
# (resolve conflicts, continue)
git push --force-with-lease origin HEAD

# 3. Continue for each level of the tree
```

---

## Copilot Decision Framework

When Copilot is resolving conflicts autonomously, follow this priority order:

1. **Generated files** → Always regenerate, never manually merge
2. **Lock files** → Regenerate (`pnpm install`)
3. **Migration files (duplicate)** → Skip (`git rebase --skip`)
4. **Migration files (real conflict)** → Ask the developer
5. **Config/JSON files** → Accept theirs, reapply feature branch changes
6. **Source files (additive changes)** → Keep both sides' additions
7. **Source files (contradictory changes)** → Read both sides, infer intent, resolve; if ambiguous, ask the developer
8. **Test files** → Resolve to match the resolved source code
9. **Documentation** → Accept theirs for auto-generated docs; merge manually for hand-written docs

### After All Conflicts Resolved

> 🚨 **Do NOT push until `make pc` passes.** Pushing before validating is the #1 cause of post-rebase CI failures.

First, stabilize the workspace (main may have changed deps, schema, or formatting):

```powershell
# Install deps (main may have added/updated packages)
make install

# Regenerate schema + codegen (may have changed on main)
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main
```

Then run full validation:

```powershell
make pc
```

If validation fails, fix the issues, commit, and re-run `make pc` until clean:

```powershell
git add -A
git commit -m "fix: post-rebase stabilization"
make pc
```

Only **after `make pc` passes**, push:

```powershell
git push --force-with-lease origin HEAD
```

---

## Troubleshooting

### "Cannot rebase: You have unstaged changes"

```powershell
git stash --include-untracked
git rebase origin/main
# after rebase:
git stash pop
```

### "CONFLICT (modify/delete)" — file deleted on one side

```powershell
# If the delete is correct (feature removed the file):
git rm <file>

# If the file should still exist:
git checkout --ours <file>    # keep your version
git add <file>
```

### Rebase produces empty commits

```powershell
# Git will warn "No changes — did you mean to skip?"
git rebase --skip
```

### "fatal: It seems that there is already a rebase-merge directory"

```powershell
# Clean up stale rebase state
git rebase --abort
# Or if that fails:
Remove-Item -Recurse -Force .git/rebase-merge
```

### Lost commits after rebase

```powershell
# All commits are preserved in reflog for 90 days
git reflog
# Find the commit hash from before the rebase and reset:
git reset --hard <hash>
```

### Conflict markers left in files after "resolving"

```powershell
# Search for leftover markers
Select-String -Path "*.ts","*.tsx" -Pattern "^(<<<<<<<|=======|>>>>>>>)" -Recurse
# If found: edit the files to remove markers, then:
git add <file>
$env:GIT_EDITOR = "true" ; $env:GIT_SEQUENCE_EDITOR = "true" ; git rebase --continue
```

## Related Skills

- [resolve-merge-conflicts](../resolve-merge-conflicts/SKILL.md) — **Reasoning framework for intelligent conflict resolution** (load this for any non-trivial source conflict)
- [branch-tree](../branch-tree/SKILL.md) — View and manage dependent branch trees
- [worktree-workflow](../worktree-workflow/SKILL.md) — Working in isolated worktrees
- [fix-types](../fix-types/SKILL.md) — Fix TypeScript errors after rebase
- [fix-lint](../fix-lint/SKILL.md) — Fix lint errors after rebase
- [codegen](../codegen/SKILL.md) — Regenerate GraphQL types
- [no-edit-generated](../no-edit-generated/SKILL.md) — Never manually edit generated files
