# Branch Tree Management with Twig

## 📋 Overview

This guide covers best practices for maintaining clean branch dependency trees in the Legacy Sports codebase using Twig. Proper tree management is essential for large projects with multiple dependent branches to avoid duplicate commits and maintain a clean, reviewable history.

**Last Updated**: October 24, 2025

---

## 🤖 For AI Agents

**Twig MCP Server Available**: This repository includes a Twig MCP (Model Context Protocol) server configuration. AI agents with MCP support should use the twig MCP server for all twig operations instead of running terminal commands. This provides:

- Structured responses that are easier to parse
- Better error handling
- Direct access to twig functionality

Check `.vscode/settings.json` for the MCP server configuration. If MCP is not available, fall back to terminal commands as documented below.

---

## 🎯 Why This Matters

### The Problem

When working on large projects that span multiple tickets, it's common to create dependent branches (parent → child → grandchild). Without careful management, you can accidentally include parent commits in child branches, leading to:

- **Duplicate commits** across the tree
- **Massive PR diffs** that are hard to review
- **Merge conflicts** when trying to integrate changes
- **Lost work** when trying to clean up the mess

### The Solution

Use Twig's branch tree management features to:

- Visualize branch dependencies
- Verify unique commits per branch
- Cascade rebases across dependent branches
- Detect and fix duplicate commits early

<<<<<<< HEAD

- Visualize branch dependencies
- Verify unique commits per branch
- Cascade rebases across dependent branches
- Detect and fix duplicate commits early
- # ✅ Track rewritten commits that already landed upstream (record old → new after resolving conflicts)

---

> > > > > > > cf968417 (fix(Graphql-Contract-Refresh): refresh matchup contracts and clients (LS-51))

## 🌳 Understanding the Branch Tree

<<<<<<< HEAD
When a rebase rewrites a commit because you resolved conflicts, you must capture the old hash before adding it to any skip list. This keeps downstream cascades safe and prevents accidental data loss.

1. **Let Git tell you the offender** – during `git rebase`, note the SHA shown in the “could not apply <sha> …” line.
2. **Resolve the conflicts normally** – edit files, run `git add`, then `git rebase --continue`.
3. **Record the replacement** – immediately run `git log -1 --oneline` (or `git rev-parse HEAD`) to grab the new SHA for the rewritten commit.
4. **Update the skip list** – append a line like `abc1234 # replaced by def5678 on LS-25 after conflict resolution` to `skip-migration-commits-all.txt` (or the skip file you’re using). Only add the _old_ hash after the new commit exists.
5. **Reuse the list downstream** – pass that skip file (or hash set) to `twig rebase --skip-commits` / cascade scripts so child branches automatically skip the redundant commit.

> **Never pre-populate skip lists with hashes that haven’t actually been rewritten upstream.** If you skip too aggressively you will drop real work, as we saw when the LS-17 tree temporarily lost feature commits.

=======

> > > > > > > cf968417 (fix(Graphql-Contract-Refresh): refresh matchup contracts and clients (LS-51))

### Viewing Your Tree

```powershell
# View the complete branch tree
twig tree
```

**Example Output**:

```
main
├── feature/league-page                                    [+2]
├── LS-7/design-league-scoring-data-model                  [+23]
│   └── LS-17/set-up-matchup-system (current)              [+1]
│       └── LS-18/extend-matchup-schema                    [+1]
│           └── LS-19/build-graphql-resolvers              [+1]
│               └── LS-20/implement-scheduling             [+2]
└── LS-10/refactor-scoring-library                         [+15/-1]
```

### Reading the Tree

- **Indentation**: Shows parent-child relationships
- **`(current)`**: Your currently checked-out branch
- **`[+N]`**: Number of commits in this branch beyond its parent
- **`[+N/-M]`**: N additions, M deletions (file changes)
- **`[PR#123]`**: Associated pull request number

### Interpreting Commit Counts

| Pattern     | Meaning             | Action                                     |
| ----------- | ------------------- | ------------------------------------------ |
| `[+1]`      | One unique commit   | ✅ **Perfect** - clean branch              |
| `[+2]`      | Two unique commits  | ✅ **Good** - verify both are yours        |
| `[+25]`     | Twenty-five commits | ⚠️ **Warning** - likely has duplicates     |
| `[+23/-24]` | Many adds/deletes   | 🚨 **Problem** - definitely has duplicates |

---

## ✅ Best Practices

### 1. Plan Your Tree Structure

Before creating multiple dependent branches, document the dependency chain:

```
Project: Matchup System (LS-17 Epic)

Branch Structure:
├── LS-17: Base setup                    (from main)
├── LS-18: Database schema               (from LS-17)
├── LS-19: GraphQL API                   (from LS-18)
├── LS-20: Scheduling algorithm          (from LS-19)
└── LS-21: Score calculation             (from LS-20)
```

### 2. Create Branches Correctly

```powershell
# For base branch - start from main
git checkout main
git pull
twig switch LS-17

# For dependent branch - start from specific parent
git checkout LS-17/set-up-matchup-system
twig switch LS-18 -p=current

# ❌ DON'T: Create from wrong parent
# ❌ DON'T: Create from main when it should be from LS-17
```

### 3. Verify After Each Branch Creation

```powershell
# Immediately after creating a new branch
twig tree

# Should show clean structure like:
# LS-17 [+1]
#   └── LS-18 [+1]  ← Your new branch
```

### 4. Check Unique Commits

```powershell
# Verify only YOUR commits are in the branch
git log --oneline parent-branch..current-branch

# Count commits
git rev-list --count parent-branch..current-branch

# Example - if you made 1 commit, count should be 1
```

---

## 🔍 Detecting Duplicate Commits

### Method 1: Twig Tree Analysis

```powershell
twig tree

# Look for suspicious patterns:
# LS-18 [+25]  ← Created from LS-17 [+23]?
#              ← Probably has LS-17's 23 commits + 2 new = 25
```

### Method 2: Commit Log Comparison

```powershell
# See commits in current branch not in parent
git log --oneline parent-branch..current-branch

# If you see commits with messages like:
# - "feat(scoring): expose league scoring profiles"  ← From LS-7
# - "docs(scoring): add rollout plan"                ← From LS-7
# - "feat(matchup): extend schema"                   ← Your work
#
# You have duplicates from LS-7!
```

### Method 3: Check Merge Base

```powershell
# Find common ancestor
git merge-base parent-branch current-branch

# View what's in parent since merge base
git log --oneline <merge-base>..parent-branch

# View what's in current since merge base
git log --oneline <merge-base>..current-branch

# These should have minimal overlap
```

---

## 🔧 Fixing Duplicate Commits

### Option 1: Cherry-Pick Method (Cleanest)

Best when you know exactly which commits are yours.

```powershell
# 1. Identify your unique commit hashes
git log --oneline current-branch -5
# Example: abc1234 feat(matchup): my actual work

# 2. Create clean branch from parent
git checkout -b branch-name-clean parent-branch

# 3. Cherry-pick only your commits
git cherry-pick abc1234

# 4. Replace old branch
git branch -D branch-name-old
git branch -m branch-name-clean branch-name

# 5. Verify
twig tree
# Should now show [+1] instead of [+25]
```

### Option 2: Interactive Rebase

Best when duplicates are at the beginning of the branch.

```powershell
# 1. Start rebase
git checkout current-branch
git rebase --no-edit parent-branch

# 2. When conflicts occur on duplicate commits
# Git will show:
# Auto-merging file.ts
# CONFLICT (content): Merge conflict in file.ts

# 3. Skip the duplicate commit
git rebase --skip

# 4. Continue until only unique commits remain
# Repeat step 3 for each duplicate

# 5. If you hit a real commit with conflicts, resolve them
git add .
git rebase --no-edit --continue
```

### Option 3: Rebase with --onto

Best for complex situations where you need to rebase onto a different parent.

```powershell
# Rebase current branch onto new parent, starting from old parent
git rebase --no-edit --onto new-parent old-parent current-branch

# Example: Move LS-20 from LS-18 to LS-19
git rebase --no-edit --onto LS-19/build-graphql-resolvers LS-18/extend-matchup-schema LS-20/implement-scheduling
```

---

## 🔄 Cascading Rebases

When you need to rebase an entire chain of dependent branches:

### ⭐ Recommended: Cascade After Squashing

**The best practice when squashing branches with children is to use `--skip-commits` to avoid conflicts entirely.**

#### Why This Works

When you squash a branch (e.g., LS-23), the old commit hashes disappear but child branches still reference them. Using `--skip-commits` tells git to ignore those removed commits, preventing conflicts.

#### The Workflow

```powershell
# 1. Squash the parent branch
git checkout LS-23/branch-name
git rebase -i parent-branch  # Squash to 1 commit
# New commit: abc123f

# 2. Identify removed commits that children still have
git checkout LS-24/child-branch
git log --oneline LS-23/branch-name..HEAD

# Output shows commits unique to LS-24:
# def5678 (LS-24) Add web UI
# 1111111 (OLD LS-23) Mobile fixes   ← Removed during squash
# 2222222 (OLD LS-23) Type safety    ← Removed during squash

# 3. Create skip-commits file
@"
1111111  # Old LS-23 commit removed during squash
2222222  # Old LS-23 commit removed during squash
"@ | Out-File skip-commits.txt

# 4. Rebase children with automated script
.\scripts\rebase-branch-tree.ps1 -SkipCommitsFile "skip-commits.txt"

# OR manually rebase each branch:
git checkout LS-24/child-branch
twig rebase --skip-commits skip-commits.txt

git checkout LS-25/grandchild-branch
twig rebase --skip-commits skip-commits.txt

# 5. Verify clean history
twig tree
# LS-23/branch-name      [+1]  ✓
# └─ LS-24/child-branch  [+1]  ✓
#    └─ LS-25/...        [+1]  ✓
```

#### Benefits Over Traditional Cascade

✅ **No conflicts** - removed commits are skipped, not merged  
✅ **Clean history** - branches stay at [+1] commit each  
✅ **No re-squashing needed** - history stays clean throughout  
✅ **More predictable** - no conflict resolution decisions needed  
✅ **Faster** - automated scripts can handle entire tree

#### When to Use This Pattern

- ✅ After squashing branches with children
- ✅ After resolving conflicts with `--theirs`/`--ours`
- ✅ After interactive rebase that rewrites history
- ✅ After cherry-picking fixes backward in the tree
- ⚠️ NOT needed for simple forward development

#### Automated Script Support

Use the `rebase-branch-tree.ps1` script with skip-commits:

```powershell
# Rebase entire tree, skipping specified commits
.\scripts\rebase-branch-tree.ps1 -SkipCommits "1111111,2222222"

# Or use a skip-commits file (recommended)
.\scripts\rebase-branch-tree.ps1 -SkipCommitsFile "skip-commits.txt"

# Via Makefile
make rebase-tree SKIP_COMMITS="1111111,2222222"
```

### Using Twig Cascade

```powershell
# 1. Checkout the parent branch
git checkout parent-branch

# 2. Run cascade with options
twig cascade --show-graph --autostash

# Options:
# --show-graph: Display dependency tree before rebasing
# --autostash: Automatically stash uncommitted changes
# --force: Force rebase even if branches are up-to-date
# --force-push: Force push after successful rebase (⚠️ use carefully)
# --skip-commits: Exclude specific commits (see below)
```

### What Cascade Does

1. Starts from your current branch
2. Identifies all child branches
3. Rebases each child onto its parent
4. Works down the tree recursively
5. Handles conflicts interactively

### Skipping Problematic Commits (New Feature)

When you have duplicate or problematic commits that should be excluded during rebases:

```powershell
# Skip specific commits by hash (comma-separated)
twig rebase --skip-commits abc1234,def5678,ghi9012

# Skip commits listed in a file
twig rebase --skip-commits /path/to/skip-commits.txt

# Works with cascade too
twig cascade --skip-commits abc1234,def5678
```

**Create a skip-commits file**:

```txt
# skip-commits.txt
abc1234  # Duplicate commit from LS-23
def5678  # Fix already applied in parent

# Another duplicate
ghi9012
```

**How it works**:

- **Rebase**: Fully excludes specified commits from the rebased branch using `git cherry-pick`
- **Cascade**: ⚠️ Limited support - only applies to the initial branch, downstream branches use standard rebase

**When to use**:

- ✅ Removing duplicate commits from parent branches
- ✅ Excluding broken commits during history cleanup
- ✅ Skipping already-applied fixes
- ⚠️ **Cascade limitation**: Skipped commits may reappear in child branches

**Practical Example**:

```powershell
# Scenario: LS-23 has duplicate LS-7 commits (abc1234, def5678)
# that were accidentally included

# 1. Identify duplicate commit hashes
git log --oneline LS-23/build-mobile-matchup-ui | grep "LS-7"
# abc1234 feat(scoring): expose league scoring profiles
# def5678 docs(scoring): add rollout plan

# 2. Create skip file
echo "abc1234  # Duplicate from LS-7" > skip-commits.txt
echo "def5678  # Duplicate from LS-7" >> skip-commits.txt

# 3. Rebase LS-23 excluding duplicates
git checkout LS-23/build-mobile-matchup-ui
twig rebase --skip-commits skip-commits.txt

# 4. Cascade to child branches (LS-24+)
# Note: Children will use standard rebase
twig cascade --show-graph

# 5. Verify clean tree
twig tree
# LS-23 [+1]  ← Now only unique commit!
# LS-24 [+1]
# LS-25 [+1]
```

**Alternative for Cascade**: Instead of using `--skip-commits` with cascade (which has limitations), consider:

```powershell
# Manual cascade with skip-commits on each branch
for branch in LS-23 LS-24 LS-25 LS-26; do
  git checkout $branch
  twig rebase --skip-commits skip-commits.txt
done
```

**Validation**:

- Commit hashes must be 7-64 hexadecimal characters
- Invalid hashes will fail with clear error messages
- File paths validated before processing

### Handling Conflicts During Cascade

```powershell
# When cascade encounters conflicts:
# You'll see:
# ⚠️ Conflicts detected while rebasing LS-17 onto LS-7
# ℹ Rebase conflict detected. You have several options:
#   1. Continue - Resolve conflicts and continue the rebase
#   2. Abort to original - Abort the rebase and return to original branch
#   3. Abort stay here - Abort the rebase but stay on current branch
#   4. Skip - Skip the current commit and continue

# For duplicate commits, choose:
# 4. Skip

# For real conflicts, choose:
# 1. Continue
# Then resolve, stage, and the cascade will continue
```

---

## 📊 Real-World Example

### Scenario: Cleaning Up Matchup System Branches

**Problem**: Created 14 dependent branches (LS-17 through LS-31), all have duplicate commits from LS-7.

**Detection**:

```powershell
twig tree
# Shows:
# LS-17 [+23/-24]  ← Should be [+1]
# LS-18 [+25/-25]  ← Should be [+1]
# LS-19 [+1]       ← Already clean ✅
# LS-20 [+2]       ← Should be [+1]
```

**Solution**:

```powershell
# Clean LS-17
git checkout -b LS-17-temp LS-7/design-league-scoring-data-model
git checkout LS-17/set-up-matchup-system -- .github .eslintrc* package*.json
git rm .eslintrc.security.json
git commit -m "chore: remove security eslint config and downgrade apollo"
git branch -D LS-17/set-up-matchup-system
git branch -m LS-17-temp LS-17/set-up-matchup-system

# Clean LS-18
git checkout -b LS-18-temp LS-17/set-up-matchup-system
git log --oneline LS-18/extend-matchup-database-schema -1  # Get hash: 8eb72db
git cherry-pick 8eb72db
git branch -D LS-18/extend-matchup-database-schema
git branch -m LS-18-temp LS-18/extend-matchup-database-schema

# Repeat for LS-19 through LS-31...

# Final verification
twig tree
# Should now show:
# LS-17 [+1]
# LS-18 [+1]
# LS-19 [+1]
# LS-20 [+1]
# ...all clean!
```

**Result**: Removed ~250+ duplicate commits across 14 branches.

---

## 🚨 Common Mistakes

### Mistake 1: Creating from Wrong Parent

```powershell
# ❌ WRONG: Creating LS-19 from main
git checkout main
twig switch LS-19

# Result: LS-19 won't have LS-18's changes

# ✅ CORRECT: Creating LS-19 from LS-18
git checkout LS-18/extend-matchup-schema
twig switch LS-19 -p=current
```

### Mistake 2: Not Verifying Tree

```powershell
# ❌ WRONG: Create many branches without checking
twig switch LS-18 -p=current
# ...make changes, commit...
twig switch LS-19 -p=current
# ...make changes, commit...
# Never checked twig tree - might have duplicates!

# ✅ CORRECT: Verify after each branch
twig switch LS-18 -p=current
twig tree  # ← Check here
# ...make changes, commit...
twig switch LS-19 -p=current
twig tree  # ← And here
```

### Mistake 3: Force-Pushing Without Verification

```powershell
# ❌ WRONG: Force push without checking
git push --force

# ✅ CORRECT: Verify first
twig tree
git log --oneline parent..current
# Only if tree is clean:
git push --force
```

### Mistake 4: Merging Instead of Rebasing

```powershell
# ❌ WRONG: Merge parent into child
git checkout child-branch
git merge parent-branch
# Creates merge commits, pollutes history

# ✅ CORRECT: Rebase child onto parent
git checkout child-branch
git rebase --no-edit parent-branch
# Maintains linear history
```

---

## 🎓 Quick Reference Commands

```powershell
# View tree structure
twig tree

# Create dependent branch
git checkout parent-branch
twig switch LS-#### -p=current

# Verify unique commits
git log --oneline parent..current
git rev-list --count parent..current

# Clean up with cherry-pick
git checkout -b clean parent
git cherry-pick <commit-hash>
git branch -D old-branch
git branch -m clean old-branch

# Cascade rebase
git checkout parent-branch
twig cascade --show-graph --autostash

# Check merge base
git merge-base parent current
```

---

## 📚 Related Documentation

- [AI Agent Contribution Workflow](ai-agent-contribution-workflow.md) - Complete development workflow
- [Development Workflow CSV](../agents/development-workflow.csv) - Structured patterns
- [Common Pitfalls CSV](../agents/common-pitfalls.csv) - Mistakes to avoid

---

## 💡 Tips for AI Agents

1. **Always run `twig tree`** before and after creating dependent branches
2. **Count your commits** - if you made 1 commit, the branch should show `[+1]`
3. **Cherry-pick is safer** than rebase when cleaning up duplicates
4. **Document your tree structure** in the Epic ticket before starting
5. **Fix duplicates immediately** - don't wait until you have 14 dirty branches
6. **Use cascade for bulk rebases** - it handles the tree structure automatically
7. **Verify before force-pushing** - check `twig tree` and commit logs first

---

<<<<<<< HEAD

## 📼 Non-Interactive Rebase Demo (Nov 20, 2025)

The Matchup branch tree (LS-17 → LS-53) was taken through a full, non-interactive cascade to validate the scripted workflow. Each command below was executed from `D:\code\legacy-sports` and produced the noted outcome:

| Step           | Command                                                    | Result       | Notes                                                                              |
| -------------- | ---------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------- |
| Cascade rebase | `make rebase-tree-skip SKIP_COMMITS_FILE=skip-commits.txt` | ✅ PASS      | Used the 9 known skip hashes; LS-27 rebased without prompts.                       |
| Typecheck      | `pnpm exec nx affected -t typecheck`                       | ✅ PASS      | Confirms regenerated GraphQL types compile everywhere.                             |
| Mobile lint    | `pnpm exec nx run app:lint`                                | ✅ PASS      | Previously unsafe scoring hooks are now fully typed.                               |
| Skip detection | `make detect-skip-commits`                                 | ⚠️ FOLLOW-UP | Script still reports LS-28–LS-34 and LS-49–LS-53 containing the rewritten commits. |

**Next steps highlighted by the demo**

- Add or confirm the flagged hashes in `skip-commits.txt`, then rerun `make rebase-tree-skip` starting at LS-28 to cascade through LS-53.
- Repeat `make detect-skip-commits` until every branch prints `[OK]`, capturing the final green transcript for this guide.
- **Commit the fixes immediately after validation.** Once typecheck/lint/test/build pass, checkpoint the tooling/doc updates and regenerated artifacts so the cascade leaves the repo clean for the next branch.
- Keep the validation order (typecheck → lint → test/build) after every cascade so regressions surface immediately.

---

=======

> > > > > > > cf968417 (fix(Graphql-Contract-Refresh): refresh matchup contracts and clients (LS-51))
> > > > > > > **Remember**: A clean branch tree is a happy branch tree! 🌳✨
