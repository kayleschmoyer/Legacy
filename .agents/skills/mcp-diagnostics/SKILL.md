---
name: mcp-diagnostics
description: Diagnose and recover from MCP server load failures — when ToolSearch returns empty for known tools (worktree_ping, github_create_pr, make_run, etc.), one or more MCP servers failed to connect silently. Covers node_modules symlink checks, .mcp.json validation, server source verification, and session restart steps.
---

# Skill: MCP Server Diagnostics (LS-3022)

## Symptom Recognition

An MCP server has silently failed to load when **any** of the following is true:

- `ToolSearch(query: "select:worktree_ping")` returns "No matching deferred tools found"
- `ToolSearch(query: "github_create_pr")` returns empty
- `ToolSearch(query: "make_run")` returns empty
- The `<system-reminder>` deferred tools list is empty or missing `mcp__legacy-sports-github__*`, `mcp__worktree__*`, `mcp__legacy-sports-make__*`, `mcp__legacy-sports-nx__*`
- The session's `[MCP WARNING]` output from `check-mcp-servers.sh` reports a failure

**Precondition for any `gh` / `git` / `make` shell fallback: the MCP failure is diagnosed and reported.** Silent fallback masks the failure, produces MCP gap audit entries, and prevents the user from fixing the underlying connectivity. Run the diagnostic checklist below first; only then decide whether a shell fallback is appropriate for the immediate operation.

## Diagnostic Checklist

Run these checks in order. Stop at the first failure and apply the recovery step.

### Check 1 — `node_modules/.bin/tsx`

7 of the 10 MCP servers are stdio and launch via `mcp-bootstrap.mjs` which runs `node --import tsx ...`. If `node_modules` is missing or broken, all 7 stdio servers silently time out during startup — Claude Code surfaces no error. The remaining 3 (jira, github, ci) connect via Streamable HTTP to the MCP HTTP API Gateways at `${MCP_JIRA_URL}`, `${MCP_GITHUB_URL}`, `${MCP_CI_URL}` with a Cognito bearer token, and do not need `tsx`.

Use `-f` (not `-x`) — pnpm stores binaries as symlinks; `-f` follows symlinks and fails for both absent files and broken symlinks, while `-x` on a broken symlink returns false but doesn't distinguish from truly absent.

```bash
test -f node_modules/.bin/tsx && echo "tsx: OK" || echo "MISSING: node_modules/.bin/tsx"
```

- **OK** → proceed to Check 2
- **MISSING** → see [Recovery: Missing node_modules](#recovery-missing-node_modules)

### Check 2 — `.mcp.json` exists in session root

```bash
test -f .mcp.json && echo ".mcp.json: OK" || echo "MISSING: .mcp.json"
```

- **MISSING** → `CLAUDE_PROJECT_DIR` may point to the wrong directory, or the file was deleted.
  Verify `echo $CLAUDE_PROJECT_DIR` matches the worktree path. The file lives at the repo root;
  in native-worktree sessions `CLAUDE_PROJECT_DIR` is symlinked so it resolves correctly.

### Check 3 — `mcp-bootstrap.mjs` exists

```bash
test -f .github/copilot/hooks/mcp-bootstrap.mjs && echo "bootstrap: OK" || echo "MISSING"
```

- **MISSING** → the bootstrap shim is absent. Run:
  ```bash
  git checkout main -- .github/copilot/hooks/mcp-bootstrap.mjs
  ```

### Check 4 — server source files present

```bash
for srv in worktree-server github-server jira-server make-server nx-server db-server ci-server aws-server browser-server; do
  test -f "tools/mcp/${srv}/src/index.ts" \
    && echo "${srv}: OK" \
    || echo "${srv}: MISSING — tools/mcp/${srv}/src/index.ts"
done
```

- **Any MISSING** → a server's source was removed from the working tree. Run `git status` to check
  for missing tracked files; `git checkout HEAD -- tools/mcp/<srv>/src/index.ts` to restore.

### Check 5 — MCP HTTP API Gateway auth (`.env.local`)

The 3 URL-based servers (jira, github, ci) connect via Streamable HTTP to the MCP HTTP API Gateways with a Cognito-issued bearer token. If `MCP_AUTH_TOKEN` is expired or the `MCP_*_URL` values are missing, the servers fail silently at request time.

```bash
for VAR in MCP_JIRA_URL MCP_GITHUB_URL MCP_CI_URL MCP_AUTH_TOKEN MCP_AUTH_EXPIRES_AT; do
  grep -q "^${VAR}=" .env.local && echo "${VAR}: set" || echo "${VAR}: MISSING"
done
```

- **All set + `MCP_AUTH_EXPIRES_AT` in the future** → proceed to Check 6
- **`MCP_AUTH_TOKEN` expired** → run `node scripts/mcp-auth.mjs` to refresh.
- **`MCP_AUTH_TOKEN` or `MCP_*_URL` missing** → run `node scripts/mcp-auth.mjs --setup` to bootstrap from scratch, then restart the session.

### Check 6 — `MCP_TIMEOUT` is ≥ 10 000 ms

All servers need at least 10 s startup headroom when `node_modules` is a symlink that must be resolved by the OS. The project default is set in `.claude/settings.json`.

```bash
echo "MCP_TIMEOUT: ${MCP_TIMEOUT:-unset (default applied by Claude Code)}"
```

- If unset or lower than `10000`, add to `.claude/settings.json`:
  ```json
  "env": { "MCP_TIMEOUT": "10000" }
  ```

## Recovery Steps

### Recovery: Missing node_modules

Run the pool resolver from your terminal (works before MCP servers are connected):

```bat
cd D:\code\legacy-sports\.claude\worktrees\<name>
node scripts/modules-pool/link.mjs
```

The resolver is idempotent — it links `node_modules` to the content-addressable pool slot for the worktree's lockfile (re-linking instantly on a hit, materialising it via `pnpm install --frozen-lockfile` on a miss), converts junctions to symlinks, and also symlinks `.env`/`.env.local` from the main repo. `make install` and `make wt-setup` do the same thing. **Directory symlinks require Windows Developer Mode** (Settings › System › For Developers › Developer Mode) — there is no independent-install fallback; if Developer Mode is off, enable it and re-run.

**After repair: restart the Claude Code session.** MCP servers are launched once at session start and do not reconnect automatically.

**Cloud agents (Copilot Coding Agent / Claude Code on the web):**
`mcp-bootstrap.mjs` detects the missing `node_modules` and runs `corepack pnpm install --frozen-lockfile` automatically. If it still fails, the bootstrap error is written to the server's stderr (visible in CI logs as `[mcp-bootstrap] ERROR: ...`). Check the GitHub Actions run logs for the `copilot-setup-steps` job.

**Native ephemeral worktrees (`.claude/worktrees/<name>/`):**
`mcp-bootstrap.mjs` detects both worktree patterns (Pattern A: `<repo>/.claude/worktrees/<name>`; Pattern B: `<root>/<repo>.worktrees/<name>`) and creates the symlink to the main repo's `node_modules`. Before LS-3716 was fixed, Pattern A fell through to the cloud branch, which incorrectly ran `corepack pnpm install` when `node_modules` was absent instead of creating the symlink.

### Recovery: Wrong session root / `CLAUDE_PROJECT_DIR`

In native-worktree sessions, `CLAUDE_PROJECT_DIR` must be the worktree path
(`.claude/worktrees/<name>/`), not the main repo root. If `pwd` returns the main repo root
when you expect a worktree path, the session was launched without the worktree checkbox or the
environment variable was overridden. Restart the session from the correct worktree.

## Reporting Protocol

When MCP servers are confirmed missing and recovery is not possible in the current session:

1. **State which servers are missing** — e.g. "all 10 custom MCP servers absent; deferred tools
   list is empty".
2. **State which check failed** — e.g. "Check 1 failed: `node_modules/.bin/tsx` missing".
3. **Do not silently fall back** — using `gh`/`git`/`make` Bash fallbacks without reporting
   produces false MCP gap audit entries and hides the root cause from the team.
4. **Surface the repair command** — give the user the exact `node scripts/modules-pool/link.mjs` command (or `make install`), run from the worktree root.
5. **Stop implementation until the session is healthy** — MCP tool availability is a gate, not
   an advisory. A session running on Bash fallbacks is not a valid implementation environment.

## Mid-Session 401 / Token Expiry (LS-4874)

The 3 URL-based servers (`legacy-sports-github`, `legacy-sports-jira`, `legacy-sports-ci`) authenticate every request with the Cognito ID token in `MCP_AUTH_TOKEN` (~8 h TTL). When that token expires **during** an active session, the API Gateway JWT authorizer rejects subsequent requests with HTTP 401 and a body of `{"message":"Unauthorized"}`. Claude Code's MCP transport tries to parse that body as a JSON-RPC response and fails Zod validation, surfacing an error in the tool result that looks like:

```
HTTP 401 ... ZodError: expected string, received undefined
  at path: error / jsonrpc
```

When you see that exact shape on **any** of the three URL servers mid-session, the diagnosis is **almost always token expiry**, not a server bug or a transient network failure.

### Recovery — agent steps

1. **Stop.** Do not retry, do not fall back to `gh` / `acli` / raw `curl` — that masks the failure and produces MCP gap audit entries.
2. **Surface the recovery prompt verbatim to the user** (the agent cannot complete this — it requires either interactive AWS SSO or a browser handshake the agent has no terminal for):

   > Your `MCP_AUTH_TOKEN` has expired mid-session, so `legacy-sports-github`, `legacy-sports-jira`, and `legacy-sports-ci` are returning HTTP 401. To recover:
   >
   > 1. In your terminal, run `node scripts/mcp-auth.mjs` (refresh) — or `node scripts/mcp-auth.mjs --setup` if the refresh token is also gone.
   > 2. **Restart this Claude Code session.** MCP servers read `MCP_AUTH_TOKEN` once at startup; writing a new value to `.env.local` mid-session does not propagate to the already-spawned transport.

3. **Wait for the user.** Do not proceed with implementation. A session running with these three servers down is not a valid environment for any workflow that touches GitHub, Jira, or CI.

### Why the agent can't auto-recover

- `aws_mcp_auth_refresh` (in the `legacy-sports-aws` MCP server) can write a fresh token to `.env.local`, but the URL-server transports were spawned at session start with the **old** token already baked into their `Authorization` header — they do not re-read `.env.local`. The new token only takes effect on the next session.
- AWS SSO login (`aws sso login`) is a user-only action per the credentials skill — agents must never run it.

### Why we surface this as documentation rather than fixing the parser

The `ZodError` originates inside Claude Code's MCP SDK (`StreamableHTTPClientTransport`), which validates every HTTP response against the JSON-RPC schema. We do not own that parser. The proper structural fix is to have our Lambdas return a well-formed JSON-RPC error envelope on auth failure (instead of API Gateway's raw `{"message":"Unauthorized"}`), which requires removing the API Gateway JWT authorizer and validating the bearer token inside each Lambda — tracked as **LS-4941**. Until that ships, recognising the symptom and prompting for re-auth is the recovery path.

## Pre-flight Auth Check (Separate from Load Failures)

Call `auth_check_all()` (worktree MCP server) at the start of any workflow requiring GitHub,
Jira, AWS, or CI access. This checks credentials, not server availability — a server can be
connected but unauthenticated. If `allAuthenticated: false`, surface the `hint` for each
failing service and stop. See `.agents/skills/credentials/SKILL.md`.

## See Also

- `docs/dev-process/session-startup.md` — sequence diagram + orientation for the SessionStart hook chain that produces `[MCP WARNING]` output (LS-4505)
- `.agents/skills/mcp-first/SKILL.md` — server load order and per-server tool substitution table
- `.agents/skills/credentials/SKILL.md` — auth configuration for each service
- `.agents/skills/worktree-workflow/SKILL.md` — `scripts/modules-pool/link.mjs` details
- `AGENTS.md` `## MCP Servers` section — `MCP_TIMEOUT` setting and symlink repair notes
