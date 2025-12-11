# Rebase Workflow Guide

## Overview

This guide documents the repeatable workflow for rebasing complex branch trees in the Legacy Sports codebase.

## Key Concepts

### Skip-Commits File

The `skip-commits.txt` file maintains a list of commit hashes that should be skipped during rebase operations. This prevents conflicts when commits have been:

- Replaced during previous rebases
- Squashed into parent branches
- Duplicated due to branch restructuring
- Left empty after conflict resolution

**Location**: `skip-commits.txt` (in repo root, gitignored)

**Format**:
```
# Comments start with #
abc1234   # Short or full commit hash
def567890abcdef1234567890  # Any length 7-64 chars
```

## Automated Rebase Workflow

### Step 1: Initial Setup

Ensure `skip-commits.txt` exists with relevant commit hashes:

```powershell
# Copy template if starting fresh
Copy-Item skip-commits-template.txt skip-commits.txt

# Or check existing file
Get-Content skip-commits.txt
```

### Step 2: Run Automated Rebase

The `make rebase-tree-auto` command now automatically:
- Uses `skip-commits.txt` if it exists
- Runs cascade with `--no-interactive`
- Handles empty commits gracefully
- Provides clear progress output

```powershell
# Fully automated - no prompts!
make rebase-tree-auto
```

### Step 3: Handle Empty Commits

If cascade stops due to empty commits:

```powershell
# 1. Note the commit hash from error message
#    "Failed to cherry-pick commit 8eb9552: ..."

# 2. Add to skip-commits.txt
Add-Content skip-commits.txt "8eb9552"

# 3. Manually rebase the failed branch
git checkout LS-XX/branch-name
twig rebase --skip-commits skip-commits.txt

# 4. Continue with remaining branches
git checkout LS-YY/next-branch
twig rebase --skip-commits skip-commits.txt
```

### Step 4: Verify Tree

```powershell
twig tree

# Look for:
# - [up-to-date] - Perfect!
# - [+N] - Small numbers indicate unique commits (good)
# - [+N/-M] - Large numbers may indicate duplicates (investigate)
```

## Manual Workflows

### Rebasing a Single Branch

```powershell
git checkout LS-XX/branch-name
twig rebase --skip-commits skip-commits.txt
```

### Cascading from Current Branch

```powershell
git checkout LS-XX/parent-branch
twig cascade --no-interactive --skip-commits skip-commits.txt
```

### Finding Commits to Skip

After restructuring or squashing branches:

```powershell
# See what commits exist in old origin but not in new local
git log --oneline origin/LS-XX/branch..LS-YY/new-parent

# These commits should be added to skip-commits.txt
git log --oneline --format="%h" origin/LS-XX/branch..LS-YY/new-parent | Out-File -Append skip-commits.txt
```

## Common Scenarios

### Moving a Branch to Depend on Main

```powershell
# 1. Get commits from old parent that will be replaced
git log --oneline origin/LS-XX/branch..main | ForEach-Object { ($_ -split ' ')[0] } | Out-File -Append skip-commits.txt

# 2. Change dependency
twig branch remove-dep LS-XX/branch LS-OLD/parent
twig branch depend LS-XX/branch main

# 3. Rebase the tree
make rebase-tree-auto
```

### After Squashing Parent Branch

```powershell
# 1. Identify commits removed during squash
git log --oneline HEAD~10..HEAD  # Check recent squash

# 2. Add old commits to skip-commits.txt
abc1234
def5678

# 3. Cascade without conflicts
git checkout LS-XX/squashed-branch
twig cascade --no-interactive --skip-commits skip-commits.txt
```

### Rebasing Entire Tree from Scratch

```powershell
# 1. Start from the root branch
git checkout LS-20/implement-matchup-scheduling-algorithm

# 2. Run automated rebase
make rebase-tree-auto

# 3. Handle any empty commits as they appear (add to skip-commits.txt)
# 4. Manually rebase failed branches
# 5. Verify with twig tree
```

## Troubleshooting

### "Failed to cherry-pick commit XXX: empty"

**Solution**: Add the commit hash to `skip-commits.txt` and retry.

```powershell
Add-Content skip-commits.txt "abc1234"
twig rebase --skip-commits skip-commits.txt
```

### "Your branch and origin have diverged"

**Expected** after rebasing. Force push after validation:

```powershell
git push --force-with-lease
```

### High +/- Numbers in Tree

**Cause**: Duplicate commits not in skip list.

**Solution**: Find and add duplicates:

```powershell
git log --oneline parent-branch..current-branch | head -20
# Identify duplicates, add to skip-commits.txt
twig rebase --skip-commits skip-commits.txt
```

### Script Still Prompting for Input

**Solution**: Verify script changes were applied:

```powershell
grep -n "Read-Host" scripts/rebase-branch-tree.ps1
# Should return no results in cascade section
```

## Best Practices

1. **Maintain skip-commits.txt**: Add commits as you discover them
2. **Use `make rebase-tree-auto`**: Fully automated, uses skip file
3. **Commit format**: One hash per line, no inline comments
4. **Start from root**: Always rebase from the earliest changed branch
5. **Verify tree**: Run `twig tree` before and after
6. **Force push safely**: Use `--force-with-lease` not `--force`
7. **Keep skip file updated**: After squashing or restructuring

## File Locations

- `skip-commits.txt` - Active skip list (gitignored)
- `skip-commits-template.txt` - Template with instructions
- `scripts/rebase-branch-tree.ps1` - Main rebase script
- `Makefile` - Convenient shortcuts (`make rebase-tree-auto`)

## Related Documentation

- [Branch Tree Management](branch-tree-management.md)
- [AI Agent Contribution Workflow](ai-agent-contribution-workflow.md)
- [agents.md](../../agents.md) - Quick reference commands
