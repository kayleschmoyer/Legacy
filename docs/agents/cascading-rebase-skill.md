# Claude Skill: Cascading Rebase Assistant

## Purpose

This skill enables Claude to guide users through the complex process of rebasing branch trees in the Legacy Sports monorepo, handling dependent branches, skip-commits, and conflict resolution.

---

## Core Capabilities

### 1. Branch Tree Analysis
- Visualize current branch tree structure
- Identify duplicate commits and potential conflicts
- Verify branch dependencies before rebase

### 2. Skip-Commits Management
- Detect commits that should be skipped
- Maintain skip-commits.txt file
- Handle squashed commits and rewrites

### 3. Automated Rebase Orchestration
- Execute automated cascading rebases
- Handle empty commits gracefully
- Resolve generated file conflicts

### 4. Conflict Resolution
- Guide through manual conflict resolution
- Auto-resolve generated file conflicts
- Update skip lists after rewrites

---

## Key Commands & Tools

### Branch Tree Inspection

```powershell
# View complete tree structure
twig tree

# View tree from specific branch
git checkout LS-XX/branch
twig tree

# Check for branch tree via make
make branch-tree
```

### Automated Rebase Workflows

```powershell
# Fully automated - no prompts, uses skip-commits.txt
make rebase-tree-auto

# Interactive rebase with prompts
make rebase-tree

# Manual single branch rebase with skip commits
git checkout LS-XX/branch
twig rebase --skip-commits skip-commits.txt

# Cascade from current branch
twig cascade --no-interactive --skip-commits skip-commits.txt
```

### Skip-Commits Management

```powershell
# Initialize skip-commits.txt
Copy-Item skip-commits-template.txt skip-commits.txt

# View current skip list
Get-Content skip-commits.txt

# Add a commit to skip list (with metadata)
Add-Content skip-commits.txt "abc1234  # squashed in LS-XX, added $(Get-Date -Format 'yyyy-MM-dd')"

# Auto-detect squashed commits (after PR merge)
.\scripts\detect-squashed-commits.ps1

# Detect commits to skip after restructuring
.\scripts\detect-skip-commits.ps1
```

### Conflict Resolution

```powershell
# Auto-resolve generated file conflicts (codegen, etc.)
.\scripts\resolve-generated-conflicts.ps1

# Manual resolution workflow
git status
# Edit conflicted files
git add .
git rebase --continue
```

---

## Decision Tree for Rebase Operations

### Step 1: Assess Current State
PR been merged on GitHub recently?
3. Has any parent branch been manually squashed recently?
4. Are there known duplicate commits in the tree?
5. Does skip-commits.txt exist and is it up-to-date?

**Actions:**
```powershell
# Check current tree state
twig tree

# Look for warning signs:
# - High commit counts [+23] when expecting [+1]
# - [+N/-M] patterns indicating duplicates
# - Outdated branch indicators

# Check for squashed commits after PR merge
.\scripts\detect-squashed-commits.ps1 -DryRun
# - High commit counts [+23] when expecting [+1]
# - [+N/-M] patterns indicating duplicates
# - Outdated branch indicators
```

### Step 2: Prepare Skip-Commits

**Check for squashed commits (PR merged on GitHub):**
```powershell
# Auto-detect squashed commits
.\scripts\detect-squashed-commits.ps1

# Dry run to see what would be added
.\scripts\detect-squashed-commits.ps1 -DryRun

# Check specific branch
.\scripts\detect-squashed-commits.ps1 -Branch LS-XX/branch -Parent LS-YY/parent
```

**If parent branches were manually squashed:**
```powershell
# 1. Identify old commits that were squashed
git log --oneline origin/LS-XX/branch..parent-branch

# 2. Add to skip-commits.txt
git log --oneline --format="%h" origin/LS-XX/branch..parent-branch >> skip-commits.txt

# 3. Add metadata comments
"abc1234  # Squashed into LS-XX on $(Get-Date -Format 'yyyy-MM-dd')"
```

**If skip-commits.txt doesn't exist:**
```powershell
# Use template or create fresh
if (Test-Path skip-commits-template.txt) {
    Copy-Item skip-commits-template.txt skip-commits.txt
} else {
    New-Item skip-commits.txt -ItemType File
}
```

### Step 3: Choose Rebase Strategy

**For automated, unattended rebase:**
```powershell
make rebase-tree-auto
```

**Use when:**
- Skip-commits.txt is comprehensive
- No complex conflicts expected
- You want zero prompts

**For interactive rebase with guidance:**
```powershell
make rebase-tree
```

**Use when:**
- First time rebasing this tree
- Uncertain about skip commits
- Want to approve each step

**For single branch rebase:**
```powershell
git checkout LS-XX/branch
twig rebase --skip-commits skip-commits.txt
```

**Use when:**
- Testing rebase on one branch first
- Fixing a specific branch after tree rebase
- Manual control needed

### Step 4: Handle Empty Commits

**If rebase stops with empty commit error:**

```powershell
# Error message shows:
# "Failed to cherry-pick commit 8eb9552: The previous cherry-pick is now empty"

# 1. Add commit to skip list
Add-Content skip-commits.txt "8eb9552  # Empty after rebase on $(Get-Date -Format 'yyyy-MM-dd')"

# 2. Continue with that branch manually
git rebase --skip
# or
git rebase --abort
twig rebase --skip-commits skip-commits.txt

# 3. Continue cascade from next branch
git checkout LS-YY/next-branch
twig rebase --skip-commits skip-commits.txt
```

### Step 5: Handle Conflicts

**For generated file conflicts (codegen, schema, etc.):**
```powershell
# Auto-resolve common generated files
.\scripts\resolve-generated-conflicts.ps1

# If successful, continue
git rebase --continue
```

**For real code conflicts:**
```powershell
# 1. Check conflict status
git status

# 2. Open conflicted files and resolve manually
# - Look for <<<<<<< HEAD markers
# - Choose correct version or merge both
# - Remove conflict markers

# 3. Stage resolved files
git add path/to/resolved/file.ts

# 4. Record the rewrite (CRITICAL for downstream)
$oldHash = "abc1234"  # From rebase error message
git rebase --continue
$newHash = git rev-parse HEAD

# 5. Update skip-commits.txt for downstream branches
Add-Content skip-commits.txt "$oldHash  # Replaced by $newHash after conflict resolution in LS-XX on $(Get-Date -Format 'yyyy-MM-dd')"

# 6. Continue cascade with updated skip list
git checkout LS-YY/next-branch
twig rebase --skip-commits skip-commits.txt
```

### Step 6: Verify Results

```powershell
# 1. Check tree structure
twig tree

# Expected results:
# - [up-to-date] for unchanged branches
# - [+1] or [+2] for branches with unique commits
# - No high numbers like [+23] (indicates duplicates)

# 2. Verify specific branches
git checkout LS-XX/branch
git log --oneline HEAD~5..HEAD  # Check last 5 commits

# 3. Compare to parent
git log --oneline parent-branch..LS-XX/branch  # Should only show unique commits
```

---

## Common Scenarios

### Scenario 1: After PR Merged with Squash on GitHub

**Context:** A PR was merged on GitHub with squash merge, and child branch now has redundant commits.

**Solution:**
```powershell
# 1. Auto-detect and add squashed commits to skip list
.\scripts\detect-squashed-commits.ps1

# Output shows:
# ✓ No changes detected between branches
# All commits have been squashed into parent!
# ✓ Successfully added 3 commit(s) to skip-commits.txt

# 2. Rebase child branches with updated skip list
git checkout LS-XX/child-branch
twig rebase --skip-commits skip-commits.txt

# Or cascade from parent
git checkout LS-XX/parent-branch
twig cascade --no-interactive --skip-commits skip-commits.txt
```

### Scenario 1b: After Manually Squashing Parent Branch

**Context:** You manually squashed commits in a parent branch, now child branches have duplicates.

**Solution:**
```powershell
# 1. Identify commits removed during squash
git checkout LS-XX/squashed-parent
git log --oneline HEAD~10..HEAD

# 2. Add old commit hashes to skip-commits.txt
# (The commits that were squashed away)
Add-Content skip-commits.txt "abc1234  # Squashed in LS-XX"
Add-Content skip-commits.txt "def5678  # Squashed in LS-XX"

# 3. Cascade without conflicts
twig cascade --no-interactive --skip-commits skip-commits.txt
```

### Scenario 2: Moving Branch to Different Parent

**Context:** You want to change a branch's parent dependency.

**Solution:**
```powershell
# 1. Collect commits from old parent that will be replaced
git log --oneline origin/LS-XX/branch..new-parent | ForEach-Object {
    ($_ -split ' ')[0]
} | Out-File -Append skip-commits.txt

# 2. Change dependency
twig branch remove-dep LS-XX/branch LS-OLD/parent
twig branch depend LS-XX/branch new-parent

# 3. Rebase the tree
make rebase-tree-auto
```

### Scenario 3: Fresh Rebase of Entire Tree

**Context:** Starting fresh rebase of a complex tree structure.

**Solution:**
```powershell
# 1. Ensure skip-commits.txt is current
Get-Content skip-commits.txt  # Review existing

# 2. Start from root branch
git checkout LS-20/root-branch

# 3. Run automated rebase
make rebase-tree-auto

# 4. Monitor output for any stops

# 5. If stops occur, handle as per Step 4 or 5 above

# 6. Verify final state
twig tree
```

### Scenario 4: Resolving Conflict with Critical Rewrite

**Context:** A conflict required manual resolution, creating a new commit hash.

**Solution:**
```powershell
# During rebase conflict:
# 1. Note the failing commit hash from error
#    "error: could not apply abc1234..."

# 2. Resolve conflict
# Edit files, fix conflicts

# 3. Stage and continue
git add .
git rebase --continue

# 4. Capture new hash
$newHash = git rev-parse HEAD

# 5. Document the rewrite (CRITICAL!)
Add-Content skip-commits.txt "abc1234  # Rewritten as $newHash during LS-XX rebase with conflicts"

# 6. Cascade downstream with updated list
git checkout LS-YY/child-branch
twig cascade --no-interactive --skip-commits skip-commits.txt
```

---

## Interactive Prompts Guide

When guiding a user through rebase operations, use this question flow:

### Initial Assessment
1. "Let me check your current branch tree structure..."
   - Run `twig tree`
   - Analyze output for issues

2. "Have any parent branches been squashed recently?"
   - If YES → Need to collect skip commits
   - If NO → Proceed with existing skip list

3. "Does skip-commits.txt exist?"
   - Run `Test-Path skip-commits.txt`
   - If NO → Offer to create from template

### During Rebase
1. If empty commit error:
   - "The rebase stopped due to an empty commit. I'll add it to the skip list."
   - Add to skip-commits.txt
   - Continue rebase

2. If conflict detected:
   - "There's a conflict. Let me check if it's in generated files..."
   - Try `resolve-generated-conflicts.ps1`
   - If that fails → Guide through manual resolution

### Post-Rebase Validation
1. "Let me verify the rebase results..."
   - Run `twig tree`
   - Check for unexpected commit counts
   - Verify [up-to-date] or low [+N] values

2. "Would you like me to check specific branches?"
   - Offer to compare branch to parent
   - Show unique commits

---

## Skip-Commits File Format

### Structure
```
# Lines starting with # are comments
# Commit hashes can be short (7 char) or full (40 char)
# Inline comments after hash explain context

abc1234  # Squashed in LS-25 on 2026-01-11
def5678  # Replaced by 9012345 after conflict resolution
fed9876  # Empty after rebase
```

### Best Practices
- Always add comments explaining WHY a commit is skipped
- Include date when skip was added
- Reference ticket number (LS-XX) when relevant
- For rewrites, note both old and new hash

### Common Skip Reasons
- `# Squashed in LS-XX` - Commit was squashed into parent
- `# Replaced by <new-hash> after conflict` - Rewritten during conflict resolution
- `# Empty after rebase` - Became empty during rebase
- `# Duplicate from <branch>` - Duplicate commit from another branch
- `# Already in <parent>` - Already exists in parent branch

---

## Error Messages & Solutions

### "Failed to cherry-pick commit XXX: The previous cherry-pick is now empty"
**Meaning:** Commit became empty (no changes) during rebase.

**Solution:**
```powershell
Add-Content skip-commits.txt "XXX  # Empty after rebase"
git rebase --skip  # or restart with updated skip list
```

### "error: could not apply XXX..."
**Meaning:** Merge conflict detected.

**Solution:**
1. Check if generated files: `.\scripts\resolve-generated-conflicts.ps1`
2. If not resolved, manual fix required
3. Remember to record rewrite in skip-commits.txt

### "twig: fatal: reference is not a tree"
**Meaning:** Branch reference is invalid or doesn't exist.

**Solution:**
```powershell
# Check if branch exists
git branch -a | grep branch-name

# If remote but not local
git fetch origin
git checkout -b branch-name origin/branch-name

# If doesn't exist anywhere
# May need to recreate from backup or skip in tree
```

### Large commit counts like [+23] after rebase
**Meaning:** Duplicate commits exist in the tree.

**Solution:**
```powershell
# 1. Compare to parent
git log --oneline parent..branch

# 2. Identify duplicates
# 3. Add to skip-commits.txt
# 4. Rebase again
```

---

## Validation Checklist

After completing a cascade rebase:

- [ ] Run `twig tree` and verify structure
- [ ] Check all branches show [up-to-date] or low [+N] counts
- [ ] No branches showing high numbers like [+23]
- [ ] Spot-check 2-3 branches with `git log --oneline parent..branch`
- [ ] Verify each branch only contains expected commits
- [ ] Skip-commits.txt is updated with any new skips
- [ ] All conflict resolutions are documented in skip-commits.txt
- [ ] No uncommittquashed-commits.ps1                 # Detect squashed commits (PR merges)
.\scripts\detect-skip-commits.ps1                     # Auto-detect other skips
- [ ] All branches pushed to origin if needed

---

## Quick Reference Card

```powershell
# Essential Commands
twig tree                                    # View branch structure
make rebase-tree-auto                        # Auto rebase entire tree
make rebase-tree                             # Interactive rebase
twig rebase --skip-commits skip-commits.txt  # Single branch rebase
twig cascade --no-interactive --skip-commits skip-commits.txt  # Cascade from current

# Skip-Commits Management
Copy-Item skip-commits-template.txt skip-commits.txt  # Initialize
Get-Content skip-commits.txt                          # View
Add-Content skip-commits.txt "hash  # reason"         # Add entry
.\scripts\detect-skip-commits.ps1                     # Auto-detect

# Conflict Resolution
.\scripts\resolve-generated-conflicts.ps1   # Auto-resolve generated files
git status                                  # Check conflict status
git add .                                   # Stage resolved files
git rebase --continue                       # Continue after resolving
git rebase --skip                           # Skip empty commit

# Verification
git log --oneline parent..branch            # Compare to parent
git log --oneline HEAD~5..HEAD              # Recent commits
```

---
PR merges (GitHub squash merges)
- ✅ Run `detect-squashed-commits.ps1` after PR merges
- ✅ Ask about recent manual 
## AI Agent Guidelines

When operating as an AI agent helping with cascading rebases:

### DO:
- ✅ Always run `twig tree` first to assess current state
- ✅ Check for skip-commits.txt before starting any rebase
- ✅ Ask about recent squashes or branch restructuring
- ✅ Explain what each command will do before running it
- ✅ Document all skip-commits with clear reasons
- ✅ Verify results with `twig tree` after rebase
- ✅ Capture rewritten commit hashes during conflict resolution
- ✅ Use `make rebase-tree-auto` for straightforward cases
- ✅ Monitor output for errors and handle gracefully

### DON'T:
- ❌ Skip creating/updating skip-commits.txt when needed
- ❌ Force-push without confirming with user
- ❌ Ignore high commit counts in tree output
- ❌ Proceed with rebase if skip-commits.txt is clearly incomplete
- ❌ Use `git rebase --skip` without adding hash to skip list
- ❌ Forget to document WHY a commit is being skipped
- ❌ Assume all conflicts are generated files (check first)
- ❌ Continue cascade after unresolved conflicts

### Error Handling:
1. **Capture error message** - Full text is important
2. **Check error type** - Empty commit, conflict, or reference error
3. **Apply appropriate solution** - From error messages section above
4. **Update skip list** - If applicable
5. **Retry or continue** - Based on solution
6. **Verify fix worked** - Check tree or branch state
quashed-commits.ps1** → ⭐ Detects commits squashed via PR merge on GitHub
**detect-skip-commits.ps1** → Analyzes tree for commits to skip

### Workflow Integration

```
1. Create branches → branch-create.ps1
2. Develop features → (regular git workflow)
3. Create PR → (GitHub workflow)
4. PR merged (squashed) → GitHub
5. ↓ Triggers need for rebase on child branches
6. Detect squashed → detect-squashed-commits.ps1 ⭐ NEW
7. Perform rebase → THIS SKILL
8. Verify results → twig tree

Alternative (manual squash):
3. Squash when ready → squash-branch.ps1
4. Detect skips → detect-skip-commits.ps1
5. Perform rebase → THIS SKILL
6
### Workflow Integration

```
1. Create branches → branch-create.ps1
2. Develop features → (regular git workflow)
3. Squash when ready → squash-branch.ps1
4. ↓ Triggers need for rebase
5. Detect skips → detect-skip-commits.ps1 (optional)
6. Perform rebase → THIS SKILL
7. Verify results → twig tree
```

---

## Advanced Techniques

### Bulk Skip Detection
```powershell
# Find all commits in origin/branch but not in local parent
git log --oneline --format="%h" origin/LS-XX/branch..local-parent |
    ForEach-Object {
        Add-Content skip-commits.txt "$_  # Detected from origin/branch comparison"
    }
```

### Conditional Skip-Commits
```powershell
# Only skip if commit exists in tree
function Add-SkipIfExists {
    param([string]$Hash)
    if (git rev-parse --verify "$Hash^{commit}" 2>$null) {
        Add-Content skip-commits.txt "$Hash  # Verified exists"
    }
}
```

### Pre-Rebase Validation
```powershell
# Check all branches are up to date with remote
git fetch origin
$branches = twig tree --format json | ConvertFrom-Json
foreach ($branch in $branches) {
    $local = git rev-parse $branch.name
    $remote = git rev-parse "origin/$($branch.name)"
    if ($local -ne $remote) {
        Write-Warning "Branch $($branch.name) out of sync with origin"
    }
}
```

---

## Troubleshooting Matrix

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| High commit counts [+23] | Duplicate commits | Add duplicates to skip-commits.txt |
| Empty commit errors | Commit already applied | Add to skip list, use `git rebase --skip` |
| Merge conflicts in .generated/ | Codegen files conflicting | Run `resolve-generated-conflicts.ps1` |
| "reference is not a tree" | Missing or invalid branch | Fetch remote or recreate branch |
| Rebase stops repeatedly | Incomplete skip list | Run `detect-skip-commits.ps1` |
| Lost work after rebase | Skipped real commits | Check reflog, restore from backup |
| Can't continue cascade | Mid-rebase state | Finish current rebase first |

---

## See Also

- [Rebase Workflow Guide](../guides/rebase-workflow.md) - Full documentation
- [Branch Tree Management](../guides/branch-tree-management.md) - Twig patterns
- [AI Agent Contribution Workflow](../guides/ai-agent-contribution-workflow.md) - Complete workflow
- [Development Workflow CSV](development-workflow.csv) - Quick patterns
- [Common Pitfalls CSV](common-pitfalls.csv) - Mistakes to avoid

---

**Version:** 1.0.0
**Last Updated:** 2026-01-11
**Maintained by:** Legacy Sports Team
