# Claude Skill: Squash and Cascade

## Purpose

This skill enables Claude to squash all commits in a branch into a single commit, automatically track the squashed commit hashes, and cascade the changes to child branches without conflicts.

---

## Core Capabilities

### 1. Branch Squashing
- Squash all commits in a branch into one
- Preserve commit messages for reference
- Maintain clean, reviewable history

### 2. Skip-Commits Tracking
- Automatically identify squashed commit hashes
- Add old hashes to skip-commits.txt
- Prevent cascade conflicts from removed commits

### 3. Automated Cascading
- Propagate squashed branch to children
- Handle empty commits gracefully
- Update entire branch tree efficiently

---

## Key Commands & Tools

### Squash Commands

```powershell
# Squash current branch (interactive)
.\scripts\squash-current-branch.ps1

# Squash specific branch
.\scripts\squash-branch.ps1 -Branch LS-XX/branch-name

# Squash and cascade automatically
.\scripts\squash-branch.ps1 -Branch LS-XX/branch-name -Cascade
```

### Skip-Commits Management

```powershell
# View commits before squash (to track later)
git log --oneline parent..branch

# Add squashed commits to skip list
git log --oneline --format="%h" parent..branch >> skip-commits.txt

# View current skip list
Get-Content skip-commits.txt
```

### Cascade After Squash

```powershell
# Cascade from current branch with skip list
twig cascade --no-interactive --skip-commits skip-commits.txt

# Full automated rebase tree
make rebase-tree-auto
```

---

## Decision Tree for Squash and Cascade

### Step 1: Assess Current State

**Questions to Ask:**
1. Which branch needs to be squashed?
2. Does the branch have child branches?
3. Is skip-commits.txt up-to-date?
4. How many commits will be squashed?

**Actions:**
```powershell
# View branch tree to identify children
twig tree

# Count commits to squash
git log --oneline parent-branch..current-branch

# Check for existing skip list
Test-Path skip-commits.txt
```

### Step 2: Capture Commits Before Squashing

**Critical:** Must record commit hashes BEFORE squashing, as they will be replaced.

```powershell
# Get the branch and parent names
$branch = git rev-parse --abbrev-ref HEAD
$parent = twig tree --format json | ConvertFrom-Json | 
    Where-Object { $_.name -eq $branch } | 
    Select-Object -ExpandProperty parent

# Capture commits that will be squashed away
$commitsToSkip = git log --oneline --format="%h" "$parent..$branch"
Write-Host "Commits to be squashed:" -ForegroundColor Yellow
$commitsToSkip | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

# Save to temporary variable for later use
$squashedCommits = $commitsToSkip
```

### Step 3: Perform Squash

```powershell
# Option A: Use existing script (if available)
.\scripts\squash-current-branch.ps1

# Option B: Manual squash
git reset --soft parent-branch
git commit -m "feat(scope): consolidated changes

Previous commits:
$(git log --oneline HEAD..ORIG_HEAD | Out-String)
"
```

### Step 4: Update Skip-Commits File

**Format:** Comments on separate lines (per skill guidelines)

```powershell
# Add header
$content = Get-Content skip-commits.txt -ErrorAction SilentlyContinue
$content += ""
$content += "# Squashed in $branch on $(Get-Date -Format 'yyyy-MM-dd')"

# Add each squashed commit hash
foreach ($hash in $squashedCommits) {
    $content += $hash
}

# Write back to file
$content | Set-Content skip-commits.txt

Write-Host "`n✓ Added $($squashedCommits.Count) commits to skip-commits.txt" -ForegroundColor Green
```

### Step 5: Cascade to Child Branches

**Choose strategy based on tree structure:**

**For single branch or small tree:**
```powershell
# Cascade from current branch
twig cascade --no-interactive --skip-commits skip-commits.txt
```

**For large tree:**
```powershell
# Automated rebase entire tree
make rebase-tree-auto
```

### Step 6: Handle Empty Commits

If cascade encounters empty commits (as expected):

```powershell
# The cascade will report errors like:
# "Failed to cherry-pick commit abc1234: The previous cherry-pick is now empty"

# Add to skip list
$content = Get-Content skip-commits.txt
$content += "# Empty after cascade from squashed $branch ($(Get-Date -Format 'yyyy-MM-dd'))"
$content += "abc1234"
$content | Set-Content skip-commits.txt

# Continue cascade from failed branch
git checkout LS-YY/child-branch
twig cascade --no-interactive --skip-commits skip-commits.txt
```

### Step 7: Verify Results

```powershell
# Check branch tree
twig tree

# Expected results:
# - Current branch shows [+1] (single squashed commit)
# - Child branches show [up-to-date] or low [+N]
# - No high commit counts like [+23]

# Verify specific branch
git log --oneline HEAD~5..HEAD  # Check last 5 commits
```

---

## Common Scenarios

### Scenario 1: Squash Single Branch with No Children

**Context:** Simple branch ready for PR, needs clean history.

**Solution:**
```powershell
# 1. Capture commits to squash (not needed if no children, but good practice)
$branch = git rev-parse --abbrev-ref HEAD
$parent = "main"  # or actual parent
$commits = git log --oneline --format="%h" "$parent..$branch"

# 2. Squash
git reset --soft $parent
git commit -m "feat: consolidated feature implementation"

# 3. No cascade needed - no children!
Write-Host "✓ Branch squashed successfully" -ForegroundColor Green
```

### Scenario 2: Squash Branch with Multiple Children

**Context:** Parent branch ready for PR, multiple child branches depend on it.

**Solution:**
```powershell
# 1. Check tree structure
twig tree | Select-String "LS-XX"

# 2. Capture commits BEFORE squash
git checkout LS-XX/parent-branch
$parent = "main"  # or actual parent
$squashedCommits = git log --oneline --format="%h" "$parent..HEAD"

Write-Host "Will squash $($squashedCommits.Count) commits:" -ForegroundColor Yellow
$squashedCommits | ForEach-Object { Write-Host "  $_" }

# 3. Squash
git reset --soft $parent
git commit -m "feat(scope): consolidated parent branch work"

# 4. Add to skip-commits.txt
$content = Get-Content skip-commits.txt -ErrorAction SilentlyContinue
$content += ""
$content += "# Squashed in LS-XX/parent-branch on $(Get-Date -Format 'yyyy-MM-dd')"
foreach ($hash in $squashedCommits) {
    $content += $hash
}
$content | Set-Content skip-commits.txt

# 5. Cascade to children
twig cascade --no-interactive --skip-commits skip-commits.txt

# 6. Handle any empty commits that arise
# (Follow Step 6 from decision tree as needed)
```

### Scenario 3: Squash Entire Branch Tree Before PR

**Context:** Feature complete, want to squash all branches before creating PRs.

**Solution:**
```powershell
# 1. Start from root branch
git checkout LS-XX/root-branch
twig tree  # View structure

# 2. Use squash tree script if available
.\scripts\squash-tree.ps1

# OR manually squash each branch bottom-up:

# Squash leaf branches first (no children)
git checkout LS-YY/leaf-branch
$parent = "LS-XX/root-branch"
$commits = git log --oneline --format="%h" "$parent..HEAD"
git reset --soft $parent
git commit -m "feat: consolidated leaf work"

# Then squash parent branches
git checkout LS-XX/root-branch
$parent = "main"
$commits = git log --oneline --format="%h" "$parent..HEAD"

# Add ALL commits to skip list
$content = Get-Content skip-commits.txt -ErrorAction SilentlyContinue
$content += ""
$content += "# Squashed tree LS-XX on $(Get-Date -Format 'yyyy-MM-dd')"
foreach ($hash in $commits) {
    $content += $hash
}
$content | Set-Content skip-commits.txt

git reset --soft $parent
git commit -m "feat: consolidated feature implementation"

# Cascade
twig cascade --no-interactive --skip-commits skip-commits.txt
```

### Scenario 4: Squash After PR Review Changes

**Context:** Made multiple review fix commits, want to squash before merge.

**Solution:**
```powershell
# 1. Identify commits since review started
git log --oneline HEAD~10..HEAD

# 2. Capture original commits (before review fixes)
git checkout LS-XX/branch
$parent = "main"
$allCommits = git log --oneline --format="%h" "$parent..HEAD"

# 3. Interactive squash last N commits (review fixes)
git rebase -i HEAD~5  # Adjust number as needed
# Mark commits to squash in editor

# 4. If this branch has children, add removed commits to skip list
# (only if children exist!)
twig tree | Select-String "LS-XX"
# If children found, add the squashed review commits to skip list
```

---

## Automation Script Template

For frequently used workflows, create a script:

```powershell
# squash-and-cascade.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$Branch,
    
    [string]$CommitMessage,
    
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "Squash and Cascade Workflow" -ForegroundColor Cyan
Write-Host "Branch: $Branch" -ForegroundColor Yellow

# Step 1: Get branch info
git checkout $Branch
$parent = twig tree --format json | ConvertFrom-Json | 
    Where-Object { $_.name -eq $Branch } | 
    Select-Object -ExpandProperty parent

Write-Host "Parent: $parent" -ForegroundColor Yellow

# Step 2: Capture commits to squash
Write-Host "`nCapturing commits to squash..." -ForegroundColor Yellow
$squashedCommits = git log --oneline --format="%h" "$parent..$Branch"
$commitCount = ($squashedCommits | Measure-Object).Count

Write-Host "Found $commitCount commits to squash:" -ForegroundColor Green
$squashedCommits | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

if ($DryRun) {
    Write-Host "`nDRY RUN - Would add these to skip-commits.txt" -ForegroundColor Magenta
    exit 0
}

# Step 3: Squash
Write-Host "`nSquashing commits..." -ForegroundColor Yellow
$commitHistory = git log --oneline "$parent..$Branch" | Out-String

if (-not $CommitMessage) {
    $scope = $Branch -replace 'LS-\d+/', '' -replace '-', ' '
    $CommitMessage = "feat($scope): consolidated changes"
}

git reset --soft $parent
$fullMessage = @"
$CommitMessage

Squashed commits:
$commitHistory
"@

git commit -m $fullMessage
Write-Host "✓ Squashed into single commit" -ForegroundColor Green

# Step 4: Update skip-commits.txt
Write-Host "`nUpdating skip-commits.txt..." -ForegroundColor Yellow
$content = Get-Content skip-commits.txt -ErrorAction SilentlyContinue
$content += ""
$content += "# Squashed in $Branch on $(Get-Date -Format 'yyyy-MM-dd')"
foreach ($hash in $squashedCommits) {
    $content += $hash
}
$content | Set-Content skip-commits.txt
Write-Host "✓ Added $commitCount commits to skip list" -ForegroundColor Green

# Step 5: Cascade
Write-Host "`nCascading to child branches..." -ForegroundColor Yellow
twig cascade --no-interactive --skip-commits skip-commits.txt

Write-Host "`n✓ Squash and cascade complete!" -ForegroundColor Green
Write-Host "Review with: twig tree" -ForegroundColor Cyan
```

**Usage:**
```powershell
.\scripts\squash-and-cascade.ps1 -Branch LS-XX/branch-name
.\scripts\squash-and-cascade.ps1 -Branch LS-XX/branch -CommitMessage "feat: new feature"
.\scripts\squash-and-cascade.ps1 -Branch LS-XX/branch -DryRun
```

---

## Interactive Prompts Guide

When guiding a user through squash and cascade:

### Initial Assessment
1. "Let me check your branch tree structure..."
   - Run `twig tree`
   - Identify branch and children

2. "I'll capture the commits that will be squashed..."
   - Show commit count and hashes
   - Confirm with user before proceeding

### During Squash
1. "Squashing N commits into one..."
   - Show what commits are being combined
   - Display new commit message

2. "Adding squashed commits to skip-commits.txt..."
   - Show how many hashes added
   - Explain why this prevents conflicts

### During Cascade
1. If empty commit errors:
   - "The cascade encountered an empty commit (expected after squash)"
   - "Adding it to skip list and continuing..."
   - Auto-handle without user intervention

### Post-Squash Validation
1. "Let me verify the squash results..."
   - Run `twig tree`
   - Check current branch shows [+1]
   - Verify children show [up-to-date] or low counts

2. "Would you like me to verify specific branches?"
   - Offer to compare branches
   - Show commit logs if requested

---

## Skip-Commits File Management

### After Squashing

**Pattern:**
```
# Squashed in LS-XX/branch-name on 2026-01-11
abc1234
def5678
ghi9012
```

### After Cascade with Empty Commits

**Pattern:**
```
# Squashed in LS-XX/parent on 2026-01-11
abc1234
def5678

# Empty after cascade from squashed LS-XX/parent (2026-01-11)
jkl3456
```

### Best Practices

1. **Group by operation**: Keep squashed commits together
2. **Date everything**: Include date in comments
3. **Reference branch**: Note which branch was squashed
4. **Separate empty commits**: Mark cascade-generated empties separately

---

## Error Messages & Solutions

### "Cannot squash - not enough commits"

**Meaning:** Branch only has 1 commit, nothing to squash.

**Solution:**
```powershell
# Check commit count
git log --oneline parent..branch | Measure-Object -Line

# If only 1 commit, squashing not needed
Write-Host "Branch already has single commit" -ForegroundColor Green
```

### "fatal: ambiguous argument 'parent..branch'"

**Meaning:** Parent branch name incorrect or doesn't exist.

**Solution:**
```powershell
# Verify parent exists
git rev-parse --verify parent-branch

# Check twig tree for actual parent
twig tree | Select-String "current-branch"
```

### "Cascade failed - branch has conflicts"

**Meaning:** Real conflicts (not just empty commits) detected.

**Solution:**
```powershell
# Check what failed
git status

# If real conflict, manual resolution required
# See cascading-rebase-skill.md Step 5 for conflict resolution
```

### High commit counts after cascade

**Meaning:** Skip list incomplete, duplicates remain.

**Solution:**
```powershell
# Identify missing commits
git log --oneline parent..branch

# Compare to skip-commits.txt
Get-Content skip-commits.txt

# Add missing hashes
# Re-run cascade
```

---

## Validation Checklist

After completing squash and cascade:

- [ ] Current branch shows [+1] (single commit)
- [ ] Skip-commits.txt contains all squashed hashes
- [ ] Child branches show [up-to-date] or low [+N]
- [ ] No high commit counts in tree
- [ ] Commit message is clear and descriptive
- [ ] All squashed commit messages captured in new commit body
- [ ] No uncommitted changes in working directory
- [ ] Branch tree structure intact (no broken dependencies)

---

## Quick Reference Card

```powershell
# Essential Commands
twig tree                                          # View structure
git log --oneline parent..branch                   # Count commits
git log --oneline --format="%h" parent..branch     # Get hashes

# Squash Workflow
$commits = git log --oneline --format="%h" "$parent..$branch"  # Capture
git reset --soft $parent                           # Reset to parent
git commit -m "feat: consolidated"                 # New commit
$commits | Add-Content skip-commits.txt            # Track old hashes

# Cascade
twig cascade --no-interactive --skip-commits skip-commits.txt
make rebase-tree-auto                              # Alternative

# Verification
twig tree                                          # Check results
git log --oneline HEAD~5..HEAD                     # Recent commits
```

---

## AI Agent Guidelines

When operating as an AI agent helping with squash and cascade:

### DO:
- ✅ Always capture commit hashes BEFORE squashing
- ✅ Verify branch has children before planning cascade
- ✅ Show user what commits will be squashed
- ✅ Update skip-commits.txt with clear comments
- ✅ Handle empty commits automatically during cascade
- ✅ Verify results with `twig tree` after completion
- ✅ Preserve commit messages in squashed commit body
- ✅ Use conventional commit format for squashed message

### DON'T:
- ❌ Squash without capturing old hashes first
- ❌ Skip updating skip-commits.txt
- ❌ Force-push without confirming with user
- ❌ Lose commit message history
- ❌ Cascade without skip list when children exist
- ❌ Ignore empty commit errors (add to skip list)
- ❌ Proceed if skip-commits.txt is incomplete

### Error Handling:
1. **Capture error details** - Full message important
2. **Check error type** - Empty commit vs real conflict
3. **Update skip list** - If empty commit
4. **Continue cascade** - From next branch
5. **Verify fix** - Check tree state

---

## Integration with Other Skills

### Relationship to Cascading Rebase Skill

**Squash and Cascade** → Generates commits to skip
**Cascading Rebase** → Consumes skip-commits.txt

**Combined workflow:**
```
1. Squash branch → THIS SKILL
2. Update skip-commits.txt → THIS SKILL
3. Cascade changes → Cascading Rebase Skill
4. Handle empty commits → Both skills
5. Verify results → Both skills
```

### Relationship to Scripts

**squash-branch.ps1** → Individual branch squashing
**squash-tree.ps1** → Entire tree squashing
**rebase-branch-tree.ps1** → Cascading with skip list
**detect-squashed-commits.ps1** → Detect PR squashes (different use case)

---

## Advanced Techniques

### Conditional Squashing

```powershell
# Only squash if more than N commits
$commitCount = (git log --oneline parent..branch | Measure-Object).Count
if ($commitCount -gt 5) {
    Write-Host "Branch has $commitCount commits - squashing recommended"
    # Perform squash
} else {
    Write-Host "Only $commitCount commits - squashing optional"
}
```

### Preserve Specific Commits

```powershell
# Interactive rebase to squash some but keep others
git rebase -i parent-branch

# Mark specific commits as 'pick', others as 'squash'
# Useful for preserving meaningful commits while combining trivial ones
```

### Batch Squash Multiple Branches

```powershell
# Get all branches in a feature tree
$branches = twig tree --format json | ConvertFrom-Json | 
    Where-Object { $_.name -like 'LS-XX/*' }

foreach ($branch in $branches) {
    Write-Host "`nProcessing $($branch.name)..." -ForegroundColor Cyan
    git checkout $branch.name
    # Perform squash workflow
    # Update skip-commits.txt
}

# Final cascade from root
git checkout LS-XX/root
make rebase-tree-auto
```

---

## Troubleshooting Matrix

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Can't find commits to squash | Already squashed or on parent | Check `git log parent..branch` |
| Cascade creates duplicates | Skip list incomplete | Add missing hashes, re-cascade |
| Child shows high commit count | Old commits not in skip list | Identify duplicates, add to skip |
| Lost commit messages | Didn't preserve in body | Check reflog, may need to re-squash |
| Can't cascade after squash | Children not fetched | `git fetch origin`, retry |
| Empty commits accumulating | Normal after squash cascade | Add to skip list, continue |

---

## See Also

- [Cascading Rebase Skill](cascading-rebase-skill.md) - Rebase workflow
- [Rebase Workflow Guide](../guides/rebase-workflow.md) - Full documentation
- [Branch Tree Management](../guides/branch-tree-management.md) - Twig patterns
- [AI Agent Contribution Workflow](../guides/ai-agent-contribution-workflow.md) - Complete workflow

---

**Version:** 1.0.0
**Last Updated:** 2026-01-11
**Maintained by:** Legacy Sports Team
