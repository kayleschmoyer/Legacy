# Legacy Sports MCP Servers

Model Context Protocol (MCP) servers that extend AI coding agents with project-specific tools.

## Cross-Client Discovery

MCP server configuration is maintained in multiple files to support different AI clients:

| File                       | Client(s)                         | Top-level key | Env var syntax |
| -------------------------- | --------------------------------- | ------------- | -------------- |
| `.vscode/mcp.json`         | VS Code Copilot, Cursor, Windsurf | `servers`     | `${env:VAR}`   |
| `.github/copilot/mcp.json` | GitHub Copilot (agent mode)       | `servers`     | `${VAR}`       |
| `.mcp.json`                | Claude Code CLI                   | `mcpServers`  | `${VAR}`       |

**Keep all files in sync.** When adding or removing a server, update all config files. The `create-mcp-server` skill (`.agents/skills/create-mcp-server/SKILL.md`) documents the full registration steps.

### Config Differences

VS Code and GitHub Copilot (agent mode) use a `"type": "stdio"` field per server; Claude Code omits it (stdio is the default transport). VS Code env var references use `${env:VAR_NAME}` while the other clients use `${VAR_NAME}`.

## Servers

### jira-server

> **Server ID:** `legacy-sports-jira`

Wraps Jira operations with guardrails using the Jira REST API (with env var / netrc credential support):

- **jira_create_ticket** — Create tickets via REST API
- **jira_transition** — Transition ticket status with validation
- **jira_view** — Structured ticket details (summary, status, type, priority, description, assignee, reporter, labels, timestamps, blockers)
- **jira_check_blockers** — Automates the 3-way dependency check
- **jira_set_parent** — Set parent epic via Jira REST API
- **jira_get_comments** — Fetch all comments on a ticket with author and plain-text body

See `.agents/skills/mcp-jira/SKILL.md` for usage.

### db-server

> **Server ID:** `legacy-sports-db`

Database operations with built-in safety guardrails:

- **db_migration_status** — Check pending database migration status
- **db_migrate** — Apply pending database migrations
- **db_query** — Execute ad-hoc SQL queries (read-only by default)
- **db_print_schema** — Regenerate `schema.graphql` from Pothos schema
- **db_check_health** — Pre-flight health check (Docker, Postgres, migrations)

See `.agents/skills/mcp-db/SKILL.md` for usage.

### worktree-server

> **Server ID:** `worktree`

Git worktree management for parallel ticket work:

- **worktree_list** — List active worktrees with junction status and branch info
- **worktree_set** — Set the active worktree for subsequent commands
- **worktree_run** — Run a shell command in the active worktree
- **worktree_guard** — Check whether a path is inside the main repo (warns if worktrees are active)

### aws-server

> **Server ID:** `legacy-sports-aws`

AWS CloudWatch logs and SSO authentication health:

- **aws_logs_tail** — Fetch recent CloudWatch logs for a Lambda function (wraps `aws logs tail`; auto-sets `AWS_PAGER=""` and `PYTHONIOENCODING=utf-8`)
- **aws_sso_status** — Check AWS SSO authentication status via `aws sts get-caller-identity`; returns caller identity or a structured remedy on failure

See `.github/skills/cloudwatch-logs/SKILL.md` and `.github/skills/aws-sso-login/SKILL.md` for context.
