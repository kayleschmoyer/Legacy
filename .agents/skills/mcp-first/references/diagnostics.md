# MCP Server Diagnostics (LS-3022)

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

The stdio MCP servers launch via `mcp-bootstrap.mjs` which runs `node --import tsx ...`. If `node_modules` is missing or broken, all stdio servers silently time out during startup — Claude Code surfaces no error. The hosted servers (github, jira, ci, db, rollbar) connect as OAuth custom remote connectors registered in claude.ai; they do not use `tsx` and are not entries in `.mcp.json` (see [SKILL.md — Tool Surfaces](../SKILL.md#tool-surfaces)).

Use `-f` (not `-x`) — pnpm stores binaries as symlinks; `-f` follows symlinks and fails for both absent files and broken symlinks, while `-x` on a broken symlink returns false but doesn't distinguish from truly absent.

```bash
test -f node_modules/.bin/tsx && echo "tsx: OK" || echo "MISSING: node_modules/.bin/tsx"
```

- **OK** → proceed to Check 2
- **MISSING** → see [Recovery: Missing node_modules](#recovery-missing-node_modules)

**Non-worktree sessions (cloud agents, Claude Code Remote): a `tsx` miss reported by `check-mcp-servers.sh` near session start is often transient, not broken (LS-9154).** `pnpm install` runs in parallel with SessionStart hooks during session boot, so this hook can observe `tsx` as absent moments before it's written. `mcp-bootstrap.mjs`'s own health check (LS-8539, see [Recovery: Missing node_modules](#recovery-missing-node_modules)) re-verifies `tsx` on every stdio server launch attempt and self-repairs, so the servers typically connect on their own within a few minutes with **no session restart required** — retry `ToolSearch` for a stdio tool before concluding the servers are down. Do not add a retry/poll loop to `check-mcp-servers.sh` itself to "fix" this — LS-4505 already tried and rejected bounded polling for this exact file, because the install can take minutes on a cold lockfile miss, not seconds (see `docs/dev-process/session-startup.md` § Why not just add retries?). If `tsx` is still missing after several minutes, treat it as a genuine failure and follow the recovery steps below.

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
for srv in local-git-server worktree-server make-server nx-server ci-server aws-server browser-server dev-process-server; do
  test -f "tools/mcp/${srv}/src/index.ts" \
    && echo "${srv}: OK" \
    || echo "${srv}: MISSING — tools/mcp/${srv}/src/index.ts"
done
```

- **Any MISSING** → a server's source was removed from the working tree. Run `git status` to check
  for missing tracked files; `git checkout HEAD -- tools/mcp/<srv>/src/index.ts` to restore.

### Check 5 — `MCP_TIMEOUT` is ≥ 10 000 ms

All servers need at least 10 s startup headroom when `node_modules` is a symlink that must be resolved by the OS. The project default is set in `.claude/settings.json`.

```bash
echo "MCP_TIMEOUT: ${MCP_TIMEOUT:-unset (default applied by Claude Code)}"
```

- If unset or lower than `10000`, add to `.claude/settings.json`:
  ```json
  "env": { "MCP_TIMEOUT": "10000" }
  ```

### Check 5b — OAuth connectors for hosted servers

The hosted servers (`legacy-sports-github`, `legacy-sports-jira`, `legacy-sports-ci`, `legacy-sports-db` — registered repo-side under the alias `legacy-sports-db-admin`, see [SKILL.md — DB server name](../SKILL.md#db-server-name) — and `legacy-sports-rollbar`) connect via OAuth custom remote connectors registered in claude.ai — they are **not** entries in `.mcp.json`. If they are absent from the deferred-tools list, do **not** run the `node_modules`/`.env.local` checklist (it does not apply). Either the Org Owner has not registered the connectors, the OAuth session needs (re-)consent, or the tools haven't loaded yet.

- **Tools absent** → surface to the user: prompt them to check Org settings → Connectors in claude.ai, or re-consent via `/mcp`.
- **Mid-session 401** → OAuth access token expired; prompt the user to re-consent via `/mcp`. Do not retry or fall back.
- **A connector reports "requires authentication" at session start**, before any tool call could have outlived a token — this is a distinct symptom from mid-session expiry (see LS-8295) and is not explained by the mid-session gap below. Root cause (claude.ai-side refresh failure vs. our-side Cognito grant invalidation vs. platform flakiness) is not yet confirmed — see [LS-8696](https://bkrupa.atlassian.net/browse/LS-8696). Recovery is the same: re-consent via `/mcp`.

## Recovery Steps

### Recovery: Missing node_modules

**Known causes of a broken/missing pooled symlink:**

- Running `pnpm exec nx reset` directly in a worktree — use `make clean-cache` (or `make reset`) instead; it re-links automatically (LS-5242)
- `worktree_rebase` (LS-3663)
- Between `worktree_run` calls (LS-3687, LS-3689)

Run the pool resolver from your terminal (works before MCP servers are connected):

```bat
cd D:\code\legacy-sports\.claude\worktrees\<name>
node scripts/modules-pool/link.mjs
```

The resolver is idempotent — it links `node_modules` to the content-addressable pool slot for the worktree's lockfile (re-linking instantly on a hit, materialising it via `pnpm install --frozen-lockfile` on a miss), converts junctions to symlinks, and also symlinks `.env`/`.env.local` from the main repo. `make install` and `make wt-setup` do the same thing. **Directory symlinks require Windows Developer Mode** (Settings › System › For Developers › Developer Mode) — there is no independent-install fallback; if Developer Mode is off, enable it and re-run.

**After repair: restart the Claude Code session.** MCP servers are launched once at session start and do not reconnect automatically.

**Cloud agents (Copilot Coding Agent / Claude Code on the web):**
`mcp-bootstrap.mjs` detects the missing `node_modules` and runs `corepack pnpm install --frozen-lockfile` automatically. If it still fails, the bootstrap error is written to the server's stderr (visible in CI logs as `[mcp-bootstrap] ERROR: ...`). Check the GitHub Actions run logs for the `copilot-setup-steps` job.

**Claude Code Remote (direct-branch, non-worktree sessions):** the health check that decides whether to trigger the auto-repair install verifies that `node_modules/.bin/tsx` actually resolves, not just that the `node_modules` directory exists (LS-8539) — a directory can exist mid-install (e.g. right after session start) while `tsx` hasn't been written yet, which previously skipped the repair and let the real MCP server launch race an incomplete install. `legacy-sports-browser` and `legacy-sports-ci-local` were observed connecting several minutes later than sibling stdio servers under this exact race. If a stdio server is still "connecting" early in a fresh session, retry `ToolSearch` after a few minutes before concluding it's unavailable — see [agent-screenshots.md § Known gap](../../pr-lifecycle/references/agent-screenshots.md#known-gap-slow-connect-in-claude-code-remote--direct-branch-sessions-ls-8539) for the browser-server-specific fallback.

**Native ephemeral worktrees (`.claude/worktrees/<name>/`):**
`mcp-bootstrap.mjs` detects both worktree patterns (Pattern A: `<repo>/.claude/worktrees/<name>`; Pattern B: `<root>/<repo>.worktrees/<name>`) and creates the symlink to the main repo's `node_modules`. Before LS-3716 was fixed, Pattern A fell through to the cloud branch, which incorrectly ran `corepack pnpm install` when `node_modules` was absent instead of creating the symlink.

**Not the same symptom as a present-but-corrupted `node_modules`.** The checks above cover `node_modules`/`tsx` being **absent or unlinked**, which breaks stdio MCP server startup. If `tsx` is present and MCP servers connect fine, but `pc-typecheck`/`pc-lint`/`pc-build`/`pc-test` fail on files your branch never touched (in a long-lived persistent container), that's a different failure mode — see [cloud-agent-mode: phantom typecheck/lint errors](../../cloud-agent-mode/SKILL.md#known-failure-mode-phantom-typechecklint-errors-on-unrelated-files-ls-8384) (LS-8384) — `make clean-cache` does not fix it (its auto-relink only runs in a worktree checkout); a plain `node scripts/modules-pool/link.mjs` run does, by auto-detecting the corrupted slot and quarantine-rebuilding it (`--check` only diagnoses, no filesystem changes; `--rebuild` forces the rebuild even when the health check finds nothing).

### Recovery: Wrong session root / `CLAUDE_PROJECT_DIR`

In native-worktree sessions, `CLAUDE_PROJECT_DIR` must be the worktree path
(`.claude/worktrees/<name>/`), not the main repo root. If `pwd` returns the main repo root
when you expect a worktree path, the session was launched without the worktree checkbox or the
environment variable was overridden. Restart the session from the correct worktree.

## Reporting Protocol

When MCP servers are confirmed missing and recovery is not possible in the current session:

1. **State which servers are missing** — e.g. "all custom stdio MCP servers absent; deferred tools
   list is empty".
2. **State which check failed** — e.g. "Check 1 failed: `node_modules/.bin/tsx` missing".
3. **Do not silently fall back** — using `gh`/`git`/`make` Bash fallbacks without reporting
   produces false MCP gap audit entries and hides the root cause from the team.
4. **Surface the repair command** — give the user the exact `node scripts/modules-pool/link.mjs` command (or `make install`), run from the worktree root.
5. **Stop implementation until the session is healthy** — MCP tool availability is a gate, not
   an advisory. A session running on Bash fallbacks is not a valid implementation environment.

## Mid-Session 401 / Token Expiry (LS-4874)

The hosted servers (`legacy-sports-github`, `legacy-sports-jira`, `legacy-sports-ci`, `legacy-sports-db`, `legacy-sports-rollbar`) connect via OAuth custom remote connectors. Token issuance, storage, and refresh for these connectors are owned by claude.ai's connector layer — a different system from the Claude Code client's own OAuth handling (which only applies to self-hosted MCP servers configured directly in `.mcp.json`). [`claude-code#58607`](https://github.com/anthropics/claude-code/issues/58607) was previously cited here for "no mid-session auto-refresh," but that issue (closed as not planned) is actually about the client discarding its DCR `client_id`/refresh token across CLI restarts, not about a live session's token going unrefreshed — do not cite it for connector-layer behavior (see LS-8295). When the OAuth access token expires, the servers begin returning HTTP 401, which Claude Code's MCP transport may surface as a Zod validation error:

```
HTTP 401 ... ZodError: expected string, received undefined
  at path: error / jsonrpc
```

### Recovery — agent steps

1. **Stop.** Do not retry, do not fall back to `gh` / `acli` / raw `curl` — that masks the failure and produces MCP gap audit entries.
2. **Surface the recovery prompt verbatim to the user**:

   > The OAuth token for the hosted MCP connectors (`legacy-sports-github`, `legacy-sports-jira`, `legacy-sports-ci`, `legacy-sports-db`, `legacy-sports-rollbar`) has expired mid-session. To recover: re-consent via `/mcp` in Claude Code, then resume the session.

3. **Wait for the user.** Do not proceed with implementation. A session with these servers down is not a valid environment for any workflow that touches GitHub, Jira, CI, or the dev database. Re-consent via `/mcp` is the **only** recovery — running `node scripts/mcp-auth.mjs` is the retired pre-OAuth answer and does nothing for connector sessions (see [SKILL.md — Auth Model](../SKILL.md#auth-model)).

## Pre-flight Auth Check (Separate from Load Failures)

Call `auth_check_all()` (worktree MCP server) at the start of any workflow requiring GitHub,
Jira, AWS, or CI access. This checks credentials, not server availability — a server can be
connected but unauthenticated. If `allAuthenticated: false`, surface the `hint` for each
failing service and stop. When the worktree stdio server is absent (degraded CC-web),
use the per-service checks instead: `github_auth_status`, `jira_auth_status`, `ci_auth_status`,
`rollbar_auth_status`, `aws_sso_status`. See [SKILL.md — Pre-flight Auth Check](../SKILL.md#pre-flight-auth-check).

## See Also

- `docs/dev-process/session-startup.md` — sequence diagram + orientation for the SessionStart hook chain that produces `[MCP WARNING]` output (LS-4505)
- [`../SKILL.md`](../SKILL.md) — tool surfaces, server load order, per-server tool substitution tables, and the auth model (absorbed the former `credentials` skill 2026-07-02)
- `docs/authentication/mcp-machine-credential-lifecycle.md` — rotation, revocation, and blast-radius runbook for the long-lived Cognito `client_credentials` machine secret (epic LS-5089, Track A)
- `.agents/skills/worktree-workflow/SKILL.md` — `scripts/modules-pool/link.mjs` details
- `AGENTS.md` `## MCP Servers` section — `MCP_TIMEOUT` setting and symlink repair notes
