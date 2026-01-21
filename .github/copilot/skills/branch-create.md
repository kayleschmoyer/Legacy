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
```

## Alternative Commands

### Using Twig Directly

```powershell
# From main branch
git checkout main
git pull
twig switch LS-1234

# From current branch (dependent work)
twig switch LS-1234 -p current
```

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
1. **Always create from main** for new tickets (not dependent work)
2. **Use -FromCurrent flag** for dependent branches
3. **Verify ticket exists** before creating branch
4. **Pull latest main** before branching (script does this automatically)
5. **Check branch name** follows convention: feature/LS-####-description

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
