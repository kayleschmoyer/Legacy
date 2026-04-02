# Common Workflow Mistakes & Recovery

## Common Mistakes to Avoid

### ❌ MISTAKE 5: Forgetting `-p=main` on `twig switch`

```powershell
# WRONG - no parent specified
twig switch LS-1234  # ❌ twig may pick wrong parent!

# CORRECT - always specify parent explicitly
twig switch LS-1234 -p=main     # new independent feature
twig switch LS-1234 -p=current  # follow-up/dependent work
```

Without `-p=main`, twig may not correctly track the branch's parent,
causing issues with rebasing, PR targets, and the branch dependency tree.
**Always use `-p=main` for new features or `-p=current` for dependent work.**

### ❌ MISTAKE 6: Branching from main when ticket depends on an in-progress branch

```powershell
# WRONG - LS-200 depends on unmerged LS-199, but branched from main
git checkout main
twig switch LS-200 -p=main  # ❌ creates sibling branch, loses LS-199 changes!

# CORRECT - branch from the in-progress parent ticket
git checkout LS-199/branch-name
twig switch LS-200 -p=current  # ✅ properly stacked under LS-199
```

If you made this mistake, fix it by rebasing and updating twig:

```bash
# Rebase child onto correct parent
git checkout LS-200/branch-name
GIT_EDITOR=true git rebase LS-199/branch-name  # resolve any conflicts

# Update twig dependency map
twig branch depend --exclusive LS-200/branch-name LS-199/branch-name

# Force push
git push --force-with-lease origin HEAD

# Verify tree
twig tree
```

### ❌ MISTAKE 7: Partial Implementation Without Follow-Up Tickets

Implementing only part of a ticket's scope without either finishing it or creating follow-up tickets causes scope to fall through the cracks.

```powershell
# WRONG - close ticket even though some acceptance criteria are incomplete
git commit -m "feat(x): partial implementation"
# ... open PR, mark ticket Done, some AC never addressed ❌

# CORRECT - either finish everything, or create follow-up tickets for remaining work
$result = acli jira workitem create `
  --summary "Follow-up: [remaining scope from LS-####]" `
  --project LS `
  --type Task `
  --json | ConvertFrom-Json
Write-Host "Created follow-up: $($result.key)"
# Reference $result.key in your PR description
```

**Rules:**

- Every acceptance criterion in the original ticket must be either **implemented** or **tracked in a follow-up ticket**.
- Reference all follow-up ticket keys in the PR description under a "Follow-up work" section.
- Do not mark the original ticket as Done if meaningful scope was punted — the follow-up must exist first.

### ❌ MISTAKE 0: Editing Files in the Main Repo Before Creating a Worktree

Reading files and running read-only commands (AWS CLI, `git log`, `gh run view`) from the main repo is fine. But **any file edit must happen inside a worktree**, even if you haven't committed yet.

```powershell
# WRONG - editing a file directly in the main repo
cd D:\code\legacy-sports
# ... open an editor, change a file ...
# Even if you don't commit, this pollutes the main repo and requires cleanup.
```

**Fix if this happens:**

```powershell
# 1. Stash the edit so main is clean again
cd D:\code\legacy-sports
git stash

# 2. Create a Jira ticket and worktree normally
$key = (acli jira workitem create --summary "..." --project LS --type Task --json | ConvertFrom-Json).key
acli jira workitem transition --key $key --status "In Progress"
twig worktree create "$key/description"
$wt = "<path from twig worktree list>"
make wt-setup WT=$wt

# 3. Re-apply the change inside the worktree
cd $wt
# Re-apply via your editor, or: git -C D:\code\legacy-sports stash show -p | git apply

# 4. From this point forward all edits and commands target $wt only
```

> This mistake is especially easy to make during **investigation tasks** (e.g. debugging a CI workflow): you find the problem, instinctively fix the file, and only then realize you were in the main repo. Stash → worktree → re-apply is the recovery pattern.

### ❌ MISTAKE 1: Committing to Main

```powershell
# WRONG - Making changes on main
git branch  # Shows: * main
# ... edit files ...
git commit -m "changes"  # ❌ WRONG!
```

**Fix if this happens:**

```powershell
# Undo the commit (keep changes)
git reset HEAD~1

# Create proper branch (ALWAYS specify -p=main)
twig switch LS-1234 -p=main

# Now commit properly
git add .
git commit -m "feat(scope): description (LS-1234)"
git push origin HEAD
```

### ❌ MISTAKE 2: Forgetting Jira Updates

Always update Jira status at:

- Start: "In Progress"
- PR Created: "In Review"
- PR Merged: "Done"

### ❌ MISTAKE 3: Skipping Pre-PR Validation

Always run `make pc` before creating a PR. It catches type errors, lint issues, test failures, and build breaks before reviewers see them.

### ❌ MISTAKE 3b: Ignoring Formatting Failures From `make pc`

`make pc` runs `nx format:write`. If any files are reformatted and the working tree was **clean** (no staged or unstaged changes before format ran), `make pc` **automatically amends the previous commit** with the format fixes and continues — no manual step required.

If the working tree had **other uncommitted changes** when format ran, `make pc` fails and prints the list of reformatted files. In that case, commit or stash your other changes first, then re-run.

```powershell
# WRONG - push when make pc reported a formatting failure
git push origin HEAD  # ❌ reformatted files never committed — CI will fail!

# CORRECT (working tree had other changes) — commit/stash first, then re-run
git add -A
git commit -m "style: fix code formatting"
make pc               # ✅ re-run to confirm clean
git push origin HEAD
```

### ❌ MISTAKE 4: No PR Created

All work must go through PR review, even for documentation. **This is the #1 agent failure mode**: agents write code, run `make pc`, and stop — thinking the task is done. Your work is **not complete** until:

1. A PR has been created (via `github_create_pr` MCP tool) and the PR URL is visible
2. Jira has been moved to "In Review"

If you find yourself about to end your turn after `make pc`: **STOP and keep going.**

### ❌ MISTAKE 5: Stale Tracking Tasks

Agents create tasks via `TaskCreate` at the start of a ticket, then forget to mark them complete after shipping. This leaves the user's task list full of "in_progress" or "pending" tasks that are actually done.

**Rule: mark each task complete immediately after Jira moves to "In Review" — before starting the next ticket.**

```
# Wrong — batching updates to end of session
Work ticket A → PR → Jira "In Review"
Work ticket B → PR → Jira "In Review"
Work ticket C → PR → Jira "In Review"
TaskUpdate(taskId: A, status: "completed")  # too late — tasks were stale all session
TaskUpdate(taskId: B, status: "completed")
TaskUpdate(taskId: C, status: "completed")

# Right — update immediately after each ship
Work ticket A → PR → Jira "In Review" → TaskUpdate(taskId: A, status: "completed")
Work ticket B → PR → Jira "In Review" → TaskUpdate(taskId: B, status: "completed")
Work ticket C → PR → Jira "In Review" → TaskUpdate(taskId: C, status: "completed")
```

In batch/parent mode, call `TaskList` at the end of a session to catch any tasks that were missed and update them.
