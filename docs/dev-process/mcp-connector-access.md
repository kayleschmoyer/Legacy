# MCP Connector Access Guide

How a new developer gets access to the three hosted MCP servers (`legacy-sports-jira`, `legacy-sports-github`, `legacy-sports-ci`). Two paths exist depending on how you run Claude Code.

## Which path applies to you?

| Client                                                                  | Path                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Local Claude Code** (desktop app, CLI, VS Code / JetBrains extension) | **Track B** — per-user OAuth via custom connectors                          |
| **Claude Code on the web** (claude.ai/code)                             | **Track B** — per-user OAuth via custom connectors                          |
| **Copilot Coding Agent**                                                | **Track A** — machine credential (provisioned by `copilot-setup-steps.yml`) |

---

## Track A — Machine credential (Copilot Coding Agent only)

> **Local Claude Code developers do not need this track.** Track A is only required for Copilot Coding Agent, which cannot participate in OAuth connector flows. Local Claude Code sessions (desktop app, CLI, IDE extensions) use Track B below.

The three MCP servers authenticate using a short-lived Cognito `client_credentials` token that `scripts/mcp-mint-token.mjs` mints at every (re)connect. No Cognito user account is needed — the credential is a service-level machine secret, not tied to a person.

### Prerequisites

You need AWS SSO access with read permission to two resources in the `dev` account:

- SSM Parameter Store: `/<name_prefix>/mcp/cognito/machine-client-id`
- Secrets Manager: `dev/mcp-machine-client-secret`

If you don't have those permissions, ask an AWS account admin to grant `ssm:GetParameter` on that path and `secretsmanager:GetSecretValue` on that secret.

### Setup steps

1. Ensure your AWS SSO session is active (`aws sso login` if not already signed in).
2. From the repo root, run:
   ```bash
   node scripts/mcp-auth.mjs --setup
   ```
   On a first-time setup use `--setup`; subsequent refreshes only need `node scripts/mcp-auth.mjs` (no flag).
3. The script writes `MCP_JIRA_URL`, `MCP_GITHUB_URL`, `MCP_CI_URL`, and the machine credential to `.env.local`.
4. **Restart Claude Code.** The launcher re-reads `.env.local` at session start; running the script mid-session does not propagate the values to already-spawned transports.

### Verifying connection

At session start, call `auth_check_all` (worktree MCP server). All three hosted servers should report `authenticated: true`. If any report `false`, re-run `node scripts/mcp-auth.mjs` and restart.

---

## Track B — OAuth via custom connectors (local Claude Code + web)

Both local Claude Code (desktop app, CLI, IDE extensions) and Claude Code on the web use this path. The three servers expose MCP OAuth 2.0 Authorization endpoints (Protected Resource Metadata + `401`/`WWW-Authenticate` challenge — LS-5095), and a claude.ai Org Owner registers them as **custom remote connectors** once. After that, the connectors auto-sync into every Claude Code session (local and web) for any user in the org — no `.env.local` or machine credential is needed for local developers.

### Step 1 — Get a Cognito user account (requires an Org Owner)

Track B uses per-user OAuth, so you need an account in the `${name_prefix}-mcp-dev` Cognito user pool. An Org Owner must create it:

1. Open the **AWS Console** → Cognito → User pools → select `${name_prefix}-mcp-dev`.
2. Go to **Users** → **Create user**.
3. Choose **Send an email invitation** (admin-invite flow).
4. Enter the new developer's email address and set a temporary password, or let Cognito generate one.
5. Click **Create user**. Cognito sends the invite email automatically.

The new developer receives the invite email and sets their own permanent password on first sign-in via the Cognito hosted UI.

> **What permissions does the new user get?**  
> Pool membership equals full MCP access. The `mcp_connector` app client grants scopes `mcp/jira`, `mcp/github`, and `mcp/ci` — all three servers — to every user in the pool. There is no per-user scope restriction.

### Step 2 — Connect in Claude Code (local or web)

Once your Cognito account exists:

1. Go to **claude.ai** → Settings → Connectors (or Org settings → Connectors for Org Owners).
2. Find the three pre-registered connectors:
   - `legacy-sports-jira`
   - `legacy-sports-github`
   - `legacy-sports-ci`
3. Click **Connect** on each and complete the Cognito OAuth consent flow that opens.
4. After all three are connected, the `mcp__legacy-sports-*` tools appear automatically in your Claude Code sessions — both local (desktop app, CLI, IDE extensions) and web.

> **Connector registration is a one-time owner action.** The connectors are already registered in claude.ai. Developers only need to consent (Step 2), not register. If a connector is missing, ask an Org Owner to re-register it under Org settings → Connectors using each server's API Gateway URL.

### Residual limitation — re-consent on token expiry

Claude Code does **not** auto-refresh MCP OAuth tokens mid-session ([claude-code#58607](https://github.com/anthropics/claude-code/issues/58607)). If a session outlives the OAuth access token lifetime, the three MCP servers will stop responding. This affects both local and web Track B sessions. To recover:

1. Run `/mcp` in the Claude Code session (local or web).
2. Re-consent for each affected connector.

This is an upstream platform gap, not a server bug.

---

## Revoking access

| Action                                                                                           | Effect                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disable the Cognito user** (AWS Console → Cognito → user pool → Users → select user → Disable) | Blocks new token issuance immediately. Existing tokens remain valid until they expire (JWTs are self-validating; no earlier revocation).                                                        |
| **Delete the Cognito user**                                                                      | Same as disable, plus removes the account permanently.                                                                                                                                          |
| **Rotate or revoke the machine secret**                                                          | Affects Track A (Copilot Coding Agent only). See [`docs/authentication/mcp-machine-credential-lifecycle.md`](../authentication/mcp-machine-credential-lifecycle.md) for the revocation runbook. |

Because existing tokens survive until their TTL, a freshly disabled user may continue to reach the MCP servers for a short window. If immediate revocation is needed (security incident), refer to the machine-credential lifecycle runbook for the fast-revocation procedure.

---

## See also

- [`docs/authentication/mcp-machine-credential-lifecycle.md`](../authentication/mcp-machine-credential-lifecycle.md) — Track A credential rotation and revocation.
- [`docs/dev-process/session-startup.md`](./session-startup.md) — How the Track A machine credential is minted at session start (Copilot Coding Agent).
- [`.agents/skills/cloud-agent-mode/SKILL.md`](../../.agents/skills/cloud-agent-mode/SKILL.md) — Full Track B operating guide for Claude Code web sessions.
- [`.agents/skills/mcp-diagnostics/SKILL.md`](../../.agents/skills/mcp-diagnostics/SKILL.md) — Diagnostic checklist for MCP server connection failures.
