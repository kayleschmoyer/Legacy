---
name: rebase-and-conflicts
description: 'Rebase branches onto main (or another base) and resolve merge conflicts intelligently. Covers simple rebases, bulk PR rebases, stacked branch trees, conflict resolution strategies, post-rebase stabilization, and recovery. Load when rebasing, resolving conflicts, or updating a branch.'
---

# Skill: Rebase & Conflict Resolution

## Overview

Rebasing replays your branch's commits on top of another branch. When the same files were changed in both branches, Git pauses with merge conflicts. This skill covers both the mechanical rebase process and the reasoning framework for resolving conflicts correctly.

## Quick Reference

| Situation                            | Command                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| Simple rebase onto main              | `git fetch origin ; git rebase origin/main`                                            |
| See conflicted files                 | `git diff --name-only --diff-filter=U`                                                 |
| Accept your version                  | `git checkout --ours <file>`                                                           |
| Accept incoming version              | `git checkout --theirs <file>`                                                         |
| Mark resolved                        | `git add <file>`                                                                       |
| Continue rebase (agent-safe)         | `$env:GIT_EDITOR = "true" ; $env:GIT_SEQUENCE_EDITOR = "true" ; git rebase --continue` |
| Skip current commit                  | `git rebase --skip`                                                                    |
| Abort rebase                         | `git rebase --abort`                                                                   |
| Resolve generated file conflicts     | `.\scripts\resolve-generated-conflicts.ps1`                                            |
| Rebase entire branch tree            | `make rebase-tree`                                                                     |
| Post-rebase stabilization (CRITICAL) | `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen`   |
| Validate before push                 | `make pc`                                                                              |

## Step-by-Step: Simple Rebase

### 1. Ensure Clean Working Directory

```powershell
git status
# If dirty: git stash --include-untracked
```

### 2. Fetch and Rebase

```powershell
git fetch origin
git rebase origin/main
```

### 3. Resolve Conflicts

For each conflicted file, choose a resolution strategy:

**Priority order** (pick the first that applies):

1. **Generated files** → regenerate, never manually merge
2. **Lock files** → regenerate (`pnpm install`)
3. **Migration files (duplicate)** → `git rebase --skip`
4. **Config/JSON** → accept theirs, reapply feature changes
5. **Source files** → read, reason, and synthesize (see Conflict Resolution below)

After resolving each file: `git add <file>`, then continue with `git rebase --continue`.

### 4. Post-Rebase Stabilization (BEFORE push)

> Do NOT push until `make pc` passes. This is the #1 cause of post-rebase CI failures.

```powershell
make install
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main
make pc
```

### 5. Push

```powershell
git push --force-with-lease origin HEAD
```

## Conflict Resolution Framework

The #1 mistake agents make is **blindly picking one side** (`--ours` / `--theirs`). The correct resolution almost always preserves the intent of **both** changes.

### When --ours/--theirs Is OK

- Generated files (regenerate instead)
- Lock files (regenerate instead)
- Auto-generated docs
- Files where one side's changes fully supersede the other (verified)

### When You Must Read, Reason, and Synthesize

For every source file conflict:

1. **Read the full file** (not just conflict markers) for context
2. **Understand each side**: what did main change? What did your branch change? Are changes independent, compatible, or contradictory?
3. **Apply resolution rules**:
   - Structural changes from main always win, then reapply feature logic
   - Additive changes from both sides coexist
   - Signature/interface changes from main must be adopted
   - Deleted code should stay deleted (check if it moved)
4. **Remove all conflict markers**, write merged code
5. **Validate**: typecheck + lint + test

> Full resolution framework with worked examples: [references/conflict-resolution-framework.md](references/conflict-resolution-framework.md)
> Pitfalls and escalation guide: [references/pitfalls-and-escalation.md](references/pitfalls-and-escalation.md)

## Worktree Rebase

```powershell
git -C $wt fetch origin
git -C $wt rebase origin/main
# Resolve conflicts...
make -C $wt install
make -C $wt pc
git -C $wt push --force-with-lease origin HEAD
```

Or use MCP: `worktree_rebase` (preferred).

## Branch Tree Rebase (Stacked Branches)

```powershell
twig tree                    # View the tree
make rebase-tree             # Interactive
make rebase-tree-auto        # Auto-resolve
```

## Troubleshooting

| Problem                           | Fix                                                                  |
| --------------------------------- | -------------------------------------------------------------------- |
| "Cannot rebase: unstaged changes" | `git stash --include-untracked`, rebase, then pop                    |
| "CONFLICT (modify/delete)"        | `git rm <file>` if delete correct, else `git checkout --ours <file>` |
| Empty commits                     | `git rebase --skip`                                                  |
| Stale rebase-merge directory      | `git rebase --abort`                                                 |
| Lost commits                      | `git reflog` → `git reset --hard <hash>`                             |
| Leftover conflict markers         | Search with `Select-String` and fix manually                         |

> Advanced strategies (generated files, migrations, pnpm-lock): [references/rebase-conflict-strategies.md](references/rebase-conflict-strategies.md)
> Interactive rebase and recovery: [references/rebase-interactive-and-recovery.md](references/rebase-interactive-and-recovery.md)
> Worked conflict resolution examples: [references/worked-examples.md](references/worked-examples.md)
