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

## Preconditions

**Before any external-service operation: call `auth_check_all`.**

```
auth_check_all()
```

**Before proceeding past `auth_check_all`: `allAuthenticated: true`.** If `false`, surface the `hint` for each failing service verbatim to the user and wait for them to authenticate. Token generation, OAuth device flows, `gh auth login`, `aws sso login`, and similar credential-creating commands are user actions — running them from the agent session bypasses the user's terminal context and produces tokens scoped to the wrong identity. Falling back to `acli` or raw `curl` with auth headers does not work around a missing token; it produces an unauthenticated request that fails differently.

## Mid-Session Token Expiry (URL MCP Servers)

The 3 URL-based MCP servers (`legacy-sports-github`, `legacy-sports-jira`, `legacy-sports-ci`) authenticate with the Cognito ID token in `MCP_AUTH_TOKEN` (~8 h TTL) that is baked into the request headers when the transport is spawned at session start. If that token expires **during** a session, those servers begin returning HTTP 401 with a body Claude Code's MCP transport cannot parse, surfacing as `ZodError: expected string, received undefined` on every call. **The agent cannot recover this mid-session** — writing a fresh token to `.env.local` does not propagate to the already-spawned transports.

When you recognise the symptom:

1. Surface the recovery prompt verbatim to the user — run `node scripts/mcp-auth.mjs` to refresh, then **restart the Claude Code session**.
2. **Precondition for resuming MCP calls: the session has been restarted with a fresh token.** Retrying the failing tool in the current session re-uses the same expired transport headers and fails identically. `gh` / `acli` / `curl` fallbacks bypass the MCP server entirely and so do not exercise the broken auth path the user needs to fix — wait for the restart.

Full diagnosis and the exact prompt to send are in `.agents/skills/mcp-diagnostics/SKILL.md` (Mid-Session 401 / Token Expiry section).

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
