# Cursor Setup Guide

How to run this repository with **Cursor** so the agent connects to our MCP servers
and stops falling back to raw bash. Cursor reads `AGENTS.md` and `.cursor/rules/*`
automatically, but MCP servers and credentials need a one-time setup.

> **TL;DR of the differences from Claude Code:** Cursor has **no hooks** and **no
> Skills/slash commands**. The worktree `node_modules` symlink, `.env.local`, and the
> safety guardrails that Claude Code's hooks provide are not automatic here — see
> [What Cursor does NOT do](#what-cursor-does-not-do).

---

## 1. Prerequisites (Windows)

- **Windows Developer Mode ON** (Settings → For developers). The MCP bootstrap shim
  creates the worktree `node_modules` **directory symlink**, which requires it.
- Node 18+ and `pnpm` (via corepack), same as the rest of the repo.
- `node_modules` present at the repo / worktree root. If a worktree is missing it, run
  `node scripts/modules-pool/link.mjs` from the worktree root once.

## 2. Enable the MCP servers in Cursor

Cursor does **not** auto-enable project MCP servers. After opening the repo:

1. **Settings → MCP** (or **Tools & Integrations → MCP**).
2. Cursor reads [`.cursor/mcp.json`](../../.cursor/mcp.json) and lists every server.
3. Toggle each on and approve the trust prompt.

The **local stdio** servers (`worktree`, `-aws`, `-nx`, `-make`, `-browser`,
`legacy-sports-ci-local`) connect immediately once `node_modules` exists —
they cover the tools that otherwise become bash: `make_run`, `worktree_*`, `nx_run`,
etc. **These are the highest-value servers for reducing bash usage.** Database
operations now run via the hosted `legacy-sports-db-admin` server (`db_query`,
`db_migration_status`, `db_migrate`) or shell commands.

The **hosted HTTP** servers (`legacy-sports-github`, `-jira`, `-ci`) additionally need
bearer tokens — see the next step.

## 3. Hosted-server credentials (GitHub / Jira / CI)

These three run behind Cognito-fronted API Gateways. **Cursor cannot complete an OAuth
flow against them** (Cognito has no Dynamic Client Registration, and our OAuth-connector
path is claude.ai-specific). So `.cursor/mcp.json` injects a **static bearer** per server
via Cursor's `${env:VAR}` header substitution, which reads from the shell environment
that launched Cursor.

You first need the machine credential in `.env.local` (one time) — see
[mcp-connector-access.md → Track A](./mcp-connector-access.md). Then, **before launching
Cursor**, mint and export the three bearers:

**PowerShell (Windows):**

```powershell
node scripts/mcp-cursor-bearers.mjs | Invoke-Expression
cursor .   # launch Cursor from this same shell so it inherits the vars
```

**bash / zsh (macOS / Linux):**

```bash
eval "$(node scripts/mcp-cursor-bearers.mjs --bash)"
cursor .
```

This sets `MCP_GITHUB_BEARER`, `MCP_JIRA_BEARER`, and `MCP_CI_BEARER`.

> **Tokens are short-lived (~24h) and Cursor does not auto-refresh them.** When the
> hosted servers start returning 401, re-run the command above and reload the MCP
> servers (Settings → MCP → reload) or relaunch Cursor. This daily-mint trade-off is
> the known limitation of the static-bearer approach; see the human-review note below.

## 4. Verify

In a Cursor chat, ask the agent to run a trivial MCP call (e.g. list worktrees, or
`make_run` a no-op). If it reaches for bash instead, the server isn't connected —
recheck Settings → MCP and that the bearer vars are set in the launching shell.

---

## What Cursor does NOT do

These are handled by Claude Code hooks/Skills and have **no equivalent** in Cursor —
you self-enforce (the rules in [`.cursor/rules/00-core.mdc`](../../.cursor/rules/00-core.mdc)
restate them):

| Claude Code feature                       | Cursor status | Mitigation                                                 |
| ----------------------------------------- | ------------- | ---------------------------------------------------------- |
| SessionStart `node_modules` symlink setup | ✗ not run     | Run `node scripts/modules-pool/link.mjs` once per worktree |
| `.env.local` symlink into worktree        | ✗ not created | Ensure `.env.local` exists at the workspace root           |
| PreToolUse main-repo write-guard          | ✗ not run     | Don't edit / commit in `main`; use a branch                |
| PreToolUse MCP-first nudge                | ✗ not run     | Follow the MCP-first rule manually                         |
| Stop incomplete-work / draft-PR block     | ✗ not run     | Drive PRs to merged yourself                               |
| Skills (`/work-ticket`, `/review`, …)     | ✗ unavailable | Do the steps manually                                      |

---

## Human-review note (auth direction)

> Cursor cannot use our hosted servers' native OAuth — it requires Dynamic Client
> Registration, which our Cognito pool doesn't support. The same gap affects OpenAI
> Codex. Full cross-environment context: [llm-environments.md](./llm-environments.md)
> → "The DCR gap".

The static-bearer approach above works today with **no infra changes** but requires a
daily re-mint. A better long-term path is **OAuth with a pre-registered client**:

1. An org owner registers a Cognito app client (`allowed_oauth_flows = ["code"]`, PKCE)
   whose callback is Cursor's fixed redirect `cursor://anysphere.cursor-mcp/oauth/callback`.
2. The three Lambdas serve the MCP Authorization spec (Protected Resource Metadata +
   `401` `WWW-Authenticate` pointing at Cognito).
3. `.cursor/mcp.json` then uses bare URLs + an `auth` block (CLIENT_ID + scopes), and
   Cursor handles browser login and **auto-refresh**.

That is infra work beyond this repo PR. Until it lands, use the static-bearer flow.
