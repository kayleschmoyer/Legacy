---
name: jira-ticket
description: 'Manage Jira ticket statuses and metadata using the acli CLI; use when transitioning tickets to In Progress, In Review, or other workflow states.'
---

# Skill: Jira Ticket Management

## Overview

Manage Jira ticket statuses and information using the acli command-line tool.

## When to Use

- Starting work on a ticket (transition to "In Progress")
- Creating a pull request (transition to "In Review")
- After PR is merged (transition to "Done")
- Viewing ticket details
- Creating new tickets

## Command

```powershell
# View ticket details
acli jira workitem view LS-1234

# Update ticket status
acli jira workitem transition --key LS-1234 --status "In Progress"
acli jira workitem transition --key LS-1234 --status "In Review"
acli jira workitem transition --key LS-1234 --status "Done"
```

## Alternative Commands

### Create New Ticket

```powershell
# Create task
acli jira workitem create --project LS --type "Task" \
  --summary "Your task summary" \
  --description "Detailed description"

# Create story
acli jira workitem create --project LS --type "Story" \
  --summary "User story" \
  --description "As a user, I want..."

# Create bug
acli jira workitem create --project LS --type "Bug" \
  --summary "Bug description" \
  --description "Steps to reproduce..."
```

### Assign Ticket

```powershell
# Assign to yourself
acli jira workitem assign --key LS-1234 --assignee @me

# Assign to another user
acli jira workitem assign --key LS-1234 --assignee "user@example.com"
```

### Add Comments

```powershell
# Add comment to ticket
acli jira workitem comment create --key LS-1234 \
  --body "Work in progress, will update soon"
```

### Link Tickets

```powershell
# Link related tickets
acli jira workitem link create --out LS-NEW --in LS-ORIG --type Relates
```

## Expected Output

- **View**: Ticket details including status, assignee, description
- **Transition**: Confirmation of status change
- **Create**: New ticket key (e.g., LS-1234)

## Common Issues

### Issue: acli command not found

**Solution**: Refresh PowerShell PATH variables

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### Issue: Transition fails with "Invalid status"

**Solution**: Check available transitions in Jira UI or use exact status name

```powershell
# View ticket in browser to see available transitions
acli jira workitem view LS-1234 --web
```

### Issue: Permission denied

**Solution**: Ensure you're assigned to the ticket

```powershell
# Assign to yourself first
acli jira workitem assign --key LS-1234 --assignee @me

# Then transition
acli jira workitem transition --key LS-1234 --status "In Progress"
```

### Issue: Ticket not found

**Solution**: Verify ticket exists and you have access

```powershell
# Check in Jira UI or try different project key
acli jira workitem view LS-1234
```

## Best Practices

1. **Update status immediately** when state changes (start work, create PR, merge)
2. **Add comments** when blocked or making significant changes
3. **Assign to yourself** before starting work
4. **Add to current sprint** for new tickets before implementation
5. **Link related tickets** when de-scoping or splitting work

## Ticket Workflow States

| Stage        | Jira Status     | When to Update                  | Command                                                              |
| ------------ | --------------- | ------------------------------- | -------------------------------------------------------------------- |
| Planning     | **To Do**       | Ticket created, not yet started | (default state)                                                      |
| Started Work | **In Progress** | When you begin implementation   | `acli jira workitem transition --key LS-1234 --status "In Progress"` |
| Code Review  | **In Review**   | After PR is created             | `acli jira workitem transition --key LS-1234 --status "In Review"`   |
| Merged       | **Done**        | After PR is merged to main      | `acli jira workitem transition --key LS-1234 --status "Done"`        |

## Integration with Workflow

### Starting Work on a Ticket

```powershell
# 1. View ticket details
acli jira workitem view LS-1234

# 2. Assign to yourself (if not already)
acli jira workitem assign --key LS-1234 --assignee @me

# 3. Move to current sprint (in Jira UI)

# 4. Update status to "In Progress"
acli jira workitem transition --key LS-1234 --status "In Progress"

# 5. Create branch
.\scripts\branch-create.ps1 -TicketKey LS-1234
```

### Creating Pull Request

See the [create-pr skill](../create-pr/SKILL.md) for the full PR template workflow.

```powershell
# 1. Create PR (use --body-file, never inline --body — see create-pr skill)
gh pr create --title "LS-1234 feat(scope): description" --body-file ".github/tmp-pr-body.md" --base main

# 2. Update ticket status
acli jira workitem transition --key LS-1234 --status "In Review"

# 3. Add PR link to ticket (optional)
acli jira workitem comment create --key LS-1234 \
  --body "PR created: https://github.com/..."
```

### After Merge

```powershell
# Update ticket to Done
acli jira workitem transition --key LS-1234 --status "Done"
```

## De-scoping Work

When splitting work across multiple PRs:

```powershell
# 1. Create follow-up ticket
acli jira workitem create --project LS --type "Story" \
  --summary "Follow-up: UI components" \
  --description "Work de-scoped from LS-ORIG"

# 2. Link tickets
acli jira workitem link create --out LS-NEW --in LS-ORIG --type Relates

# 3. Document in original ticket
acli jira workitem comment create --key LS-ORIG \
  --body "UI work de-scoped to LS-NEW to keep PR focused"
```

## Exit Codes

- **0**: Command successful
- **Non-zero**: Error occurred (check error message)

## Related Skills

- [Branch Creation](branch-create.md) - Creating branches for tickets
- [Pull Request Creation](create-pr.md) - Creating PRs
- [Jira CLI Reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)

## Related Documentation

- [AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md#step-1-plan-the-project-jira-ticket-management)
- [Development Workflow CSV](../../../docs/agents/development-workflow.csv)
