# Legacy Sports MCP Servers

Model Context Protocol (MCP) servers that extend VS Code Copilot with project-specific tools.

## Servers

### jira-server

Wraps Jira operations with guardrails, working around known acli bugs:

- **jira_create_ticket** — Create tickets (avoids `--json` duplication bug)
- **jira_transition** — Transition ticket status with validation
- **jira_view** — Structured ticket details with blocker info
- **jira_check_blockers** — Automates the 3-way dependency check
- **jira_set_parent** — Set parent epic via REST API (acli can't do this)

See `.github/skills/mcp-jira/SKILL.md` for usage.
