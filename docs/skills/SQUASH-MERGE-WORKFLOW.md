# Squash-Merge Workflow Plan

## 🎯 Problem Statement

When working with nested branches (LS-1 → LS-2 → LS-3 → LS-4) for small PRs:

1. **LS-1** gets merged to main with squash (5 commits → 1 commit)
2. **LS-2, LS-3, LS-4** still have those original 5 commits from LS-1
3. Rebasing children onto main causes conflicts because commits don't exist anymore

## ✅ Complete Solution

### One-Command Automation

```powershell
# After PR is merged and squashed to main:
make post-merge-rebase BRANCH=LS-1/merged-feature
```

This single command:
1. ✅ Pulls latest main
2. ✅ Detects which commits were squashed
3. ✅ Adds them to skip-commits.txt
4. ✅ Updates child branch dependencies to main
5. ✅ Rebases entire tree without conflicts
6. ✅ Shows final tree state

### Manual Step-by-Step (if needed)

```powershell
# 1. Update main
git checkout main
git pull

# 2. Detect squashed commits automatically
.\scripts\detect-squashed-commits.ps1 -Branch LS-1/merged -Parent main

# 3. Update child dependencies
twig branch remove-dep LS-2/child LS-1/merged
twig branch depend LS-2/child main

# Repeat for all children (LS-3, LS-4, etc.)

# 4. Rebase entire tree
make rebase-tree-auto

# 5. Verify tree
twig tree

# 6. Delete merged branch (optional)
git branch -D LS-1/merged
```

## 📋 Workflow Diagram

```
┌─────────────────────────────────────────────────┐
│ PR Merged to Main (Squashed)                    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ Run: make post-merge-rebase BRANCH=LS-1/merged │
└────────────────┬────────────────────────────────┘
                 │
                 ├──► Step 1: Pull main
                 │
                 ├──► Step 2: Detect squashed commits
                 │            (adds to skip-commits.txt)
                 │
                 ├──► Step 3: Update child dependencies
                 │            (LS-2, LS-3, LS-4 → main)
                 │
                 ├──► Step 4: Rebase entire tree
                 │            (uses skip-commits.txt)
                 │
                 └──► Step 5: Show final tree
                              (verify clean state)
```

## 🔧 What Each Tool Does

### 1. detect-squashed-commits.ps1
**Purpose**: Automatically identify which commits were squashed

**How it works**:
- Compares branch with its parent (main)
- Checks if branch has unique changes (git diff)
- If no unique changes = commits were squashed
- Adds old commit hashes to skip-commits.txt

**Usage**:
```powershell
.\scripts\detect-squashed-commits.ps1 -Branch LS-1/merged -Parent main
```

**Output**:
```
Found 5 commit(s) in branch:
  abc1234 feat: add feature A
  def5678 fix: update logic
  ...

✓ No unique changes in branch compared to parent
  All commits have been squashed into parent!

Adding squashed commits to skip-commits.txt...
  ✓ Added: abc1234
  ✓ Added: def5678
  ...
```

### 2. post-merge-rebase.ps1
**Purpose**: Complete automation of entire workflow

**What it does**:
1. Verifies merged branch exists
2. Updates parent branch (main)
3. Runs detect-squashed-commits.ps1
4. Finds all child branches using twig tree
5. Updates child dependencies to main
6. Runs make rebase-tree-auto
7. Shows before/after tree state
8. Optionally deletes merged branch

**Usage**:
```powershell
# Basic usage
.\scripts\post-merge-rebase.ps1 -MergedBranch LS-1/feature

# With branch deletion
.\scripts\post-merge-rebase.ps1 -MergedBranch LS-1/feature -DeleteMergedBranch

# Dry run (preview only)
.\scripts\post-merge-rebase.ps1 -MergedBranch LS-1/feature -DryRun
```

### 3. make rebase-tree-auto
**Purpose**: Rebase entire branch tree automatically

**What it does**:
- Rebases all branches in tree
- Uses skip-commits.txt if present
- No prompts (fully automated)
- Handles empty commits gracefully

**Usage**:
```powershell
make rebase-tree-auto
```

## 📊 Example Scenario

### Initial State
```
main
└── LS-1/feature          [+5]  (5 commits)
    ├── LS-2/child1       [+3]  (3 more commits)
    └── LS-3/child2       [+2]  (2 more commits)
```

### After LS-1 Merged with Squash
```
main (now has 1 squashed commit from LS-1)
└── LS-1/feature          [+5]  (still has original 5)
    ├── LS-2/child1       [+8]  (5 from LS-1 + 3 own)
    └── LS-3/child2       [+7]  (5 from LS-1 + 2 own)

Problem: Those 5 commits in LS-1 don't exist in main anymore!
```

### Run Automation
```powershell
make post-merge-rebase BRANCH=LS-1/feature
```

### Final State (After Automation)
```
main
├── LS-2/child1           [+3]  ✅ Only its commits!
└── LS-3/child2           [+2]  ✅ Only its commits!

skip-commits.txt now contains the 5 old hashes from LS-1
```

## 🎓 Key Concepts

### Why Squash Merges?
- **Cleaner history**: One commit per feature/PR
- **Easier revert**: Single commit to revert
- **Better changelog**: Each feature = one entry

### Why This Breaks Branches?
- Git rebases by replaying commits
- Squashed commits have different hashes
- Child branches still reference old hashes
- Rebase tries to apply commits that already exist = conflicts

### How skip-commits.txt Fixes It?
- Tells twig "these commits are already applied"
- Skips them during rebase
- Children only rebase their unique commits
- No conflicts!

## ⚙️ Configuration

### skip-commits.txt Format
```
# Comments start with #
abc1234  # Short hash
def567890abcdef1234567890  # Full hash works too

# Added by automation
8eb9552  # Squashed into main (from LS-1/feature) on 2026-01-16
```

### Makefile Integration
```makefile
post-merge-rebase: ## Automate rebase after PR merged with squash
	@powershell -File ".\scripts\post-merge-rebase.ps1" -MergedBranch "$(BRANCH)"
```

**Usage**: `make post-merge-rebase BRANCH=LS-1/feature`

## 🚨 Common Issues

### Issue: "Branch not found in twig tree"
**Cause**: Branch not tracked by twig

**Solution**:
```powershell
# Re-add to twig
twig switch LS-1/feature
```

### Issue: "No child branches found"
**Cause**: Children depend on something else, or no children exist

**Solution**: Verify tree structure
```powershell
twig tree  # Check relationships
```

### Issue: Rebase still has conflicts
**Cause**: skip-commits.txt missing some hashes

**Solution**:
```powershell
# Add conflicting commit to skip-commits.txt
Add-Content skip-commits.txt "conflict-hash"

# Continue rebase
make rebase-tree-auto
```

### Issue: Lost commits after rebase
**Cause**: Pre-populated skip-commits.txt too aggressively

**Solution**: 
- Never add hashes before they're actually replaced
- Only add old hashes AFTER conflict resolution
- Use detect-squashed-commits.ps1 (it's smart about this)

## 📖 Related Documentation

- **[Branch Management Skill](./branch-management.md)** - Complete branch management guide
- **[Branch Tree Management](../guides/branch-tree-management.md)** - Detailed twig usage
- **[Rebase Workflow](../guides/rebase-workflow.md)** - Manual rebase procedures

## 🔄 Best Practices

1. **Always use automation**: `make post-merge-rebase BRANCH=...`
2. **Verify tree before/after**: `twig tree`
3. **Check commit counts**: Should show only unique commits
4. **Force push safely**: Use `--force-with-lease` not `--force`
5. **Keep skip-commits.txt**: Don't delete it between rebases
6. **Delete merged branches**: Clean up after successful rebase

## 🎯 Success Criteria

After running post-merge automation:

✅ **Child branches depend on main** (not merged branch)  
✅ **Each branch shows only its commits** (small `[+N]` counts)  
✅ **No conflicts during rebase**  
✅ **Tree structure is clean** (`twig tree` looks good)  
✅ **skip-commits.txt contains old hashes**  

## 🚀 Quick Start Checklist

- [ ] PR merged to main with squash
- [ ] Run: `make post-merge-rebase BRANCH=LS-X/merged`
- [ ] Verify tree: `twig tree`
- [ ] Force push children: `git push --force-with-lease`
- [ ] Delete merged branch: `git branch -D LS-X/merged`
- [ ] ✅ Done!

---

**Last Updated**: 2026-01-16
