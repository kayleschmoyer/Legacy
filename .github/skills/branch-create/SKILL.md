---
name: branch-create
description: 'Create feature branches with automatic Jira ticket integration using the twig tool; use when starting work on a new Jira ticket.'
---

# Skill: Branch Creation

## Overview

Create feature branches with automatic Jira integration using the branch-create script or twig.

## When to Use

- Starting work on a new Jira ticket
- Creating a feature branch from main
- Creating a dependent branch from current branch
- Need automatic Jira status update to "In Progress"

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
# From main branch - Always set parent explicitly!
git checkout main
git pull
twig switch LS-1234 -p=main

# From current branch (dependent work)
twig switch LS-1234 -p=current
# Or equivalently, bare -p defaults to current:
twig switch LS-1234 -p
```

> **⚠️ CRITICAL**: The `-p` flag requires equals-sign syntax when providing a
> value (e.g., `-p=main`, `-p=current`). Space-separated `-p main` will fail.
> Bare `-p` (no value) defaults to using the current branch as parent.

### Manual Branch Creation

```powershell
# Create branch manually (less recommended)
git checkout -b feature/LS-1234-description
```

## Expected Output

- **Success**: Branch created and checked out
- **Jira Update**: Ticket status updated to "In Progress" (with branch-create.ps1)
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

**Use `-p=<explicit-branch-name>` when:**

- The ticket explicitly depends on ANOTHER ticket that is in-progress (not yet merged to main)
- Check the Jira ticket description and linked issues to identify dependencies
- First switch to the parent branch, then create the child:

```powershell
# If LS-200 depends on LS-199 (which is in-progress):
git checkout LS-199/some-branch-name
twig switch LS-200 -p=current  # branches from LS-199
# OR equivalently:
twig switch LS-200 -p=LS-199/some-branch-name
```

> **⚠️ CRITICAL**: If a ticket builds on code from an unmerged branch, parent MUST be
> that branch — not main. Using `-p=main` when there's an in-progress dependency creates
> sibling branches that will have merge conflicts when both are merged.

**The script will prompt you** if you're already on a feature branch to help you decide.

### Other Best Practices

1. **Always set parent explicitly** with `-p=main` or `-p=current` (equals-sign syntax, not space-separated) to avoid incorrect parent tracking
2. **Check for in-progress dependencies** before branching — if the ticket depends on another unmerged ticket, branch from that ticket's branch, not main
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

# 2. Add ticket to current sprint (if new)
# Do this in Jira UI

# 3. Create branch (automatically updates to "In Progress")
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
