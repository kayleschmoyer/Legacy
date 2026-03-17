---
name: branch-create
description: 'Create feature branches with automatic Jira ticket integration using the twig tool; use when starting work on a new Jira ticket.'
---

# Skill: Branch Creation

> **⚠️ Prefer the [worktree workflow](../worktree-workflow/SKILL.md) for all ticket work.**
> Use `make worktree TICKET=#### DESC=description` which creates the branch,
> worktree, and parent dependency in one atomic command.
> This skill covers in-place branching only. Use it when the user explicitly asks
> to work without a worktree (e.g., "no worktree" or "in-place").

## Overview

Create feature branches with automatic Jira integration using the branch-create script or twig.

> **⚠️ Known pitfall — duplicate branches**: Do NOT combine `twig switch LS-#### -p=...`
> with `twig worktree create LS-####/description`. `twig switch` auto-generates a
> dash-format branch name from the Jira summary (e.g., `LS-490-fix-rollbar-init`),
> while `twig worktree create` uses your slash-format name (`LS-490/fix-rollbar-init`).
> This creates **two branches per ticket** — the dash-format orphan never gets a parent
> dependency. Use one approach or the other, not both.

## When to Use

- Starting work on a new Jira ticket
- Creating a feature branch from main
- Creating a dependent branch from current branch
- Need automatic Jira status update to "In Progress" (caller must verify blockers first — the script does not enforce this)

## Command

```powershell
# Create branch from main (new ticket)
.\scripts\branch-create.ps1 -TicketKey LS-1234

# Create branch from current branch (follow-up work)
.\scripts\branch-create.ps1 -TicketKey LS-1234 -FromCurrent

# For agent/automation (no interactive prompts)
.\scripts\branch-create.ps1 -TicketKey LS-1234 -NonInteractive
.\scripts\branch-create.ps1 -TicketKey LS-1234 -NonInteractive -AddToSprint
```

## Alternative Commands

### Using Twig Directly

```powershell
# From main branch (new independent ticket)
twig switch LS-1234 -p=main

# From current branch (dependent work)
twig switch LS-1234 -p=current
# Or equivalently, bare -p defaults to current:
twig switch LS-1234 -p

# From another Jira ticket's branch (without checking it out first)
twig switch LS-1234 -p=LS-1233

# No parent tracking (same as branching from root)
twig switch LS-1234 -p=none
```

> **⚠️ CRITICAL**: The `-p` flag requires equals-sign syntax when providing a
> value (e.g., `-p=main`, `-p=current`, `-p=LS-1233`). Space-separated `-p main` will fail.
> Bare `-p` (no value) defaults to using the current branch as parent.

### Twig `-p` Parent Values Reference

| Value                     | Meaning                                           |
| ------------------------- | ------------------------------------------------- |
| `-p=main`                 | Branch from `main` (or any branch name)           |
| `-p=current` or bare `-p` | Branch from the currently checked-out branch      |
| `-p=LS-####`              | Branch from the branch linked to that Jira ticket |
| `-p=none`                 | No parent dependency tracking                     |

### Manual Branch Creation

```powershell
# Create branch manually (less recommended)
git checkout -b feature/LS-1234-description
```

## Expected Output

- **Success**: Branch created and checked out
- **Jira Update**: Ticket status updated to "In Progress" (the script transitions unconditionally — the caller must check blockers before invoking it)
- **Console**: Branch name and Jira confirmation

## Common Issues

### Issue: acli command not found

**Solution**: Refresh PowerShell PATH variables

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### Issue: Jira ticket not found

**Solution**: Verify ticket exists and you have access

```powershell
acli jira workitem view LS-1234
```

### Issue: Already on a feature branch

**Solution**: Commit or stash changes, checkout main first

```powershell
git stash
git checkout main
git pull
.\scripts\branch-create.ps1 -TicketKey LS-1234
```

### Issue: Twig not installed

**Solution**: Install twig globally

```powershell
npm install -g @rongierlach/git-twig
twig init
```

## Best Practices

### Choosing the Right Parent Branch

**Use `-p=main` (default without `-FromCurrent`) when:**

- Starting a NEW independent feature
- Working on unrelated tickets
- First ticket in a new sprint

**Use `-p=current` (with `-FromCurrent` flag) when:**

- Creating a follow-up ticket to current work
- Building on changes in the current branch
- Working on a series of dependent tickets

**Use `-p=<ticket-or-branch>` when:**

- The ticket explicitly depends on ANOTHER ticket that is in-progress (not yet merged to main)
- Check the Jira ticket description and linked issues to identify dependencies
- Pass the parent Jira ticket key directly — no need to check it out first:

```powershell
# If LS-200 depends on LS-199 (which is in-progress):
twig switch LS-200 -p=LS-199   # twig resolves the branch from the Jira key

# OR use the branch name explicitly:
twig switch LS-200 -p=feature/LS-199-some-description

# OR check out the parent first, then use -p=current:
git checkout feature/LS-199-some-description
twig switch LS-200 -p=current
```

> **⚠️ CRITICAL**: If a ticket builds on code from an unmerged branch, parent MUST be
> that branch — not main. Using `-p=main` when there's an in-progress dependency creates
> sibling branches that will have merge conflicts when both are merged.

**The script will prompt you** if you're already on a feature branch to help you decide.

### Other Best Practices

1. **Always set parent explicitly** with `-p=main`, `-p=current`, or `-p=LS-####` (equals-sign syntax, not space-separated) to avoid incorrect parent tracking
2. **Check blockers before any status transition** — if the ticket depends on another unmerged ticket and the blocker is not In Review/Done, stop. If unblocked and dependency is In Review, use `-p=LS-####` (Jira key) or `-p=<branch-name>` rather than `-p=main`
3. **Verify parent with `twig tree`** after creating branch — the new branch must appear nested under the correct parent
4. **Verify ticket exists** before creating branch
5. **Pull latest main** before branching from main (script does this automatically)
6. **Check branch name** follows convention: feature/LS-####-description

## Branch Naming Convention

The script automatically generates proper names:

- `feature/LS-####-short-description` for features
- `bugfix/LS-####-short-description` for bugs
- `hotfix/LS-####-short-description` for hotfixes

## Integration with Workflow

### Pre-branch Creation

```powershell
# 1. Verify ticket exists
acli jira workitem view LS-1234

# 2. Check blocker status before any transition
# If blocked by LS-1222 and LS-1222 is not In Review/Done -> STOP
# Use MCP: jira_check_blockers, or:
acli jira workitem link list --key LS-1234
# Then verify each linked blocker's status:
acli jira workitem view --key LS-1222  # must be In Review or Done

# 3. Add ticket to current sprint (if new)
# Do this in Jira UI

# 4. Create branch (transitions to In Progress — only run after blockers are clear)
.\scripts\branch-create.ps1 -TicketKey LS-1234
```

### After Branch Creation

```powershell
# Verify you're on the correct branch
git status
git branch

# Start implementing changes
# ... make your code changes ...

# Continue with pre-commit validation
make quick-check  # or make pre-commit
```

## Script Features (branch-create.ps1)

The PowerShell script provides:

- ✅ Automatic git pull from main
- ✅ Branch creation with proper naming
- ✅ Jira ticket status update to "In Progress"
- ✅ Error handling and validation
- ✅ Support for dependent branches with -FromCurrent

## Exit Codes

- **0**: Branch created successfully
- **1**: Error occurred (check error message)

## Related Skills

- [Jira Ticket Management](jira-ticket.md) - Managing ticket status
- [Branch Tree Management](branch-tree.md) - Managing dependent branches
- [Pull Request Creation](create-pr.md) - Creating PRs after work

## Related Documentation

- [AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md#step-2-create-feature-branch)
- [Branch Tree Management Guide](../../../docs/guides/branch-tree-management.md)
