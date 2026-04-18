---
name: credentials
description: 'Pre-flight auth check for all workspace services (GitHub, Jira, AWS, CI). Load at the start of any workflow that touches PRs, tickets, cloud resources, or CI runs. Defines the check-before-use pattern: always verify token presence first; if missing, surface a login prompt and stop — never auto-generate tokens or initiate OAuth flows.'
---

# Skill: Credentials

## When to Load

Load this skill at the start of any workflow that requires external service access:

- Creating, reviewing, or merging GitHub PRs
- Reading or transitioning Jira tickets
- Querying AWS resources (logs, SSM, secrets, Lambda)
- Triggering or inspecting CI runs

## The Rule: Check First, Never Generate

**Always call `auth_check_all` before the first operation that requires auth.**

```
auth_check_all()
```

If `allAuthenticated: false`, read the `hint` for each failing service, surface it to the user, and **stop**. Do not attempt the operation. Do not try to authenticate on the user's behalf.

## What Agents Must Never Do

- Run `gh auth login`, `aws sso login`, or any token-generation shell command unattended
- Trigger OAuth device flows from within the agent session
- Fall back to `acli` or raw `curl` with auth headers as a workaround for missing tokens
- Proceed with a workflow after `auth_check_all` reports a failing service

## Recovery Pattern

When `auth_check_all` returns `ok: false` for one or more services:

1. Surface the `hint` text for each failing service verbatim to the user
2. Wait for the user to authenticate in their terminal (per the hint instructions)
3. Remind the user: **MCP servers read credentials at startup — restart the Claude Code session after authenticating** so the new tokens are picked up

Example response when Jira is not configured:

> Jira credentials are not configured. Set `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.mcp.json` env
> (generate at https://id.atlassian.com/manage-profile/security/api-tokens), then restart the
> session. I'll wait — let me know when you're ready.

## Service Reference

| Service    | Tokens checked                                                                                                   | Login instruction                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **GitHub** | `GH_TOKEN`, `GITHUB_TOKEN`, `AGENT_AUTHOR_APP_PRIVATE_KEY`, cached file, `.netrc`                                | Set `GH_TOKEN` in `.mcp.json` env, or run `gh auth login` in terminal, then restart session |
| **Jira**   | `JIRA_EMAIL`+`JIRA_API_TOKEN` (basic) or `JIRA_CLIENT_ID`+`JIRA_CLIENT_SECRET`+`JIRA_CLOUD_ID` (OAuth), `.netrc` | Set `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.mcp.json` env, then restart session              |
| **AWS**    | `AWS_PROFILE` + active SSO session (verified via `sts get-caller-identity`)                                      | Run `aws sso login --profile <profile>` in terminal                                         |
| **CI**     | Same GitHub token as above                                                                                       | Same as GitHub                                                                              |

## MCP Tool

`auth_check_all` lives in the `worktree` MCP server. It is a **read-only** token presence check — it never generates, refreshes, or initiates any auth flow.

Return shape:

```json
{
  "allAuthenticated": true,
  "services": {
    "github": { "ok": true, "method": "env:GH_TOKEN" },
    "jira": { "ok": true, "method": "netrc" },
    "aws": { "ok": true, "profile": "default", "userId": "AROA..." },
    "ci": { "ok": true, "method": "env:GH_TOKEN" }
  }
}
```

When a service is not authenticated, `ok: false` and a `hint` field with login instructions are returned instead of `method`/`userId`.

## Related Skills

- [secrets-handling](../secrets-handling/SKILL.md) — Never embed raw secret values in tool calls
- [add-secret-or-env-var](../add-secret-or-env-var/SKILL.md) — Adding a new secret to the infrastructure
- [cloud-agent-mode](../cloud-agent-mode/SKILL.md) — Auth configuration for cloud coding agents
