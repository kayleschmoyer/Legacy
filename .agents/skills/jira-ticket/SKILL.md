---
name: jira-ticket
description: 'Manage Jira ticket statuses and metadata; MCP tools are primary, acli CLI is the fallback. Covers transitions, ticket creation, attachments, links, sprints, and investigation ticket workflow.'
---

# Skill: Jira Ticket Management

## Tool Priority

| Operation         | MCP Tool (preferred)  | acli CLI (fallback)                                                  |
| ----------------- | --------------------- | -------------------------------------------------------------------- |
| View ticket       | `jira_view`           | `acli jira workitem view LS-####`                                    |
| Create ticket     | `jira_create_ticket`  | `acli jira workitem create --project LS --type Task --summary "..."` |
| Transition status | `jira_transition`     | `acli jira workitem transition --key LS-#### --status "In Progress"` |
| Check blockers    | `jira_check_blockers` | `acli jira workitem link list --key LS-####`                         |
| Set parent epic   | `jira_set_parent`     | REST API (see below)                                                 |
| Fetch comments    | `jira_get_comments`   | `acli jira workitem comment list --key LS-####`                      |

**Always use MCP tools when available.** They require no CLI installation, work in cloud/CI, and return structured data. See [mcp-jira](../mcp-jira/SKILL.md) for full MCP tool documentation.

**Never use `fetch_webpage` or raw HTTP to access Jira.** If neither MCP tools nor `acli` are available, inform the user that Jira credentials need configuration.

## Overview

Manage Jira ticket statuses and information. MCP tools are the recommended approach; `acli` commands below are the local fallback when MCP tools are unavailable.

## When to Use

- Starting work on a ticket (transition to "In Progress")
- Creating a pull request (transition to "In Review")
- After PR is merged (transition to "Done")
- Viewing ticket details
- Creating new tickets

## acli CLI Commands (Fallback)

### Common Operations

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

### View & Download Attachments

```powershell
# List attachments on a ticket
acli jira workitem attachment list --key LS-1234
acli jira workitem attachment list --key LS-1234 --json
```

To **download** an attachment image (e.g. a screenshot from a bug report), use the Jira REST API with Basic Auth credentials from your `~/.netrc` file:

```powershell
# 1. Get the attachment ID
$json = acli jira workitem attachment list --key LS-1234 --json | ConvertFrom-Json
$att = $json.attachments[0]  # or filter by name
Write-Host "Attachment: $($att.name) (ID: $($att.id))"

# 2. Download using .netrc credentials (Basic Auth: email + API token)
$netrc = Get-Content "$env:USERPROFILE\.netrc" -Raw
if ($netrc -match 'machine atlassian\.net\s+login\s+(\S+)\s+password\s+(\S+)') {
    $base64 = [Convert]::ToBase64String(
        [Text.Encoding]::ASCII.GetBytes("$($Matches[1]):$($Matches[2])")
    )
    $headers = @{ Authorization = "Basic $base64" }
    $url = "https://bkrupa.atlassian.net/rest/api/3/attachment/content/$($att.id)"
    Invoke-WebRequest -Uri $url -Headers $headers `
        -OutFile "scratch/$($att.name)"
    Write-Host "Downloaded: scratch/$($att.name)"
}
```

> **Note:** The `.netrc` file at `~/.netrc` must contain an `atlassian.net` entry with your email and Jira API token. The `acli` attachment commands only support listing — not downloading — so the REST API approach above is required.

### View Downloaded Images (Agent Only)

After downloading an image attachment to `scratch/`, agents can **view it directly** using the Playwright MCP tools. Playwright blocks `file://` URLs, so you must serve the file over HTTP first:

```powershell
# 1. Start a temporary HTTP server in a background process
Start-Process powershell -ArgumentList '-NoProfile', '-Command', `
    'cd D:\code\legacy-sports\scratch; python -m http.server 8765'
```

Then use the Playwright MCP tools:

```
# 2. Navigate to the image
mcp_microsoft_pla_browser_navigate → http://localhost:8765/<filename>.png

# 3. Take a screenshot (returns image data inline to the agent)
mcp_microsoft_pla_browser_take_screenshot → ref: <img ref from snapshot>, type: "png"
```

```powershell
# 4. Clean up the HTTP server when done
Get-Process python -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '8765' } |
    Stop-Process -Force
```

> **Why not `file://`?** Playwright's `browser_navigate` blocks `file:` protocol for security. The temp HTTP server is the simplest workaround. Use port 8765 to avoid conflicts with dev servers.

### Link Tickets

```powershell
# Link related tickets
acli jira workitem link create --out LS-NEW --in LS-ORIG --type Relates

# Link as duplicate
acli jira workitem link create --out LS-NEW --in LS-ORIG --type Duplicate
```

### Create Epics and Child Tickets

```powershell
# Create an epic
acli jira workitem create --project LS --type "Epic" \
  --summary "E2E Test Coverage: Mocked Playwright Tests"

# Create a ticket with a parent epic (at creation time)
acli jira workitem create --project LS --type "Task" \
  --summary "Add E2E test for trade flow" \
  --parent LS-722
```

### Set Parent Epic on Existing Tickets (REST API)

The `acli` CLI does **not** support setting the `parent` field on existing tickets. Use the Jira REST API directly:

```powershell
# 1. Build auth headers from .netrc (same as attachment download)
$netrc = Get-Content "$env:USERPROFILE\.netrc" -Raw
if ($netrc -match 'machine atlassian\.net\s+login\s+(\S+)\s+password\s+(\S+)') {
    $base64 = [Convert]::ToBase64String(
        [Text.Encoding]::ASCII.GetBytes("$($Matches[1]):$($Matches[2])")
    )
    $headers = @{ Authorization = "Basic $base64" }
}

# 2. Set parent epic on an existing ticket
Invoke-RestMethod `
  -Uri "https://bkrupa.atlassian.net/rest/api/3/issue/LS-598" `
  -Method PUT `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"fields":{"parent":{"key":"LS-722"}}}'

# 3. Verify the parent was set
$r = Invoke-RestMethod `
  -Uri "https://bkrupa.atlassian.net/rest/api/3/issue/LS-598?fields=parent" `
  -Headers $headers
Write-Host "Parent: $($r.fields.parent.key)"
```

### Add Ticket to Current Sprint

```powershell
# Find the active sprint ID for the LS board
acli jira sprint list --board-id LS --state active

# Add a ticket to the active sprint
acli jira sprint add --sprint-id <id> --issue LS-1234
```

> **Tip:** Always add newly created tickets to the current sprint before starting work. You can add up to 50 issues at once.

### Search Tickets with JQL

```powershell
# Search for all open tickets in an epic
acli jira workitem search \
  --jql "project = LS AND parent = LS-722 AND status != Done" \
  --fields "key,summary,status" --csv

# Search for test-related tickets
acli jira workitem search \
  --jql "project = LS AND (summary ~ 'test' OR summary ~ 'e2e') AND status != Done" \
  --fields "key,summary,status,parent" --csv
```

## Expected Output

- **View**: Ticket details including status, assignee, description
- **Transition**: Confirmation of status change
- **Create**: New ticket key (e.g., LS-1234)

## Common Issues

### Issue: `acli jira workitem create --json` creates duplicate tickets

**Problem**: Using the `--json` flag on `create` sometimes creates the ticket twice (two different keys, identical content).

**Solution**: Don't use `--json` on `create` commands. Parse the plain text output instead, or use `--parent` at creation time rather than editing afterward.

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

## Investigation Tickets

When an investigation ticket results in creating a new backlog ticket to resolve the issue, **resolve the investigation ticket immediately** — don't leave it open.

### Workflow

1. Transition the investigation ticket to **In Progress** when you begin
2. Investigate and document findings
3. Create a new backlog ticket for the fix (Task / Bug / Story)
4. Link the new ticket back to the investigation: `acli jira workitem link create --out LS-NEW --in LS-ORIG --type Relates`
5. Add a comment to the investigation ticket summarizing findings and referencing the new ticket
6. Transition the investigation ticket to **Done** immediately

```powershell
# Example: investigation complete, new ticket created
acli jira workitem comment create --key LS-100 `
  --body "Investigation complete. Root cause: [summary]. Created LS-200 to address."
acli jira workitem link create --out LS-200 --in LS-100 --type Relates
acli jira workitem transition --key LS-100 --status "Done"
```

> **Rationale:** The investigation's deliverable is the findings + backlog ticket, not a code change. Once those exist, the investigation is complete and should be closed.

## Best Practices

1. **Update status immediately** when state changes (start work, create PR, merge)
2. **Add comments** when blocked or making significant changes
3. **Assign to yourself** before starting work
4. **Add to current sprint** for new tickets before implementation — use `acli jira sprint add --sprint-id <id> --issue LS-1234`
5. **Link related tickets** when de-scoping or splitting work
6. **Close investigation tickets** as soon as a follow-up backlog ticket is created (see [Investigation Tickets](#investigation-tickets))

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

# 3. Add to current sprint
acli jira sprint add --sprint-id <id> --issue LS-1234

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

- [Branch Creation](../branch-create/SKILL.md) - Creating branches for tickets
- [Pull Request Creation](../create-pr/SKILL.md) - Creating PRs
- [Jira CLI Reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)

## Related Documentation

- [AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md#step-1-plan-the-project-jira-ticket-management)
- [Development Workflow CSV](../../../docs/agents/development-workflow.csv)
