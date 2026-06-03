# Claude Code Session Startup

Human-facing reference for what happens between "launcher fires" and "agent's first turn" in a Claude Code session — the hook chain that prepares a worktree for MCP-server connections, the precondition checks that surface failures, and the env-loading ordering that determines whether the 10 MCP servers come up authenticated.

The authoritative ordering for diagnostics lives in [`.agents/skills/mcp-diagnostics/SKILL.md`](../../.agents/skills/mcp-diagnostics/SKILL.md); this doc is the orientation. The bug that prompted this doc — false-positive `[MCP WARNING] .env.local not found` output — is fixed in LS-4505 by chaining `check-mcp-servers.sh` sequentially after `setup-worktree-symlink.sh` instead of registering it as a sibling SessionStart entry.

## At a glance

![Session startup sequence](./diagrams/session-startup-sequence.svg)

Three things happen, roughly in order:

1. **Launcher env load** — Claude Code reads `.env.local` from `CLAUDE_PROJECT_DIR`, expands `${MCP_*}` placeholders inside `.mcp.json`, and prepares to spawn MCP servers.
2. **SessionStart hooks fire in parallel** — five entries in [`.claude/settings.json`](../../.claude/settings.json) execute concurrently. Four are independent. The fifth — `setup-worktree-symlink.sh` — owns a small **sequential sub-chain** of its own.
3. **MCP servers spawn** — fed by the env loaded in step 1, independent of hook ordering.

## The SessionStart entries

These five hooks run in parallel — Claude Code does not guarantee ordering between sibling SessionStart entries. Any dependency between them must be encoded inside a single entry, not assumed.

| Hook                                                                           | Purpose                                                                                                   | Independent?                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| [`setup-worktree-symlink.sh`](../../.claude/hooks/setup-worktree-symlink.sh)   | Create `node_modules` and `.env.local` symlinks in ephemeral worktrees, then chain `check-mcp-servers.sh` | **No** — owns its own sub-chain |
| [`setup-worktree-symlink.ps1`](../../.claude/hooks/setup-worktree-symlink.ps1) | Same as above for PowerShell-only environments; idempotent with the bash version                          | Yes (duplicate, safe)           |
| [`check-github-auth.sh`](../../.claude/hooks/check-github-auth.sh)             | Verify `gh` token is present and unexpired                                                                | Yes                             |
| [`check-workspace-auth.sh`](../../.claude/hooks/check-workspace-auth.sh)       | Verify workspace credentials                                                                              | Yes                             |
| [`reset-tool-count.sh`](../../.claude/hooks/reset-tool-count.sh)               | Reset the per-session tool-call counter that feeds the compact reminder                                   | Yes                             |

## The sequential sub-chain inside `setup-worktree-symlink.sh`

This is the part that LS-4505 changed. `check-mcp-servers.sh` reads two artifacts — the `node_modules/.bin/tsx` symlink target and the `.env.local` symlink — that **`setup-worktree-symlink.sh` is responsible for creating**. That makes it an ordering dependency, not a concurrent peer. The pre-fix design registered `check-mcp-servers.sh` as a sibling SessionStart entry, leaving the ordering to chance and producing intermittent false-positive `[MCP WARNING] .env.local not found` output when the check raced setup.

The fix is sequential invocation, not retries:

```bash
# Inside setup-worktree-symlink.sh, after the setup script returns:
CHECK_SCRIPT="$(dirname "$0")/check-mcp-servers.sh"
if [ -x "$CHECK_SCRIPT" ]; then
  "$CHECK_SCRIPT"
elif [ -f "$CHECK_SCRIPT" ]; then
  bash "$CHECK_SCRIPT"
fi
```

`check-mcp-servers.sh` remains a standalone file so it can still be invoked ad-hoc for diagnostics (`bash .claude/hooks/check-mcp-servers.sh`); it just no longer has its own entry in `.claude/settings.json`.

### Why not just add retries?

The pre-fix code already polled for `node_modules/.bin/tsx` for up to 3 seconds before warning. That polling masked the same race the `.env.local` check was hitting — it papered over an ordering dependency instead of expressing it. Retries make the warning "less wrong on average" but never eliminate it, because the race window scales with resolver runtime (`node scripts/modules-pool/link.mjs` re-links in milliseconds on a pool hit but runs a full `pnpm install` on a cold-lockfile miss). LS-4505 removed the retry loop alongside the sibling registration.

## MCP-server launch (independent of hook ordering)

Once the launcher has loaded `.env.local` and expanded `${MCP_*}` placeholders, it spawns each server in [`.mcp.json`](../../.mcp.json). There are two flavors:

- **stdio servers** (`worktree`, `legacy-sports-make`, `legacy-sports-nx`, `legacy-sports-db`, `legacy-sports-ci-local`, `legacy-sports-aws`, `legacy-sports-browser`, `legacy-sports-dev-process`) start with `node .github/copilot/hooks/mcp-bootstrap.mjs node --import tsx tools/mcp/<srv>/src/index.ts`. The bootstrap shim only repairs the `node_modules` symlink if needed; **it does not read `.env.local`**, so it cannot race with symlink setup the way the precondition check did.
- **3 OAuth connector servers** (`legacy-sports-jira`, `legacy-sports-github`, `legacy-sports-ci`) are **not** entries in `.mcp.json`. They connect via OAuth custom remote connectors registered in claude.ai by an Org Owner (Org settings → Connectors) and auto-sync into every Claude Code session for users on the same account. No `.env.local` or machine credential is needed. If they are absent from the session, the OAuth session may need (re-)consent — prompt the user to check `/mcp` or Org settings → Connectors. See [`.agents/skills/cloud-agent-mode/SKILL.md`](../../.agents/skills/cloud-agent-mode/SKILL.md) and the [MCP Connector Access Guide](./mcp-connector-access.md).

The `mcp-bootstrap.mjs` audit performed alongside LS-4505 confirmed it touches only `node_modules` (no `.env.local` read). The race described in this doc is **purely** about the SessionStart hook ordering; bootstrap is unaffected.

## When you see `[MCP WARNING] ...`

Real warnings (post-LS-4505) mean what they say. Walk the checklist:

| Warning                            | Cause                                                 | First fix to try                                                            |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `node_modules/.bin/tsx is missing` | Symlink absent, broken, or the pool slot is unhealthy | `node scripts/modules-pool/link.mjs` from worktree root (or `make install`) |
| `.mcp.json not found`              | `CLAUDE_PROJECT_DIR` not set to the worktree path     | Restart Claude Code from inside the worktree                                |
| `mcp-bootstrap.mjs missing`        | File deleted from working tree                        | `git checkout main -- .github/copilot/hooks/mcp-bootstrap.mjs`              |

The full diagnostic checklist (including pre-flight `auth_check_all` and the report-don't-fall-back protocol) is [`.agents/skills/mcp-diagnostics/SKILL.md`](../../.agents/skills/mcp-diagnostics/SKILL.md).

## One-time migration for existing developers (LS-5219)

If you ran the old interactive PKCE flow before LS-5094, your `.env.local` and Claude Code settings files may still contain stale vars (`MCP_AUTH_TOKEN`, `MCP_AUTH_REFRESH_TOKEN`, `MCP_AUTH_EXPIRES_AT`, `MCP_AUTH_CLIENT_ID`). Run the following once after pulling to purge them and refresh your machine credential:

```bash
node scripts/mcp-auth.mjs --force
```

`mcp-auth.mjs` now removes those keys automatically on every run (LS-5219), so no further action is required after this one-time cleanup.

## See also

- [`.agents/skills/mcp-diagnostics/SKILL.md`](../../.agents/skills/mcp-diagnostics/SKILL.md) — the executable diagnostic checklist this doc orients you to.
- [`.agents/skills/mcp-first/SKILL.md`](../../.agents/skills/mcp-first/SKILL.md) — server load order and per-server tool substitution table.
- [`AGENTS.md` § MCP Servers](../../AGENTS.md#mcp-servers) — agent-facing rules for MCP-server health.
- [`scripts/modules-pool/link.mjs`](../../scripts/modules-pool/link.mjs) — the dependency-free Node resolver that owns `node_modules` pool-slot linking and `.env`/`.env.local` symlinking.
