# Worktree Troubleshooting & Cleanup

## Troubleshooting

### twig tree / twig branch commands don't work in worktree

`.twig/state.json` is gitignored and absent. The easiest fix is to re-run `make wt-setup WT=$wt`, which handles symlink creation with automatic junction fallback. To create the link manually (substitute `$wt` with the worktree path from `twig worktree list`):

```powershell
# Symlink (requires Developer Mode); falls back to junction if mklink /D fails
cmd /c mklink /D "$wt\.twig" "D:\code\legacy-sports\.twig"
# If the above fails: cmd /c mklink /J "$wt\.twig" "D:\code\legacy-sports\.twig"
```

Verify it worked:

```powershell
cd $wt
twig tree
```

### Permission denied on `git worktree move`

You're inside the worktree being moved. `cd` to the main repo first:

```powershell
cd "D:\code\legacy-sports"
git worktree move ...
```

### Worktree list shows stale entries

```powershell
twig worktree clean
twig worktree list
```

### Twig fails with "Issue not found"

Twig couldn't fetch the Jira issue. Create the branch manually and transition Jira separately:

```powershell
git checkout -b "LS-####/description"
git checkout main
acli jira workitem transition --key LS-#### --status "In Progress"
```

### node_modules missing in worktree

`node_modules` is gitignored so it is never present in a fresh worktree. Use the smart setup script, which junctions to main when possible:

```powershell
# From the main repo (recommended — handles .env and .twig too):
make wt-setup WT=$wt

# Or install independently inside the worktree:
cd $wt   # path from twig worktree list
make install
```

## Maintenance & Cleanup Cadence

Worktrees accumulate over time. Periodic cleanup keeps the workspace lean and prevents confusion from stale branches.

### After Every PR Merge

```powershell
cd "D:\code\legacy-sports"
make sync-worktrees-remove TICKET=####   # remove from VS Code workspace
twig worktree clean                     # removes worktrees with merged/deleted branches
git branch -d "LS-####/description"     # delete the local branch
```

### Weekly Housekeeping

Run this periodically (e.g., start of week) to catch any missed cleanups:

```powershell
cd "D:\code\legacy-sports"

# List all active worktrees — review for any that are done
twig worktree list

# Clean up merged/deleted branch worktrees
twig worktree clean

# Prune remote-tracking branches that no longer exist
git fetch --prune

# Check disk usage of the worktrees directory
Get-ChildItem "D:\code\legacy-sports-worktrees" -Directory |
  ForEach-Object { $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB; [PSCustomObject]@{ Name = $_.Name; SizeMB = [math]::Round($size, 1) } } |
  Sort-Object SizeMB -Descending | Format-Table -AutoSize
```

### Signs You Should Clean Up

- `twig worktree list` shows worktrees for tickets that are already "Done" in Jira
- `git branch` shows branches with no corresponding open PR
- VS Code workspace has more than 3-4 worktrees (TypeScript performance degrades — see Step 4)
- Disk usage on the worktrees directory exceeds expectations
