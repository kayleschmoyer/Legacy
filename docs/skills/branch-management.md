# Branch Management Skill

## 🎭 Role

You are a branch management specialist for the Legacy Sports codebase. Your expertise is in creating clean, reviewable branch trees using twig, managing dependent branches, and executing rebase workflows without conflicts or duplicate commits.

## 🌍 Context

### Environment
- **OS**: Windows (PowerShell)
- **Tools**: twig (git wrapper), acli (Jira CLI), git, make
- **Monorepo**: Nx workspace with multiple apps and libraries
- **MCP Support**: Twig MCP server available (prefer MCP tools if supported)

### Key Files
- `skip-commits.txt` - Commits to skip during rebase (gitignored, in repo root)
- `Makefile` - Contains shorthand commands for common operations
- `scripts/branch-create.ps1` - Automated branch creation with Jira integration

### Project Conventions
- **Branch naming**: `LS-###/descriptive-name` or `feature/name`
- **Jira project**: LS
- **Main branch**: `main`

---

## 🔄 Core Workflows

### Workflow 1: Create Branch from Ticket

**When**: Starting work on a Jira ticket

**Steps**:

1. **Verify ticket exists and get details**
   ```powershell
   # Refresh PATH if acli not found
   $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
   
   acli jira workitem view LS-1234
   ```

2. **Add ticket to current sprint** (if not already)
   - Move ticket on Jira board to current sprint
   - Or use acli command if available

3. **Update ticket status to "In Progress"**
   ```powershell
   acli jira workitem transition --key LS-1234 --status "In Progress"
   ```

4. **Create branch using smart script** (Recommended)
   ```powershell
   # From main (default)
   .\scripts\branch-create.ps1 -TicketKey LS-1234
   
   # From current branch (for dependent work)
   .\scripts\branch-create.ps1 -TicketKey LS-1234 -FromCurrent
   ```

5. **Alternative: Manual branch creation**
   ```powershell
   # From main
   git checkout main
   git pull
   twig switch LS-1234
   
   # From current branch
   twig switch LS-1234 -p current
   ```

6. **Verify branch creation**
   ```powershell
   git branch --show-current  # Should show LS-1234/...
   twig tree                  # View branch in tree structure
   ```

### Workflow 2: View and Validate Branch Tree

**When**: Before creating dependent branches, after rebases, regularly during development

**Steps**:

1. **View complete tree structure**
   ```powershell
   twig tree
   # OR use Makefile shorthand
   make branch-tree
   ```

2. **Interpret the output**
   ```
   main
   ├── LS-7/data-model                [+23]
   │   └── LS-17/matchup-system       [+1]  ← Current
   │       └── LS-18/schema           [+1]
   └── feature/other-work             [+5]
   ```

3. **Analyze commit counts**
   - `[+1]` or `[+2]` = ✅ **Perfect** - Clean, unique commits
   - `[+10]` or more = ⚠️ **Warning** - May have parent commits included
   - `[+N/-M]` with large numbers = 🚨 **Problem** - Duplicate commits present

4. **Verify unique commits only**
   ```powershell
   # Check commits in your branch that aren't in parent
   git log --oneline parent-branch..current-branch
   
   # Example
   git log --oneline LS-7/data-model..LS-17/matchup-system
   ```

5. **Expected result**: Should see ONLY commits you authored for this specific ticket

### Workflow 3: Automated Rebase of Branch Tree

**When**: After parent branch changes, after PR merges, before creating PRs

**Steps**:

1. **Ensure skip-commits.txt exists**
   ```powershell
   # Create from template if needed
   if (!(Test-Path skip-commits.txt)) {
       Copy-Item skip-commits-template.txt skip-commits.txt
   }
   
   # View current skip list
   Get-Content skip-commits.txt
   ```

2. **Run automated rebase**
   ```powershell
   make rebase-tree-auto
   ```
   
   This command automatically:
   - Uses `skip-commits.txt` for known problematic commits
   - Runs non-interactively (no prompts)
   - Handles empty commits gracefully
   - Provides progress output

3. **If rebase stops with empty commit error**:
   ```
   Failed to cherry-pick commit 8eb9552: nothing to commit
   ```
   
   Action:
   ```powershell
   # Add hash to skip-commits.txt
   Add-Content skip-commits.txt "8eb9552"
   
   # Continue rebase manually for this branch
   git checkout LS-XX/branch-name
   twig rebase --skip-commits skip-commits.txt
   
   # Resume automated rebase for remaining branches
   make rebase-tree-auto
   ```

4. **Verify success**
   ```powershell
   twig tree
   
   # Look for:
   # [up-to-date] - Perfect, branch is synced
   # [+N] with small N - Good, only your commits
   # [+N/-M] with large numbers - Investigate
   ```

### Workflow 4: Handle Squash-Merge to Main (Automated)

**When**: After merging a PR to main with squash (GitHub's default)

**Problem**: When LS-1 merges to main and gets squashed:
- Main has 1 new commit (the squash)
- Child branches (LS-2, LS-3, LS-4) still have all original commits from LS-1
- Rebasing children onto main will conflict because those commits don't exist anymore

**Solution**: Automatically detect squashed commits and rebase entire tree

**Steps**:

1. **After PR is merged and squashed, pull main**
   ```powershell
   git checkout main
   git pull
   ```

2. **Check which branch needs rebasing** (the one that just merged)
   ```powershell
   # This branch was merged and its PR is closed
   # But local branch still exists
   git checkout LS-1/feature-that-merged
   ```

3. **Detect and add squashed commits automatically**
   ```powershell
   # This script compares branch with main and detects squashed commits
   .\scripts\detect-squashed-commits.ps1 -Branch LS-1/feature-that-merged -Parent main
   
   # Output shows commits added to skip-commits.txt:
   # ✓ Added: abc1234  # Squashed into main
   # ✓ Added: def5678  # Squashed into main
   ```

4. **Update branch parent relationships**
   ```powershell
   # Move all children to depend on main instead of merged branch
   twig branch remove-dep LS-2/child-feature LS-1/feature-that-merged
   twig branch depend LS-2/child-feature main
   
   # Repeat for other children (LS-3, LS-4, etc.)
   ```

5. **Rebase entire tree automatically**
   ```powershell
   make rebase-tree-auto
   # Uses skip-commits.txt automatically - no conflicts!
   ```

6. **Verify tree is clean**
   ```powershell
   twig tree
   
   # Should show:
   # main
   # ├── LS-2/child-feature    [+5]  ← Only its commits
   # │   └── LS-3/...          [+2]  ← Only its commits
   # └── LS-4/...              [+3]  ← Only its commits
   ```

7. **Delete merged branch**
   ```powershell
   git branch -D LS-1/feature-that-merged
   ```

### Workflow 4b: Manual Squash and Cascade

**When**: Manually squashing commits in a branch before merge

**Steps**:

1. **Before squashing, note original commits**
   ```powershell
   git log --oneline --format="%h" LS-1/feature | Tee-Object -Variable originalCommits
   ```

2. **Squash commits**
   ```powershell
   git rebase -i main  # Squash all but first commit
   ```

3. **Add original commits to skip-commits.txt**
   ```powershell
   $originalCommits | ForEach-Object { Add-Content skip-commits.txt $_ }
   ```

4. **Rebase children**
   ```powershell
   make rebase-tree-auto
   ```

### Workflow 5: Create Branch with Dependencies

**When**: Working on a feature that builds on another in-progress feature

**Steps**:

1. **Check out parent branch**
   ```powershell
   git checkout LS-17/parent-feature
   ```

2. **Verify parent is clean**
   ```powershell
   git status  # Should be clean
   twig tree   # Should show reasonable commit count
   ```

3. **Create child branch from current**
   ```powershell
   .\scripts\branch-create.ps1 -TicketKey LS-18 -FromCurrent
   # OR manually:
   # twig switch LS-18 -p current
   ```

4. **Verify branch relationship**
   ```powershell
   twig tree
   
   # Should show:
   # LS-17/parent-feature        [+N]
   # └── LS-18/child-feature     [+0]  ← No commits yet
   ```

5. **Make changes and commit**
   ```powershell
   # Make your changes...
   git add .
   git commit -m "feat(scope): description"
   ```

6. **Verify only new commits**
   ```powershell
   twig tree
   # Should show:
   # LS-17/parent-feature        [+N]
   # └── LS-18/child-feature     [+1]  ← Your commit only!
   
   git log --oneline LS-17/parent-feature..LS-18/child-feature
   # Should show only your commit
   ```

### Workflow 6: Resolve Conflicts During Rebase

**When**: Rebase encounters conflicts that need resolution

**Steps**:

1. **Note the failing commit hash**
   ```
   error: could not apply abc1234... commit message
   ```

2. **Resolve conflicts manually**
   ```powershell
   # Edit conflicted files
   # Then stage them
   git add path/to/file
   
   # Continue rebase
   git rebase --continue
   ```

3. **Record the commit replacement**
   ```powershell
   # Get the NEW hash after conflict resolution
   git log -1 --oneline
   # Output: def5678 commit message
   ```

4. **Update skip-commits.txt**
   ```powershell
   # Add ONLY the old hash with a comment
   Add-Content skip-commits.txt "abc1234  # replaced by def5678 after conflict"
   ```

5. **Continue with cascade**
   ```powershell
   make rebase-tree-auto
   ```

**Critical**: Only add the old hash AFTER the new commit exists. Never pre-populate skip lists with hashes that haven't been rewritten.

---

## ✅ Rules: Always Do

1. **After PR merged with squash, run automated post-merge rebase**
   ```powershell
   make post-merge-rebase BRANCH=LS-1/merged-branch
   ```
   
3. **Check branch tree structure before and after dependent branch creation**
   - Detects squashed commits
   - Updates child dependencies
   - Rebases entire tree
   - No conflicts!

2. **Verify ticket in current sprint before starting work**
4. **Use `make` commands when available**
   - Move ticket if needed
   - Update status to "In Progress"

2. **Check branch tree structure before and after dependent branch creation**
   ```powershell
   twig tree  # Before creating child
   # Create child branch
   twig tree  # Verify relationship
   ```

3. **Use `make` commands when available**
   - `make branch-tree` - View tree
   - `make rebase-tree-auto` - Automated rebase
   - `make post-merge-rebase BRANCH=LS-X` - Post-merge automation
   - `make quick-check` - Fast validation

5. **Verify unique commits only**
   ```powershell
   git log --oneline parent..current
   ```
6. **Use skip-commits.txt after squashing parent branches**
5. **Use skip-commits.txt after squashing parent branches**
   - Prevents conflicts
   - Avoids re-squashing
   - Maintains clean history
7. **Update Jira at key milestones**
6. **Update Jira at key milestones**
   - "In Progress" - When starting work
   - "In Review" - When PR created
   - "Done" - When PR merged
8. **Create branches from main for independent work**
7. **Create branches from main for independent work**
   ```powershell
   git checkout main
   git pull
   twig switch LS-1234
   ```

9. **Create branches from current only for dependent work**
   ```powershell
   git checkout parent-branch
   twig switch LS-1234 -p current
   ```

## ❌ Rules: Never Do

1. **Don't create dependent branches without verifying parent commit count**
   - High `[+N]` in parent = duplicates will cascade to child

2. **Don't ignore high commit counts in branch tree**
   - `[+25]` usually means problem
   - Investigate before proceeding

3. **Don't cascade after squashing without skip-commits.txt**
   - Will cause conflicts
   - Will require re-squashing
   - Will create duplicate work

4. **Don't add commits to skip-commits.txt before they're rewritten**
   - Wait for conflict resolution
   - Get new hash from `git log -1`
   - Then add old hash to skip list

5. **Don't create branches from wrong parent**
   - Independent work = from main
   - Dependent work = from parent branch

6. **Don't skip Jira updates**
   - Team visibility depends on status
   - Affects sprint planning and metrics

7. **Don't use inline comments in skip-commits.txt**
   ```powershell
   # ❌ Wrong
   abc1234  # This is a comment
   
   # ✅ Correct
   # This is a comment
   abc1234
   ```

8. **Don't rebase without checking twig tree first**
   - Need to understand current state
   - Verify what will be affected

9. **Don't mix PowerShell and bash syntax**
   - Use `;` not `&&` for chaining
   - Use `$env:VAR` not `$VAR`

---

## 🚀 Quick Reference

### Common Commands

```powershell
# Branch creation
.\scripts\branch-create.ps1 -TicketKey LS-1234           # From main
.\scripts\branch-create.ps1 -TicketKey LS-1234 -FromCurrent  # From current
twig switch LS-1234                                       # Manual from main
twig switch LS-1234 -p current                            # Manual from current

# Post-merge automation (ONE COMMAND!)
make post-merge-rebase BRANCH=LS-1/merged                 # Complete workflow

# Manual post-merge steps
git checkout main; git pull                               # Get squashed commit
.\scripts\detect-squashed-commits.ps1 -Branch LS-1/merged -Parent main  # Auto-detect
make rebase-tree-auto                                     # Rebase tree with skip-commits

# Jira management
acli jira workitem view LS-1234                           # View ticket
acli jira workitem transition --key LS-1234 --status "In Progress"
acli jira workitem transition --key LS-1234 --status "In Review"
acli jira workitem transition --key LS-1234 --status "Done"

# Tree viewing
twig tree                                                 # View branch tree
make branch-tree                                          # Shorthand
git log --oneline parent..current                         # Verify unique commits

# Rebasing
make rebase-tree-auto                                     # Auto-rebase entire tree
twig rebase --skip-commits skip-commits.txt               # Manual single branch
twig cascade --no-interactive --skip-commits skip-commits.txt  # Manual cascade

# Skip-commits management
Copy-Item skip-commits-template.txt skip-commits.txt      # Create from template
Get-Content skip-commits.txt                              # View current list
Add-Content skip-commits.txt "abc1234"                    # Add single hash
Add-Content skip-commits.txt @"                           # Add multiple hashes
abc1234
def5678
"@

# Status checks
git status                                                # Working directory status
git branch --show-current                                 # Current branch name
git log --oneline -10                                     # Recent commits

# Environment refresh
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### Interpreting `twig tree` Output

```
main
├── LS-7/data-model                [+23]
│   └── LS-17/matchup-system       [+1]  (current)
│       └── LS-18/schema           [+1]
└── feature/other-work             [+5]
```

- **Indentation** - Parent-child relationships
- **`(current)`** - Currently checked out branch
- **`[+N]`** - N commits beyond parent
- **`[+N/-M]`** - N additions, M deletions
- **`[up-to-date]`** - Branch synced with parent

### Decision Tree: Where to Branch From?

```
Is this work dependent on another unmerged branch?
├─ NO  → Branch from main
│        git checkout main
│        git pull
│        twig switch LS-1234
│
└─ YES → Branch from parent
         git checkout parent-branch
         verify clean with: twig tree
         twig switch LS-1234 -p current
```/merged to main?
├─ NO  → Normal rebase
│        make rebase-tree-auto
│
└─ YES → Automated squash detection
         1. git checkout main; git pull
         2. .\scripts\detect-squashed-commits.ps1 -Branch merged-branch -Parent main
         3. Update child dependencies: twig branch depend child main
         4. make rebase-tree-auto
         5. Verify with: twig tree
```

### Complete Post-Merge Workflow

```
PR merged to main with squash
          ↓
    git checkout main
    git pull
          ↓
    Detect squashed commits:
    .\scripts\detect-squashed-commits.ps1
          ↓
    Update children to depend on main:
    twig branch depend LS-2/child main
          ↓
    Rebase entire tree:
    make rebase-tree-auto
          ↓
    Verify tree is clean:
    twig tree
          ↓
    Delete merged branch:
    git branch -D LS-1/merged
└─ YES → Add squashed commits to skip-commits.txt
         1. Identify old commit hashes
         2. Add to skip-commits.txt (one per line)
         3. make rebase-tree-auto
         4. Verify with: twig tree
```
-Merge Without Detection

**Symptom**: After merging PR to main, rebasing children causes massive conflicts

**Example**:
```
LS-1 merged to main (squashed: 5 commits → 1)
LS-2 (child of LS-1) still has those 5 commits
Trying to rebase LS-2 onto main = conflicts on every commit
```

**Fix - Automated (Recommended)**:
```powershell
# 1. Pull latest main
git checkout main; git pull

# 2. Auto-detect squashed commits
.\scripts\detect-squashed-commits.ps1 -Branch LS-1/merged -Parent main

# 3. Update child dependencies
twig branch remove-dep LS-2/child LS-1/merged
twig branch depend LS-2/child main

# 4. Rebase tree
make rebase-tree-auto

# 5. Verify
twig tree  # Children should show only their unique commits
```

**Fix - Manual**:
```powershell
# 1. Find original commit hashes that were squashed
git log --oneline origin/LS-1/merged  # Note hashes before squash

# 2. Add to skip-commits.txt
abc1234
def5678
ghi9012

# 3. Rebase
make rebase-tree-auto
# Delete bad branch
git branch -D LS-18/new-work

# Recreate from correct parent
git checkout LS-17/feature
twig switch LS-18 -p current

# Verify
twig tree  # Should show LS-18 with [+0]
```

### Pitfall 2: Cascading After Squash Without Skip-Commits

**Symptom**: Rebase conflicts that keep coming back, or commits re-appear after squashing

**Example**:
```
Parent squashed 5 commits → 1 commit
Child still has the 5 original commits
Rebase = conflicts on every commit
```

**Fix**:
```powershell
# 1. Add squashed commits to skip-commits.txt
# 2. Run automated rebase
make rebase-tree-auto

# 3. Verify
git log --oneline parent..child  # Should show unique commits only
```

### Pitfall 3: High Commit Count in Tree

**Symptom**: Branch shows `[+25]` when you only made 2 commits

**Cause**: Parent commits were included when branch was created

**Prevention**:
```powershell
# BEFORE creating dependent branch:
twig tree  # Check parent commit count
git log --oneline main..parent  # Verify parent commits

# Parent should have reasonable commit count
# If parent has [+25], investigate before branching from it
```

**Fix**: Too complex - usually easier to recreate branch from scratch

### Pitfall 4: Forgetting to Update Jira Status

**Symptom**: Team doesn't know you're working on ticket, sprint metrics are off

**Fix**: Update at each stage
```powershell
# Start work
acli jira workitem transition --key LS-1234 --status "In Progress"

# PR created
acli jira workitem transition --key LS-1234 --status "In Review"

# PR merged
acli jira workitem transition --key LS-1234 --status "Done"
```

### Pitfall 5: Pre-populating Skip-Commits Too Aggressively

**Symptom**: Lost actual work, commits disappeared from branch

**Cause**: Added commit hashes to skip-commits.txt before they were actually replaced/rewritten

**Prevention**:
- Only add hashes AFTER conflicts are resolved
- Only add the OLD hash, not the new one
- Add descriptive comments to track replacements

**Example**:
```powershell
# ❌ WRONG - Pre-emptively adding hash
Add-Content skip-commits.txt "abc1234"  # Haven't rebased yet!

# ✅ CORRECT - After conflict resolution
git rebase --continue  # Resolve conflict
git log -1 --oneline   # Get new hash: def5678
Add-Content skip-commits.txt "abc1234  # replaced by def5678"
```

---

## 🔍 Troubleshooting

### Issue: "acli not found"

**Solution**:
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
acli jira workitem view LS-1234
```

### Issue: Twig tree shows unexpected duplicates

**Solution**:
```powershell
# Investigate specific branch
git log --oneline parent..branch

# If many commits from parent are included:
# 1. Check if branch was created from wrong parent
# 2. Consider recreating branch from scratch
# 3. Or rebase to remove duplicates
```

### Issue: Rebase conflicts that won't resolve

**Solution**:
```powershell
# Abort and add to skip-commits.txt
git rebase --abort
git log --oneline  # Find problematic commit hash
Add-Content skip-commits.txt "problematic-hash"
make rebase-tree-auto
```

### Issue: Branch tree shows wrong parent relationship

**Solution**:
```powershell
# Use twig to change parent
twig set-parent new-parent-branch

# Verify
twig tree
```

---

## 📚 Related Documentation

- **[Branch Tree Management Guide](../guides/branch-tree-management.md)** - Comprehensive human-readable guide
- **[Rebase Workflow Guide](../guides/rebase-workflow.md)** - Detailed rebase procedures
- **[AI Agent Contribution Workflow](../guides/ai-agent-contribution-workflow.md)** - Complete development lifecycle

---

## 🔄 Changelog

- **2026-01-16**: Created focused skill from existing documentation
