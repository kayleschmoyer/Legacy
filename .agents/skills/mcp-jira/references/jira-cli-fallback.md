# Jira CLI Fallback Commands (acli)

Use these commands only when MCP tools (`jira_*`) are unavailable.

## Tool Priority

| Operation         | MCP Tool (preferred)  | acli CLI (fallback)                                                  |
| ----------------- | --------------------- | -------------------------------------------------------------------- |
| View ticket       | `jira_view`           | `acli jira workitem view LS-####`                                    |
| Create ticket     | `jira_create_ticket`  | `acli jira workitem create --project LS --type Task --summary "..."` |
| Transition status | `jira_transition`     | `acli jira workitem transition --key LS-#### --status "In Progress"` |
| Check blockers    | `jira_check_blockers` | `acli jira workitem link list --key LS-####`                         |
| Set parent epic   | `jira_set_parent`     | REST API (see below)                                                 |
| Fetch comments    | `jira_get_comments`   | `acli jira workitem comment list --key LS-####`                      |

## Common CLI Operations

```powershell
# View ticket details
acli jira workitem view LS-1234

# Update ticket status
acli jira workitem transition --key LS-1234 --status "In Progress"
acli jira workitem transition --key LS-1234 --status "In Review"
acli jira workitem transition --key LS-1234 --status "Done"

# Create ticket
acli jira workitem create --project LS --type "Task" \
  --summary "Your task summary" \
  --description "Detailed description"

# Assign to yourself
acli jira workitem assign --key LS-1234 --assignee @me

# Add comment
acli jira workitem comment create --key LS-1234 \
  --body "Work in progress, will update soon"

# Link tickets
acli jira workitem link create --out LS-NEW --in LS-ORIG --type Relates
```

## Attachments

```powershell
# List attachments
acli jira workitem attachment list --key LS-1234 --json

# Download using .netrc credentials (acli only lists, not downloads)
$json = acli jira workitem attachment list --key LS-1234 --json | ConvertFrom-Json
$att = $json.attachments[0]
$jiraBase = 'https://bkrupa.atlassian.net'  # your org's Jira base URL
$netrc = Get-Content "$env:USERPROFILE\.netrc" -Raw
if ($netrc -match 'machine\s+\S*atlassian\.net\s+login\s+(\S+)\s+password\s+(\S+)') {
    $base64 = [Convert]::ToBase64String(
        [Text.Encoding]::ASCII.GetBytes("$($Matches[1]):$($Matches[2])")
    )
    $headers = @{ Authorization = "Basic $base64" }
    $url = "$jiraBase/rest/api/3/attachment/content/$($att.id)"
    Invoke-WebRequest -Uri $url -Headers $headers -OutFile "scratch/$($att.name)"
}
```

## Set Parent Epic (REST API)

The `acli` CLI does **not** support setting parent on existing tickets:

```powershell
$jiraBase = 'https://bkrupa.atlassian.net'  # your org's Jira base URL
$netrc = Get-Content "$env:USERPROFILE\.netrc" -Raw
if ($netrc -match 'machine\s+\S*atlassian\.net\s+login\s+(\S+)\s+password\s+(\S+)') {
    $base64 = [Convert]::ToBase64String(
        [Text.Encoding]::ASCII.GetBytes("$($Matches[1]):$($Matches[2])")
    )
    $headers = @{ Authorization = "Basic $base64" }
}
Invoke-RestMethod `
  -Uri "$jiraBase/rest/api/3/issue/LS-598" `
  -Method PUT -Headers $headers -ContentType "application/json" `
  -Body '{"fields":{"parent":{"key":"LS-722"}}}'
```

## Sprints & Search

```powershell
# Find active sprint
acli jira sprint list --board-id LS --state active

# Add ticket to sprint
acli jira sprint add --sprint-id <id> --issue LS-1234

# JQL search
acli jira workitem search \
  --jql "project = LS AND parent = LS-722 AND status != Done" \
  --fields "key,summary,status" --csv
```

## Investigation Tickets

When an investigation ticket results in a new backlog ticket:

1. Transition investigation to **In Progress**
2. Investigate and document findings
3. Create a new backlog ticket for the fix
4. Link: `acli jira workitem link create --out LS-NEW --in LS-ORIG --type Relates`
5. Comment on investigation with findings + new ticket reference
6. Transition investigation to **Done** immediately

> **Rationale:** The investigation's deliverable is the findings + backlog ticket, not a code change.

## De-scoping Work

```powershell
# Create follow-up ticket for de-scoped work
acli jira workitem create --project LS --type "Story" \
  --summary "Follow-up: UI components" \
  --description "Work de-scoped from LS-ORIG"
acli jira workitem link create --out LS-NEW --in LS-ORIG --type Relates
```

## Known Issues

- **`acli jira workitem create --json` creates duplicate tickets** — don't use `--json` on create commands.
- **`acli` not found** — refresh PATH: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`
