---
name: branch-tree
description: 'View and manage dependent branch trees using twig; use when working with stacked branches across multiple related tickets.'
---

# Skill: Branch Tree Management

## Overview

View and manage dependent branch trees using twig to maintain clean commit history.

## When to Use

- Working with multiple dependent branches
- Verifying branch structure and commit counts
- Before creating dependent branches
- After rebasing or squashing commits
- Detecting duplicate commits in branch tree

## Command

```powershell
# View complete branch tree
twig tree
```

## Alternative Commands

> **Non-interactive mode**: Always use `--no-edit` with `git rebase` and `git rebase --continue` so git never opens a text editor and blocks execution. The `rebase-branch-tree.ps1` script sets `$env:GIT_EDITOR = "true"` and `$env:GIT_SEQUENCE_EDITOR = "true"` automatically.

### Interactive Rebase Tree

```powershell
# Rebase entire tree interactively (recommended)
make rebase-tree

# Or directly with script
.\scripts\rebase-branch-tree.ps1
```

### Automated Rebase Tree

```powershell
# Auto-rebase entire tree (no prompts)
make rebase-tree-auto

# With skip-commits file (after squashing)
make rebase-tree-skip SKIP_COMMITS_FILE="skip-commits.txt"
```

### Cascade Rebase

```powershell
# Cascade rebase from current branch
git checkout parent-branch
twig cascade --show-graph --autostash

# Skip specific commits during cascade
twig cascade --skip-commits abc1234,def5678
```

### Check Unique Commits

```powershell
# See commits unique to current branch
git log --oneline parent-branch..current-branch

# Count commits
git rev-list --count parent-branch..current-branch
```

## Expected Output

- **Tree View**: Hierarchical display of branch dependencies
- **Commit Counts**: `[+N]` notation showing unique commits per branch
- **Current Branch**: Marked with `(current)` indicator

## Reading the Tree Output

```
main
├── LS-7/design-league-scoring-data-model                  [+23]
│   └── LS-17/set-up-matchup-system (current)              [+1]
│       └── LS-18/extend-matchup-schema                    [+1]
└── LS-10/refactor-scoring-library                         [+15/-1]
```

**Indicators**:

- `[+1]` = 1 unique commit ✅ (clean)
- `[+25]` = 25 commits ⚠️ (likely has duplicates)
- `[+23/-24]` = Many changes 🚨 (definitely has duplicates)

## Common Issues

### Issue: High commit count in branch

**Symptom**: Branch shows `[+25]` but should be `[+1]`
**Cause**: Duplicate commits from parent branch
**Solution**: Use skip-commits to rebase cleanly

```powershell
# 1. Identify removed commits from parent
git log --oneline parent..current

# 2. Create skip-commits file
@"
abc1234  # Duplicate from parent
def5678  # Another duplicate
"@ | Out-File skip-commits.txt

# 3. Rebase with skip-commits
make rebase-tree-skip SKIP_COMMITS_FILE="skip-commits.txt"
```

### Issue: Branch not showing in tree

**Solution**: Verify twig knows about the branch

```powershell
# Re-initialize twig
twig init

# Set branch parent manually if needed
twig branch --set-parent parent-branch
```

### Issue: Rebase conflicts during cascade

**Solution**: Resolve conflicts or skip duplicate commits

```powershell
# For duplicate commits, skip them
git rebase --skip

# For real conflicts, resolve them
git add .
git rebase --no-edit --continue
```

### Issue: Lost commits after rebase

**Solution**: Use reflog to recover

```powershell
# View reflog
git reflog

# Reset to previous state
git reset --hard HEAD@{N}
```

## Best Practices

1. **Check tree frequently** - Run `twig tree` after each branch creation
2. **Keep branches at [+1]** - Each branch should have only its unique work
3. **Use skip-commits after squashing** - Prevents conflicts when cascading
4. **Verify before force-push** - Check tree is clean first
5. **Plan tree structure** - Document parent-child relationships before starting

## Branch Tree Patterns

### Clean Tree (Desired)

```
LS-17 [+1]  ← Only its commit
└── LS-18 [+1]  ← Only its commit
    └── LS-19 [+1]  ← Only its commit
```

### Dirty Tree (Avoid)

```
LS-17 [+23]  ← Has 23 commits
└── LS-18 [+25]  ← Has LS-17's 23 + its 2 = 25
    └── LS-19 [+27]  ← Has everything above + its 2 = 27
```

## Creating Dependent Branches Correctly

```powershell
# ✅ CORRECT: Create from specific parent
git checkout parent-branch-name
twig switch LS-1234 -p=current

# ❌ WRONG: Create from main
git checkout main
twig switch LS-1234  # Will not include parent's changes
```

## Skip-Commits Pattern (After Squashing)

**The recommended workflow after squashing a parent branch**:

```powershell
# 1. Squash parent branch
git checkout LS-23/parent-branch
git rebase -i main  # Squash to 1 commit

# 2. Identify commits removed by squash
git checkout LS-24/child-branch
git log --oneline LS-23/parent-branch..HEAD
# Shows old commits that were squashed away

# 3. Create skip-commits file with old hashes
@"
abc1234  # Old commit removed during squash
def5678  # Another old commit
"@ | Out-File skip-commits.txt

# 4. Rebase tree skipping those commits
make rebase-tree-skip SKIP_COMMITS_FILE="skip-commits.txt"

# 5. Verify clean history
twig tree
# All branches should show [+1]
```

## Integration with Workflow

### Before Creating Multiple Dependent Branches

```powershell
# 1. Plan the tree structure (document it)
# LS-17: Base setup (from main)
# LS-18: Database (from LS-17)
# LS-19: GraphQL (from LS-18)
# LS-20: Scheduling (from LS-19)

# 2. Create base branch
git checkout main; git pull
twig switch LS-17

# 3. Create dependent branches one at a time
git checkout LS-17/branch-name
twig switch LS-18 -p=current

# 4. Verify after each creation
twig tree
```

### After Squashing Commits

```powershell
# 1. Use skip-commits pattern (see above)
# 2. Verify tree is clean
twig tree
# 3. Force push if needed
git push --force-with-lease
```

## Automated Rebase Scripts

### Interactive Rebase (Recommended)

```powershell
# Script handles conflicts automatically
make rebase-tree

# Or with PowerShell script
.\scripts\rebase-branch-tree.ps1
```

### Skip-Commits Rebase

```powershell
# After creating skip-commits.txt
make rebase-tree-skip SKIP_COMMITS_FILE="skip-commits.txt"

# Or pass hashes directly
make rebase-tree-skip SKIP_COMMITS="abc1234,def5678"
```

## Exit Codes

- **0**: Command successful
- **Non-zero**: Error occurred (check error message)

## Related Skills

- [Branch Creation](branch-create.md) - Creating feature branches
- [Create PR](create-pr.md) - Creating pull requests
- [Nx Reset](nx-reset.md) - Clearing caches if rebases cause issues

## Related Documentation

- [Branch Tree Management Guide](../../../docs/guides/branch-tree-management.md) ⭐ Complete guide
- [Development Workflow CSV](../../../docs/agents/development-workflow.csv)
- [Common Pitfalls CSV](../../../docs/agents/common-pitfalls.csv)
