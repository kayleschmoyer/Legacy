# Legacy Sports MCP Servers

Model Context Protocol (MCP) servers that extend VS Code Copilot with project-specific tools.

## Servers

### jira-server

Wraps Jira operations with guardrails using the Jira REST API (with env var / netrc credential support):

- **jira_create_ticket** — Create tickets via REST API
- **jira_transition** — Transition ticket status with validation
- **jira_view** — Structured ticket details with blocker info
- **jira_check_blockers** — Automates the 3-way dependency check
- **jira_set_parent** — Set parent epic via Jira REST API

See `.github/skills/mcp-jira/SKILL.md` for usage.
