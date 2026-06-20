# Supported LLM / Agent Environments

Which AI coding environments this repo supports, how each one reaches our MCP
servers, and **why** the auth model differs between them. If you're wondering
"can I use $TOOL with this repo, and will the GitHub/Jira/CI tools work?", start
here.

> One-line answer: **every environment can run the local stdio MCP servers.** The
> three _hosted_ servers (GitHub / Jira / CI) sit behind a Cognito-fronted API
> Gateway, and how an environment authenticates to them depends on what that
> environment's MCP client supports — which is where the differences (and the
> [DCR gap](#the-dcr-gap-cursor--codex)) come from.

## Support matrix

| Environment                             | Config file                                            | Hosted-server (GitHub/Jira/CI) auth                                                                                              | Status                                                  |
| --------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Claude Code** (local + web)           | `.mcp.json` + OAuth connectors registered in claude.ai | OAuth, **pre-registered** connector client                                                                                       | ✅ Primary                                              |
| **Copilot Coding Agent** (cloud)        | `.github/copilot/mcp.json`                             | Static **machine bearer** (Cognito `client_credentials`, minted in CI)                                                           | ✅ Supported                                            |
| **VS Code** (Copilot Chat / agent mode) | `.vscode/mcp.json`                                     | OAuth, **static `oauth.clientId`**                                                                                               | ✅ Supported                                            |
| **Cursor**                              | `.cursor/mcp.json` + `.cursor/rules/`                  | Static **bearer header** via `${env:MCP_*_BEARER}`                                                                               | ✅ Supported (see [cursor-setup.md](./cursor-setup.md)) |
| **OpenAI Codex**                        | `.codex/config.toml`                                   | **Local stdio** for GitHub/Jira/CI (run locally); **static bearer** (`bearer_token_env_var`) for the HTTP-only `db-admin` server | ⚠️ Partial                                              |

All five also run the local **stdio** servers (`worktree`, `make`, `nx`, `db`,
`aws`, `browser`, …) via the shared `.github/copilot/hooks/mcp-bootstrap.mjs`
shim. Those need no gateway auth and are what replace most raw-bash usage.

## The four auth realities

Our hosted MCP Lambdas implement the MCP Authorization spec correctly
(`lib/mcp-bearer-auth`: Protected Resource Metadata at
`/.well-known/oauth-protected-resource`, `401` + `WWW-Authenticate`, JWT
validation against Cognito JWKS, per-server scopes `mcp/github|jira|ci`). The
constraint is **Cognito does not support OAuth 2.0 Dynamic Client Registration
(DCR, RFC 7591)** and never will. So a client reaches the hosted servers via
exactly one of:

1. **OAuth with a pre-registered (static) client** — the client is told a
   `client_id` up front; no `/register` call. ✅ Works against Cognito.
   _Used by: Claude Code (connector registered in claude.ai), VS Code
   (`oauth.clientId`)._
2. **Static bearer header** — a short-lived token is minted out-of-band and sent
   as `Authorization: Bearer …`. ✅ Works against any client that allows custom
   headers or a bearer env var. _Used by: Cursor, Copilot Coding Agent._
3. **Local stdio** — skip the gateway entirely; run the server as a subprocess
   that authenticates with its own credentials from `.env.local`. ✅ Always
   works. _Used by: Codex (for all three), and every env for the non-hosted
   servers._
4. **OAuth that requires DCR** — the client insists on calling `/register` to
   self-provision a `client_id`. ❌ **Fails against Cognito.** _This is the gap
   below._

## The DCR gap (Cursor + Codex)

**Cursor and OpenAI Codex both want OAuth, but only via DCR — and neither lets
you supply a pre-registered `client_id` today.** When pointed at one of our
hosted URLs, they call the authorization server's `/register` endpoint, Cognito
has none, and the connection fails. This is a limitation of those clients, not of
our servers (Claude Code and VS Code authenticate fine with the same endpoints).

Upstream tracking:

- **Cursor** — static client_id is an [open, unshipped feature request](https://forum.cursor.com/t/custom-mcp-client-no-option-to-disable-dynamic-client-registration-dcr-and-use-static-mcp-client-id-in-cursor-ide/110638) (`"dynamicRegistration": false` + `"clientId"` does not suppress the DCR call). CIMD (the Nov-2025 MCP-spec alternative to DCR) isn't implemented either.
- **Codex** — same gap: [openai/codex#19154](https://github.com/openai/codex/issues/19154) ("requires DCR; cannot use pre-registered client identity") and [#15818](https://github.com/openai/codex/issues/15818).

### How each works around it today

- **Cursor → static bearer.** `.cursor/mcp.json` injects `Bearer ${env:MCP_*_BEARER}`; tokens are minted by `scripts/mcp-cursor-bearers.mjs`. Trade-off: ~24h tokens, no auto-refresh (re-mint + reload). Full guide: [cursor-setup.md](./cursor-setup.md).
- **Codex → local stdio.** `.codex/config.toml` runs the GitHub/Jira/CI servers as local subprocesses instead of hitting the hosted gateway, so OAuth never enters the picture. The one exception is `legacy-sports-db-admin`, which is HTTP-only (no stdio entrypoint) and so is registered with `url` + `bearer_token_env_var = "MCP_DB_BEARER"` — the Cursor-style static-bearer approach (mint via `scripts/mcp-cursor-bearers.mjs`).

### How to actually close the gap (future work, not done)

Two viable upgrades, both needing a one-line Terraform change to register the
client's loopback redirect on `aws_cognito_user_pool_client.mcp_connector`
(`terraform/main/lambda-mcp-api-gateway.tf`) plus a `terraform apply`:

- **`mcp-remote` bridge** — Cursor/Codex launch [`npx mcp-remote <url> --static-oauth-client-info {…}`](https://github.com/geelen/mcp-remote) as a stdio server; mcp-remote runs the OAuth code+PKCE flow with our pre-registered connector client (`467i999ffpfja2vav4dilqk5lm`), bypassing DCR, with browser login + auto-refresh. No Lambda changes.
- **DCR shim on the Lambdas** — add an RFC 7591 `/register` endpoint that returns the existing public PKCE `client_id`, so the clients' _native_ OAuth succeeds. Cleaner UX, but Lambda code + deploy + a security review of the open `/register` endpoint.

## Per-environment detail

### Claude Code (local + web) — primary

Local stdio servers from `.mcp.json`; the three hosted servers come from **OAuth
custom connectors registered in claude.ai** (an Org Owner pre-registers the
Cognito connector client — Track B). Full onboarding:
[mcp-connector-access.md](./mcp-connector-access.md). This is the environment
AGENTS.md and the Skills/hooks are built for.

### Copilot Coding Agent (cloud)

`.github/copilot/mcp.json` uses `type: http` with
`"Authorization": "Bearer $MCP_*_BEARER"`. The bearers are short-lived Cognito
`client_credentials` tokens minted in `copilot-setup-steps.yml` from the machine
secret (Track A). Lifecycle:
[mcp-machine-credential-lifecycle.md](../authentication/mcp-machine-credential-lifecycle.md).

### VS Code (Copilot Chat / agent mode)

`.vscode/mcp.json` uses native OAuth with a **static** client id — this is the
clean reference for "OAuth without DCR":

```jsonc
"legacy-sports-github": {
  "type": "http",
  "url": "https://lhnqee219k.execute-api.us-east-1.amazonaws.com",
  "oauth": { "clientId": "467i999ffpfja2vav4dilqk5lm" }
}
```

VS Code does the browser login + token refresh itself; no daily minting.

### Cursor

`.cursor/mcp.json` (static bearer) + `.cursor/rules/00-core.mdc` (safety/MCP-first
rules, since Cursor runs no hooks or Skills). See [cursor-setup.md](./cursor-setup.md).

### OpenAI Codex

`.codex/config.toml` runs all servers — including GitHub/Jira/CI — as local
stdio subprocesses, so it never touches the hosted gateway and never hits the DCR
gap. The local GitHub/Jira/CI servers authenticate with their own credentials
from `.env.local`. Note Codex has no hooks or Skills either; AGENTS.md still
applies as the behavior guide.

## Why we support what we support

- **Claude Code is the primary target** — the Skills, hooks, and workflow tooling
  are built for it; everything else is "also works."
- **We support an environment when its MCP client can reach the hosted servers
  through one of the three working auth realities** without us standing up
  per-client infrastructure. VS Code (static-client OAuth), Copilot CA (machine
  bearer), and Cursor (static bearer) all clear that bar.
- **DCR-only OAuth is the disqualifier.** Until Cursor/Codex support a static
  client_id (or we add a DCR shim / mcp-remote bridge), those two get hosted
  access via bearer/stdio rather than native OAuth — a deliberate, documented
  trade-off, not an oversight.
