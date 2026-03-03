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
| **Watch CI checks after push**           | `gh pr checks --watch`                                                                                                     |
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

### Step 7: Force-Push the Rebased Branch

```powershell
git push --force-with-lease origin HEAD
```

> **Always use `--force-with-lease`** instead of `--force`. It prevents overwriting someone else's commits if they pushed to the same branch.

### Step 8: Verify CI Passes

After pushing, check that CI is green. The most common post-rebase failure is **formatting** — if `nx format:write` rewrites any file during `make pc`, the command **fails** and prints the changed files; commit them and re-run `make pc`.

```powershell
# Watch CI checks until they complete
gh pr checks --watch

# Or see the latest run status
gh run list --branch (git branch --show-current) --limit 1
```

If **Quality Gates** fails with a formatting error:

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

If **Quality Gates** fails with lint or type errors, see the [fix-lint](../fix-lint/SKILL.md) and [fix-types](../fix-types/SKILL.md) skills.

---

## Handling Large Rebases (Many Conflicts)

When a branch is far behind `main` and dozens of files conflict across multiple commits, use this systematic approach.

### Strategy 1: Automated Tree Rebase

The repo has scripts that auto-resolve common conflicts (generated files, migrations, docs):

```powershell
# Interactive — prompts you when manual resolution is needed
make rebase-tree

# Fully automated — aborts branches it can't resolve
make rebase-tree-auto
```

These scripts:

1. Run `twig rebase` for the current branch
2. Auto-resolve generated file conflicts via `.\scripts\resolve-generated-conflicts.ps1`
3. Auto-skip duplicate migration commits
4. Run validation (typecheck + lint) after completion

### Strategy 2: Copilot-Assisted Conflict Resolution

When the automated scripts can't fully resolve conflicts, Copilot can help. Here's the workflow:

#### 2a. Start the Rebase

```powershell
git fetch origin
git rebase origin/main
```

#### 2b. Check What Conflicted

```powershell
git diff --name-only --diff-filter=U
```

#### 2c. Categorize the Conflicts

Classify each conflicted file and apply the correct strategy:

| File Pattern              | Strategy                 | Command                                         |
| ------------------------- | ------------------------ | ----------------------------------------------- |
| `*.generated.ts`          | Regenerate               | `.\scripts\resolve-generated-conflicts.ps1`     |
| `**/migrations/*.ts`      | Usually skip (duplicate) | `.\scripts\skip-migration-conflict.ps1`         |
| `docs/api/*.md`           | Accept theirs            | `git checkout --theirs <file> ; git add <file>` |
| `pnpm-lock.yaml`          | Regenerate               | See lockfile section below                      |
| `*.ts` / `*.tsx` (source) | Read both sides, merge   | Manual or Copilot-assisted                      |
| `*.json` (config)         | Read both sides, merge   | Manual or Copilot-assisted                      |

#### 2d. Resolve Source File Conflicts with Copilot

For each conflicted source file, Copilot should:

1. **Read the file** to see the conflict markers
2. **Understand both sides**: what `main` changed vs what the feature branch changed
3. **Determine intent**: Do both changes need to coexist? Does one supersede the other?
4. **Write the resolution**: Remove conflict markers and produce correct merged code
5. **Stage the file**: `git add <file>`

**Key principles for source conflict resolution:**

- If main added new imports and the branch added different imports → keep both
- If main renamed a function and the branch modified it → use the new name with the branch's modifications
- If main deleted code the branch modified → the deletion usually wins (check with the developer if unsure)
- If both sides modified the same line differently → combine the intent of both changes
- When in doubt, **ask the developer** rather than guessing

#### 2e. Continue Through All Commits

```powershell
# Set GIT_EDITOR=true to avoid blocking on commit-message prompts
$env:GIT_EDITOR = "true" ; $env:GIT_SEQUENCE_EDITOR = "true" ; git rebase --continue
```

Repeat 2b–2d for each commit that conflicts.

#### 2f. Validate After Completion

```powershell
# Type check
pnpm exec nx affected -t typecheck

# Lint (with auto-fix)
pnpm exec nx affected -t lint --fix

# Tests
pnpm exec nx affected -t test
```

Fix any errors introduced by the merge resolution, then amend the last commit if needed:

```powershell
git add .
git commit --amend --no-edit
```

---

## Special Conflict Types

### Generated Files (`*.generated.ts`)

**NEVER manually edit generated files.** Always regenerate them.

```powershell
# Automated resolution
.\scripts\resolve-generated-conflicts.ps1

# Manual fallback: accept theirs, then regenerate
git checkout --theirs <generated-file>
git add <generated-file>
make codegen
git add <generated-file>
```

The script handles:

- `apps/app/src/api/db/graphql.generated.ts`
- `apps/web/src/api/db/graphql.generated.ts`
- `apps/cli/src/api/db/graphql.generated.ts`

### Migration Files

Migration conflicts usually mean the same migration was applied on both branches (duplicate). Skip the duplicate commit:

```powershell
# If only migration files conflict:
.\scripts\skip-migration-conflict.ps1

# Or manually:
git rebase --skip
```

If a migration file has a **real** conflict (two different migrations editing the same table), resolve manually by keeping both migrations in chronological order.

### `pnpm-lock.yaml`

The lockfile should never be manually merged. Regenerate it:

```powershell
# Accept either side first to clear the conflict
git checkout --theirs pnpm-lock.yaml
git add pnpm-lock.yaml
$env:GIT_EDITOR = "true" ; $env:GIT_SEQUENCE_EDITOR = "true" ; git rebase --continue

# After rebase completes, regenerate the lockfile
pnpm install --no-frozen-lockfile
git add pnpm-lock.yaml
git commit --amend --no-edit
```

### Schema Files (`lib/db-client/src/drizzle/**`)

Accept theirs (the incoming main version) since schema changes should be sequential:

```powershell
git checkout --theirs lib/db-client/src/drizzle/public/schema.ts
git add lib/db-client/src/drizzle/public/schema.ts
```

Then verify the schema includes your branch's changes. If your branch also modified the schema, you'll need to reapply those changes on top.

---

## Interactive Rebase (Squashing / Reordering)

When you need to clean up commit history before a PR:

```powershell
# Squash last N commits interactively
git rebase -i HEAD~N

# Squash onto a specific base
git rebase -i origin/main
```

In the editor, change `pick` to:

- `squash` (or `s`) — merge into previous commit, combine messages
- `fixup` (or `f`) — merge into previous commit, discard this message
- `reword` (or `r`) — keep commit but edit message
- `drop` (or `d`) — delete the commit entirely
- `edit` (or `e`) — pause to amend the commit

After saving, resolve any conflicts that arise (same process as above), then:

```powershell
$env:GIT_EDITOR = "true" ; $env:GIT_SEQUENCE_EDITOR = "true" ; git rebase --continue
```

---

## Recovery: Stuck Mid-Rebase

If the developer is stuck in the middle of a rebase and confused:

### Diagnose the State

```powershell
# Check if a rebase is in progress
git status

# See which commit is being applied
if (Test-Path .git/rebase-merge) {
    Get-Content .git/rebase-merge/head-name       # branch being rebased
    Get-Content .git/rebase-merge/msgnum           # current commit number
    Get-Content .git/rebase-merge/end              # total commits
}
```

### Options

1. **Continue** (if all conflicts are resolved):

   ```powershell
   git diff --name-only --diff-filter=U   # should be empty
   $env:GIT_EDITOR = "true" ; $env:GIT_SEQUENCE_EDITOR = "true" ; git rebase --continue
   ```

2. **Skip this commit** (if it's a duplicate or no longer needed):

   ```powershell
   git rebase --skip
   ```

3. **Abort** (go back to pre-rebase state — no work is lost):

   ```powershell
   git rebase --abort
   ```

4. **Recover from a bad rebase** (already completed but wrong):
   ```powershell
   # Find the pre-rebase state in reflog
   git reflog
   # Reset to the state before the rebase
   git reset --hard HEAD@{N}   # where N is the reflog entry before rebase
   ```

---

## Rebase in Worktrees

When working in a worktree (see [worktree-workflow skill](../worktree-workflow/SKILL.md)):

```powershell
# Navigate to worktree
cd $wt

# Fetch and rebase
git fetch origin
git rebase origin/main

# Resolve conflicts (same process as above)

# Force-push
git push --force-with-lease origin HEAD
```

> **Important**: Never rebase from the main repo directory if the branch is checked out in a worktree. Always `cd` into the worktree first.

After pushing from a worktree, always verify CI:

```powershell
# From inside the worktree
gh pr checks --watch
```

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

Always run validation:

```powershell
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
```

If validation fails, fix the issues and amend:

```powershell
git add .
git commit --amend --no-edit
git push --force-with-lease origin HEAD
```

Then **verify CI passes** after the push — formatting issues in particular are silent until CI runs:

```powershell
# Watch all checks for the PR
gh pr checks --watch
```

If CI fails with a formatting error, run `pnpm exec nx format:write`, commit the changes, and push again. See Step 8 above.

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

- [branch-tree](../branch-tree/SKILL.md) — View and manage dependent branch trees
- [worktree-workflow](../worktree-workflow/SKILL.md) — Working in isolated worktrees
- [fix-types](../fix-types/SKILL.md) — Fix TypeScript errors after rebase
- [fix-lint](../fix-lint/SKILL.md) — Fix lint errors after rebase
- [codegen](../codegen/SKILL.md) — Regenerate GraphQL types
- [no-edit-generated](../no-edit-generated/SKILL.md) — Never manually edit generated files
