# Conflict Resolution Guide

This reference covers the complete conflict resolution process: the step-by-step procedure for simple and complex rebases, the decision framework for choosing resolution strategies, bulk rebase operations, and troubleshooting.

---

## Step-by-Step: Full Rebase Process

### Step 1: Ensure Clean Working Directory

```bash
git status
# If dirty:
git stash --include-untracked
```

### Step 2: Fetch Latest and Start Rebase

**Preferred (MCP):** Use `worktree_rebase` -- it fetches, rebases, and injects a cross-platform no-op Git editor automatically.

**Shell fallback:**

```bash
git fetch origin
GIT_EDITOR='node -e "process.exit(0)"' git rebase origin/main
```

If it says "Already up to date" -- you're done.

### Step 3: If Conflicts Occur -- Identify Them

```bash
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

> **During a rebase**, `HEAD` = the base branch (main), and the incoming side = your feature branch. This is the **opposite** of a merge. Don't mix them up.

**Resolution strategies** (pick the first that applies):

1. **Generated files** -- always regenerate, never manually merge
2. **Lock files** -- regenerate (`pnpm install`)
3. **Migration files (duplicate)** -- `git rebase --skip`
4. **Migration files (real conflict)** -- ask the developer
5. **Config/JSON files** -- accept theirs, reapply feature branch changes
6. **Source files (additive changes)** -- keep both sides' additions
7. **Source files (contradictory changes)** -- read both sides, infer intent, resolve; if ambiguous, ask the developer
8. **Test files** -- resolve to match the resolved source code
9. **Documentation** -- accept theirs for auto-generated docs; merge manually for hand-written docs

For source file conflicts, **never** blindly run `git checkout --ours` or `--theirs`. Always read and reason first. See [conflict-resolution-framework.md](conflict-resolution-framework.md) for the full 5-step reasoning process.

### Step 5: Stage Resolved Files and Continue

```bash
git add <resolved-file>
# After ALL conflicts in this commit are resolved:
GIT_EDITOR='node -e "process.exit(0)"' git rebase --continue
```

If more commits have conflicts, Git will pause again. Repeat Steps 3-5 for each commit.

### Step 6: Unstash (if you stashed in Step 1)

```bash
git stash pop
```

### Step 7: Post-Rebase Stabilization (BEFORE push)

> **Do NOT push until this step passes.** Pushing before validating is the #1 cause of post-rebase CI failures.

After the rebase completes, the working tree may be out of sync: main may have introduced new dependencies, changed the schema, or reformatted files.

```bash
# Install deps (main may have added/updated packages)
make install

# Regenerate schema + codegen (may have changed on main)
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen --base=origin/main

# Run full pre-commit validation
make pc
```

If `make pc` fails:

- **Formatting**: `nx format:write` rewrote files -- commit them and re-run `make pc`
- **Type errors**: the rebase resolution missed a rename or signature change -- fix, commit, re-run
- **Lint errors**: new rules on main or unresolved conflicts -- fix, commit, re-run
- **Test failures**: merged code broke a test -- fix, commit, re-run

```bash
git add -A
git commit -m "fix: post-rebase stabilization"
make pc   # re-run until clean
```

### Step 8: Force-Push the Validated Branch

Only push **after `make pc` passes**:

```bash
git push --force-with-lease origin HEAD
```

> **Always use `--force-with-lease`** instead of `--force`. It prevents overwriting someone else's commits if they pushed to the same branch.

If `make pc` fails with a formatting error:

```bash
pnpm exec nx format:write
git add -A
git commit -m "style: fix Prettier formatting after rebase"
git push --force-with-lease origin HEAD
```

---

## Bulk Rebase: Find All Conflicting Open PRs

When asked to "rebase all conflicting PRs" or "fix all merge conflicts", fetch all PRs to avoid missing any. This repo can have 100+ open PRs.

**MCP (preferred):**

```
# Fetch all open PRs with merge status, then filter to CONFLICTING
github_list_prs(state: "open", limit: 200)
# Filter results where mergeable == "CONFLICTING"
```

**Shell fallback:**

```powershell
$raw = gh pr list --author "@me" --state open --limit 200 --json number,headRefName,mergeable,mergeStateStatus
$conflicting = ($raw | ConvertFrom-Json) | Where-Object { $_.mergeable -eq "CONFLICTING" }
$conflicting | Select-Object number, headRefName
Write-Host "Total conflicting: $($conflicting.Count) of $(($raw | ConvertFrom-Json).Count) open PRs"
```

---

## Rebase in Worktrees

When working in a worktree (see [worktree-workflow skill](../../worktree-workflow/SKILL.md)):

**Preferred (MCP):** Use `worktree_rebase` -- it targets the active worktree, fetches, rebases, and injects a cross-platform no-op Git editor automatically.

**Shell fallback:**

```bash
# Fetch and rebase (use -C to target the worktree without cd)
git -C $wt fetch origin
GIT_EDITOR='node -e "process.exit(0)"' git -C $wt rebase origin/main

# Resolve conflicts (same process as above)

# Stabilize before pushing (CRITICAL -- prevents CI failures)
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

```bash
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

```bash
# 1. Rebase parent onto main
git checkout LS-100/parent-branch
git fetch origin
GIT_EDITOR='node -e "process.exit(0)"' git rebase origin/main
# (resolve conflicts, continue)
git push --force-with-lease origin HEAD

# 2. Rebase child onto updated parent
git checkout LS-101/child-branch
GIT_EDITOR='node -e "process.exit(0)"' git rebase LS-100/parent-branch
# (resolve conflicts, continue)
git push --force-with-lease origin HEAD

# 3. Continue for each level of the tree
```

---

## Troubleshooting

### "Cannot rebase: You have unstaged changes"

```bash
git stash --include-untracked
GIT_EDITOR='node -e "process.exit(0)"' git rebase origin/main
# after rebase:
git stash pop
```

### "CONFLICT (modify/delete)" -- file deleted on one side

```bash
# If the delete is correct (feature removed the file):
git rm <file>

# If the file should still exist:
git checkout --ours <file>    # keep your version
git add <file>
```

### Rebase produces empty commits

```bash
# Git will warn "No changes -- did you mean to skip?"
git rebase --skip
```

### "fatal: It seems that there is already a rebase-merge directory"

```bash
# Clean up stale rebase state
git rebase --abort
# Or if that fails:
rm -rf .git/rebase-merge
```

### Lost commits after rebase

```bash
# All commits are preserved in reflog for 90 days
git reflog
# Find the commit hash from before the rebase and reset:
git reset --hard <hash>
```

### Conflict markers left in files after "resolving"

```bash
# Search for leftover markers
grep -rn '^<<<<<<<\|^=======\|^>>>>>>>' --include='*.ts' --include='*.tsx'
# If found: edit the files to remove markers, then:
git add <file>
GIT_EDITOR='node -e "process.exit(0)"' git rebase --continue
```
