# Interactive Rebase & Recovery

## Interactive Rebase (Squashing / Reordering)

When you need to clean up commit history before a PR:

```bash
# Squash last N commits interactively
git rebase -i HEAD~N

# Squash onto a specific base
git rebase -i origin/main
```

> **Note:** For interactive rebases, only `GIT_SEQUENCE_EDITOR` is needed to prevent the todo-list editor from blocking. However, `GIT_EDITOR` should also be set for `--continue` steps (see below). Use a cross-platform no-op editor such as `node -e "process.exit(0)"` rather than literal `true`, which is Unix-specific.

In the editor, change `pick` to:

- `squash` (or `s`) — merge into previous commit, combine messages
- `fixup` (or `f`) — merge into previous commit, discard this message
- `reword` (or `r`) — keep commit but edit message
- `drop` (or `d`) — delete the commit entirely
- `edit` (or `e`) — pause to amend the commit

After saving, resolve any conflicts that arise (same process as above), then:

```bash
GIT_EDITOR='node -e "process.exit(0)"' git rebase --continue
```

---

## Recovery: Stuck Mid-Rebase

If the developer is stuck in the middle of a rebase and confused:

### Diagnose the State

```powershell
# Check if a rebase is in progress
git status

# See which commit is being applied
if (Test-Path .git/rebase-merge) {
    Get-Content .git/rebase-merge/head-name       # branch being rebased
    Get-Content .git/rebase-merge/msgnum           # current commit number
    Get-Content .git/rebase-merge/end              # total commits
}
```

### Options

1. **Continue** (if all conflicts are resolved):

   ```bash
   git diff --name-only --diff-filter=U   # should be empty
   GIT_EDITOR='node -e "process.exit(0)"' git rebase --continue
   ```

2. **Skip this commit** (if it's a duplicate or no longer needed):

   ```powershell
   git rebase --skip
   ```

3. **Abort** (go back to pre-rebase state — no work is lost):

   ```powershell
   git rebase --abort
   ```

4. **Recover from a bad rebase** (already completed but wrong):
   ```powershell
   # Find the pre-rebase state in reflog
   git reflog
   # Reset to the state before the rebase
   git reset --hard HEAD@{N}   # where N is the reflog entry before rebase
   ```
