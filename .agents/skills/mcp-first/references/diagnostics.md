# MCP Server Diagnostics (LS-3022)

## Symptom Recognition

An MCP server has silently failed to load when **any** of the following is true:

- `ToolSearch(query: "select:worktree_ping")` returns "No matching deferred tools found"
- `ToolSearch(query: "worktree_commit")` returns empty
- `ToolSearch(query: "make_run")` returns empty
- The `<system-reminder>` deferred tools list is empty or missing `mcp__legacy-sports-github__*`, `mcp__worktree__*`, `mcp__legacy-sports-make__*`, `mcp__legacy-sports-nx__*`
- The session's `[MCP WARNING]` output from `check-mcp-servers.sh` reports a failure

**No `[MCP WARNING]` output does not rule this out.** `check-mcp-servers.sh` only checks `node_modules`/`.mcp.json`/`mcp-bootstrap.mjs` presence-and-health — a session can have all of those green and still see `worktree`/`legacy-sports-nx`/`legacy-sports-make` totally absent for its whole lifetime. See [Persistent Whole-Session Non-Connection in Local Windows Launcher-Worktree Sessions](#persistent-whole-session-non-connection-in-local-windows-launcher-worktree-sessions-ls-8774) below if this is a local Windows session launched via the worktree checkbox.

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
for srv in worktree-server make-server nx-server ci-server aws-server browser-server dev-process-server; do
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
- **A connector is registered but `enabledInChat: false` (LS-8695)** — a distinct third failure mode, not an auth problem. Symptom: `ToolSearch` for the server's tools returns nothing (indistinguishable, by itself, from "server not registered at all" or "needs `/mcp` re-consent"). Disambiguate with `ListConnectors({ keywords: ["<server-name-fragment>"] })` — a hit with `"enabledInChat": false` confirms the connector exists and is authenticated, it was simply never toggled on for _this_ chat/session. There is nothing to re-consent and no 401 to wait out. **No agent-side recovery exists** — an agent cannot toggle a connector on for its own session. Stop, state plainly which server is disabled-in-chat, and ask the user to enable it (claude.ai → connector settings for this chat) before continuing any work that depends on it; do not substitute a static-analysis/defensive-guess fallback without saying so explicitly, since the caller may not know the tool was unreachable for this reason.

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

**Claude Code Remote (direct-branch, non-worktree sessions):** the health check that decides whether to trigger the auto-repair install verifies that `node_modules/.bin/tsx` actually resolves, not just that the `node_modules` directory exists (LS-8539) — a directory can exist mid-install (e.g. right after session start) while `tsx` hasn't been written yet, which previously skipped the repair and let the real MCP server launch race an incomplete install. `legacy-sports-browser` and `legacy-sports-ci-local` were observed connecting several minutes later than sibling stdio servers under this exact race. If a stdio server is still "connecting" early in a fresh session, retry `ToolSearch` after a few minutes before concluding it's unavailable — see [agent-screenshots.md § Known gap](../../pr-lifecycle/references/agent-screenshots.md#known-gap-slow-connect-in-claude-code-remote--direct-branch-sessions-ls-8539) for the browser-server-specific fallback. This check also verifies `.modules.yaml` is present (LS-8698), the same signature `assessSlot()` checks below — a `node_modules` with `tsx` resolvable but never fully installed by pnpm now triggers the same auto-repair install here, before the first MCP server launch, rather than only surfacing later as an opaque `pc-*`/`nx` failure. If the server never connects for the rest of the session rather than just arriving late, that's a different, platform-side failure mode — see [Persistent Whole-Session Non-Connection](#persistent-whole-session-non-connection-in-ccr-direct-branch-sessions-ls-8689) below.

**Native ephemeral worktrees (`.claude/worktrees/<name>/`):**
`mcp-bootstrap.mjs` detects both worktree patterns (Pattern A: `<repo>/.claude/worktrees/<name>`; Pattern B: `<root>/<repo>.worktrees/<name>`) and creates the symlink to the main repo's `node_modules`. Before LS-3716 was fixed, Pattern A fell through to the cloud branch, which incorrectly ran `corepack pnpm install` when `node_modules` was absent instead of creating the symlink.

**Not the same symptom as a present-but-corrupted `node_modules`.** The checks above cover `node_modules`/`tsx` being **absent or unlinked**, which breaks stdio MCP server startup. If `tsx` is present and MCP servers connect fine, but `pc-typecheck`/`pc-lint`/`pc-build`/`pc-test` fail on files your branch never touched (in a long-lived persistent container), that's a different failure mode — see [cloud-agent-mode: phantom typecheck/lint errors](../../cloud-agent-mode/SKILL.md#known-failure-mode-phantom-typechecklint-errors-on-unrelated-files-ls-8384) (LS-8384) — `make clean-cache` does not fix it (its auto-relink only runs in a worktree checkout); a plain `node scripts/modules-pool/link.mjs` run does, by auto-detecting the corrupted slot and quarantine-rebuilding it (`--check` only diagnoses, no filesystem changes; `--rebuild` forces the rebuild even when the health check finds nothing).

**`nx`/`pc-*` chunks fail with `pnpm lockfile detected, but node_modules/.modules.yaml is missing` even though `tsx` resolves and stdio MCP servers connect fine.** This is a distinct failure mode from the ones above: `tsx`/`nx` themselves can resolve from a `node_modules` that was never fully installed by pnpm (e.g. assembled by something other than a completed `pnpm install`), because pnpm writes `.modules.yaml` as its last install step — nx's project-graph plugin refuses to run without it, independent of whether individual packages/bins are present (LS-9210). `scripts/modules-pool/link.mjs`'s `assessSlot()` health check (used by both the worktree pool resolver and `.claude/cloud-setup.sh`'s cloud-session health check via `--assess-path`) now checks for `.modules.yaml` alongside its existing `nx`/`.bin` checks, so a fresh session's auto-repair install catches this case instead of silently treating the tree as healthy. If you still hit this after that fix ships, run `PUPPETEER_SKIP_DOWNLOAD=1 pnpm install --frozen-lockfile` manually (puppeteer's postinstall Chrome download otherwise aborts the install in this sandboxed/offline environment) and, if `nx` still can't resolve the graph afterward, follow with `make clean-cache`.

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

> **CCR exception (LS-8924)**: this "stop and wait for the user" protocol assumes a human is attending the session. In a Claude Code Remote (CCR) watch-to-merge loop, the session is deliberately unattended for the multi-hour-to-multi-day spans that make this expiry likely, so waiting is not actionable. Do not stop — switch to the generic `mcp__github__*`/`mcp__Atlassian__*` fallback and keep driving the PR to merge instead. Full fallback mapping (mark-ready, re-trigger review, Jira transitions): [cloud-agent-mode — hosted github/jira OAuth expires mid-session](../../cloud-agent-mode/SKILL.md#known-failure-mode-hosted-legacy-sports-githublegacy-sports-jira-oauth-expires-mid-session-on-long-running-watch-to-merge-loops-ls-8924).

> **Distinct from `legacy-sports-ci-local` 401s in CCR (LS-8740)**: the above is about the _hosted_ OAuth connectors expiring. `legacy-sports-ci-local` (a stdio server, not an OAuth connector) can 401 with "Bad credentials" in CCR sessions from its very first call, for a different reason — the CCR network proxy only injects working GitHub credentials for the pinned `gh`/GitHub-MCP request paths, and this server's own direct REST calls fall outside that set even when `GH_TOKEN`/`GITHUB_TOKEN`/`AGENT_AUTHOR_APP_PRIVATE_KEY` are all present. Not fixable by re-consenting via `/mcp` (there is no OAuth session to refresh). See [cloud-agent-mode Quirk 10](../../cloud-agent-mode/SKILL.md#quirk-10-legacy-sports-ci-local-stdio-tools-401-bad-credentials-against-the-raw-github-rest-api-in-ccr-sessions-even-with-gh_tokengithub_tokenagent_author_app_private_key-all-present-ls-8740) for the fallback (use the hosted `legacy-sports-ci` server instead).

## Repeated Cyclic Flapping During Long-Running Sessions (LS-9431)

Distinct from a one-time absence at session start (LS-9154, Check 1 above) or a persistent mid-session 401 (above): a **long-running session (multi-hour to multi-day, e.g. a CCR watch-to-merge loop) can see multiple independent stdio/hosted servers repeatedly disconnect and reconnect throughout its lifetime**, with no single restart event that stabilizes them — `worktree`, `nx`, `aws`, `browser`, `dev-process`, `ci-local`, `make`, and hosted connectors like `stripe` have all been observed flapping independently and asynchronously from each other, sometimes several within the same minute.

**Symptom:** a tool that was working minutes ago now shows as absent from the deferred-tools list, or a hosted connector that never loaded at session start still hasn't after a long wait — while other, unrelated servers remain healthy the whole time.

**Recovery — brief retry-with-backoff before falling back to Bash:**

1. Re-run `ToolSearch` for the specific tool once. Server reconnects on this kind of transient flap are typically sub-minute.
2. If still absent, wait roughly 30–60 seconds and retry once more.
3. If the tool is still unavailable after two retries, treat it as a genuine outage for this operation: report which server is down (per the Reporting Protocol above) and use the documented Bash/`gh`/`git` fallback for that one operation — do not block the whole session on it, since a sibling server flapping back in a minute doesn't mean this one will.
4. Do not build a persistent polling loop around this — a couple of short retries is the right amount of patience for a transient flap; anything longer is better spent proceeding with a reported fallback than blocking.

This flapping pattern itself (why multiple independent servers cycle rather than staying connected once established in a CCR container) is a platform/bootstrap investigation outside this repo's scope — the recovery pattern above is the actionable mitigation available to an agent mid-session.

## Persistent Whole-Session Non-Connection in CCR Direct-Branch Sessions (LS-8689)

Distinct from both the transient race above (LS-9154, self-heals within minutes) and the cyclic flapping above (LS-9431, servers reconnect and drop repeatedly): several CCR direct-branch sessions have reported `legacy-sports-nx`, `legacy-sports-make`, `worktree`, and siblings (`legacy-sports-aws`, `legacy-sports-browser`, `legacy-sports-dev-process`, `legacy-sports-ci-local`, `legacy-sports-android`) as `CONNECT_TIMEOUT`/`CONNECTION_CLOSED` at session start and **never** connecting for the entire session lifetime — no self-heal, no later flap-back — forcing full-session Bash fallback for validation, worktree operations, and CI (LS-8689, 8+ corroborating sessions since 2026-07-26).

**Not the same root cause as LS-8150.** LS-8689's own text speculates this shares a root cause with the LS-8150 umbrella — it does not. LS-8150 tracks migrating `legacy-sports-jira`/`legacy-sports-github`/`legacy-sports-ci` from stdio to hosted Lambda servers; none of the servers affected by this symptom are in that migration's scope, because `nx`/`make`/`worktree`/`aws`/`browser`/`dev-process`/`android` all require local git/filesystem/working-tree access and must stay stdio (see LS-8150's own "Out of Scope"). Do not re-open or reference LS-8150 for this symptom.

**Repo-side causes have been ruled out repeatedly.** In every repro session captured on LS-8689 (and again during that ticket's own fix), `node_modules`/`node_modules/.bin/tsx` were healthy, `.mcp.json` and `mcp-bootstrap.mjs` were present and correct, and other stdio/hosted servers in the same session connected normally — pointing at CCR container/MCP-transport connection establishment itself, not this repo's bootstrap script or config. Treat this as confirmation the failure is platform-side, not a prompt to re-audit `mcp-bootstrap.mjs`/`.mcp.json` again from scratch.

**Recovery:** apply the Repeated Cyclic Flapping retry protocol above (one immediate `ToolSearch` retry, one more after 30–60s) — if still absent after that, do not keep polling or waiting for a self-heal that this failure mode does not exhibit. Report the outage per the Reporting Protocol above and proceed on the documented Bash fallback for the rest of the session (`pnpm exec nx run <project>:<target>` / `make pc-<chunk>` for `nx`/`make`, plain `git` for `worktree`) — this is the expected, compliant path for this symptom, not a stopgap to apologize for. Add a corroborating comment to LS-8689 only if it surfaces new diagnostic signal (a different failure string, a repo-side cause not yet ruled out here); a plain "happened again" report adds no new information — this section is the canonical reference instead.

## Persistent Whole-Session Non-Connection in Local Windows Launcher-Worktree Sessions (LS-8774)

Distinct from every failure mode above: those are keyed on a broken/absent `node_modules` (Checks 1–4 and their [Recovery](#recovery-missing-node_modules)) or on CCR/cloud-specific transports (LS-9154, LS-9431, LS-8689). This one has been reported **with `node_modules`/`tsx`/`nx`/`.modules.yaml` all confirmed healthy** — `check-mcp-servers.sh` prints no `[MCP WARNING]` at all — yet `worktree`, `legacy-sports-nx`, and `legacy-sports-make` (sometimes also `legacy-sports-aws`/`legacy-sports-browser`/`legacy-sports-dev-process`/`legacy-sports-ci-local`, and the `legacy-sports-db`/`legacy-sports-db-admin` DB-client surface) are absent from the deferred-tools list for the **entire session**, in a **local Windows session launched via the launcher's `worktree` checkbox** (CWD `.claude/worktrees/<name>/` or `<repo>.worktrees/<name>/`). The hosted OAuth connectors (`legacy-sports-jira`, `legacy-sports-github`, `legacy-sports-ci`) connect normally throughout — this is specific to the stdio servers launched from `.mcp.json` via `mcp-bootstrap.mjs`.

**Symptom:** `ToolSearch("select:worktree_set,worktree_commit,worktree_run")`, `ToolSearch("make_run nx_run_pc_chunk")`, and even exact server-qualified queries (`ToolSearch("select:mcp__legacy-sports-worktree__worktree_set")`) all return "No matching deferred tools found" for the whole session, with no later flap-back (unlike LS-9431) and no self-heal after a `node_modules` repair (there is nothing to repair — the artifacts this doc's other checks look for are already present). Reported across at least 6 corroborating sessions between 2026-07-27 and 2026-08-24 (this ticket's own comment history, plus LS-9743), each forcing full-ticket `git`/`make pc-*`/`npx nx` shell fallback in place of `worktree_*`/`make_run`/`nx_run*`.

**Repo-side causes considered and not confirmed as root cause:**

- `mcp-bootstrap.mjs`'s worktree-pattern detection (Pattern A `.claude/worktrees/<name>`, Pattern B `<repo>.worktrees/<name>`) and its `isNodeModulesHealthy()` check both read correctly against a live repro's filesystem state — this is not a recurrence of the LS-3716 pattern-detection bug or the LS-8539/LS-9577 health-check gaps, because those all presuppose an _unhealthy_ `node_modules`, which is absent here.
- `.mcp.json` lists `worktree`/`legacy-sports-make`/`legacy-sports-nx` as ordinary stdio entries with no environment-gating (`tools:` allowlist, conditional launch) that would visibly explain a local-Windows-only failure while the same file's hosted-connector-adjacent stdio server (`legacy-sports-ci-local`) sometimes loads in the same session — see LS-9743's description for the specific server-subset asymmetry observed.
- No corroborating session has captured `mcp-bootstrap.mjs` stderr output (it goes to the launcher's own log, not anywhere an agent session can read), so whether the process is spawned at all, spawned and crashing pre-connection, or spawned and hanging past the client's connect timeout remains unconfirmed. This is the same evidentiary gap LS-8689 hit for the CCR equivalent, and — as there — is very likely platform/launcher-side (outside this repo's fix surface), not a defect reachable by editing `.mcp.json` or `mcp-bootstrap.mjs` from inside a session that cannot observe the launcher's own process table or logs.

**Recovery — do not stall the ticket waiting for a fix that isn't reachable from inside the session:**

1. Retry `ToolSearch` for one representative tool from each suspected-absent server (`select:worktree_ping`, `select:make_ping`, `select:nx_show_projects`) once immediately and once more after ~30–60s, per the [Repeated Cyclic Flapping](#repeated-cyclic-flapping-during-long-running-sessions-ls-9431) protocol — a genuine flap self-heals in that window; this failure mode does not.
2. If still absent, **report it** per the [Reporting Protocol](#reporting-protocol) above (which servers, which `node_modules` health checks you ran to rule out the ordinary cause) — do not silently fall back.
3. Proceed on the full documented local-session Bash fallback for the rest of the ticket: `git add`/`commit`/`push`/`fetch` for `worktree_*`, `make pc-<chunk>` (backgrounded, one at a time — see AGENTS.md's degraded-session guidance) for `make_run`/`nx_run_pc_chunk`, `npx nx run <project>:<target>` for `nx_run`/`nx_run_affected`. This is the same fallback set AGENTS.md and this file already document for the CCR case; it is compliant here too, not a stopgap to apologize for.
4. **Avoid raw `git stash`** specifically — `.git` is shared across every worktree session on the same machine, and a raw `git stash pop` can pop a different session's unrelated stash (observed live: LS-8802). `worktree_stash`/`worktree_stash_pop` exist precisely to avoid this shared-stack hazard and are unavailable in this failure mode by definition; if you must isolate a change without them, prefer `git diff > /tmp/x.patch` + `git checkout -- <path>` + reapply, over `git stash`, since a patch file cannot collide with another session's stash entry.
5. Do not attempt to "fix" this by editing `.mcp.json` or `mcp-bootstrap.mjs` speculatively — every repro so far has found the repo-side artifacts healthy (see above); an edit made without reproducing the launcher-side symptom risks masking a real regression elsewhere or, per the [Consolidation Gate](gaps.md#the-consolidation-gate) spirit, adding unvalidated complexity for a problem this repo cannot observe.

**If you can reproduce this with new diagnostic signal** (a launcher log excerpt, a case where a _subset_ of the normally-absent servers connects, or a repo-side artifact that turns out unhealthy after all): add it as a comment to LS-8774 or LS-9743 rather than opening a third tracking ticket — a plain "happened again" adds no new information now that this section is the canonical reference.

## Mid-Session Auth-Server Incompatibility ("does not support dynamic client registration") (LS-9439)

Distinct from the plain 401 above: this failure mode surfaces as an explicit error string, not a Zod parse failure, and can hit multiple hosted connectors identically and simultaneously after a long session working normally:

```
Incompatible auth server: does not support dynamic client registration
```

Observed once so far: `legacy-sports-github`, `legacy-sports-jira`, and `legacy-sports-ci` all began failing identically, mid-session, after 8+ hours of normal operation (LS-9439, during the LS-9346/PR #7072 merge drive). All three failed on both reads and writes (e.g. `github_pr_why_blocked`, `jira_view`, `ci_rerun`), not just mutations.

**`auth_check_all` will not catch this.** It is a credential/token-_presence_ check (env vars, cache files — see [Pre-flight Auth Check](#pre-flight-auth-check-separate-from-load-failures) below), not a live OAuth-session probe, so it kept reporting `allAuthenticated: true` for the whole outage. A green `auth_check_all` is not proof the hosted connectors are actually reachable if a real tool call is throwing this error string.

**Suspected cause (unconfirmed):** three independently-hosted servers failing with the identical OAuth-registration error at the same moment points toward a shared auth-proxy/gateway issue upstream of the individual connectors, rather than three coincidental token expirations. Root cause is not yet confirmed — if you hit this, add the timestamp and affected servers as a comment on LS-9439 rather than re-investigating from scratch.

### Recovery

1. **Attended session:** treat like [Mid-Session 401](#mid-session-401--token-expiry-ls-4874) above — stop, surface the recovery prompt, ask the user to re-consent via `/mcp`, wait.
2. **Unattended/autonomous session already driving an approved, CI-green PR to merge** (the CCR exception pattern — see [cloud-agent-mode: hosted OAuth expires mid-session](../../cloud-agent-mode/SKILL.md#known-failure-mode-hosted-legacy-sports-githublegacy-sports-jira-oauth-expires-mid-session-on-long-running-watch-to-merge-loops-ls-8924)): if no generic `mcp__github__*`/`mcp__Atlassian__*` built-in fallback is available either, and no user response arrives within a reasonable wait, falling back to already-authenticated CLI tools for the remaining mechanical steps only (PR status checks, CI reruns, merge via `gh`; Jira view/transition/comment via `acli jira workitem`) is the documented recovery — both are separately authenticated outside the MCP OAuth path. **Report the fallback explicitly** (which servers, which error string, which steps used the CLI) so it lands in the MCP gap audit instead of being silently absorbed. This is a last resort for unattended sessions, not a first response — always attempt step 1 first if there is any chance a user is present to re-consent.

## Pre-flight Auth Check (Separate from Load Failures)

Call `auth_check_all()` (worktree MCP server) at the start of any workflow requiring GitHub,
Jira, AWS, or CI access. This checks credentials, not server availability — a server can be
connected but unauthenticated. If `allAuthenticated: false`, surface the `hint` for each
failing service and stop. When the worktree stdio server is absent (degraded CC-web),
use the per-service checks instead: `github_auth_status`, `jira_auth_status`, `ci_auth_status`,
`rollbar_auth_status`, `aws_sso_status`. See [SKILL.md — Pre-flight Auth Check](../SKILL.md#pre-flight-auth-check).

**This check is credential-presence only — it cannot detect a live-session failure** like [Mid-Session Auth-Server Incompatibility](#mid-session-auth-server-incompatibility-does-not-support-dynamic-client-registration-ls-9439) above, which reported `allAuthenticated: true` throughout a real outage (LS-9439). Trust an actual tool-call error over a green `auth_check_all` result.

## Skill Tool Returns Boilerplate Instead of SKILL.md Content (LS-8719)

Distinct from the MCP server connectivity failures above — this is the `Skill` tool itself (not an MCP server), and it can misbehave even when every MCP server is healthy.

**Symptom:** `Skill(skill: "<name>", args: "...")` returns a generic, self-referential turn instructing the agent to "invoke `Skill(skill: '<name>')` immediately" — i.e. a directive to call the same tool again — instead of delivering the actual `SKILL.md` procedure text. A follow-up `Skill(skill: "<name>")` call made per that instruction can also **drop the passed argument entirely** (e.g. a ticket key rendered as `****` or substituted with an unrelated key from earlier in the transcript), so retrying doesn't recover the lost context either. Observed repeatedly across sessions and environments (LS-8503, LS-6259, and again live during LS-8719 itself, where the ticket key was corrupted to a different ticket's key on retry) — this is a harness/platform-level defect in the `Skill` tool invocation mechanism, not a per-skill or per-repo issue, and is outside this repo's fix surface.

**Do not loop on retrying `Skill(...)`.** A second or third call has been observed returning the same non-actionable boilerplate, or actively corrupting the argument — it will not converge to the real content.

**Recovery — read the skill's files directly from disk:**

```
Glob(pattern: ".agents/skills/<skill-name>/**")
Read(file_path: ".agents/skills/<skill-name>/SKILL.md")
```

Then `Read` any `references/*.md` files the `SKILL.md` frontmatter/body points to for the mode you're routing into (e.g. `references/leaf-mode.md` for `work-ticket`). This delivers the identical procedure content the `Skill` tool would have loaded, and preserves any ticket key or argument you were passed — it never round-trips through the tool call that lost it. Continue following the skill's steps exactly as if `Skill(...)` had returned them; nothing else about the workflow changes.

This is a documented stopgap, not a fix for the underlying tool-invocation defect — apply it whenever `Skill(...)` returns generic re-invocation boilerplate or loses an argument, for any skill, not just `work-ticket`.

## See Also

- [LS-9439](https://bkrupa.atlassian.net/browse/LS-9439) — tracking ticket for the auth-server-incompatibility failure mode above; root cause still open
- [LS-8689](https://bkrupa.atlassian.net/browse/LS-8689) — tracking ticket for the persistent whole-session non-connection failure mode above; root cause is platform-side (CCR host), not this repo
- [LS-8774](https://bkrupa.atlassian.net/browse/LS-8774) / [LS-9743](https://bkrupa.atlassian.net/browse/LS-9743) — tracking tickets for the local Windows launcher-worktree equivalent of LS-8689 above; root cause likely platform/launcher-side, not confirmed
- `docs/dev-process/session-startup.md` — sequence diagram + orientation for the SessionStart hook chain that produces `[MCP WARNING]` output (LS-4505)
- [`../SKILL.md`](../SKILL.md) — tool surfaces, server load order, per-server tool substitution tables, and the auth model (absorbed the former `credentials` skill 2026-07-02)
- `docs/authentication/mcp-machine-credential-lifecycle.md` — rotation, revocation, and blast-radius runbook for the long-lived Cognito `client_credentials` machine secret (epic LS-5089, Track A)
- `.agents/skills/worktree-workflow/SKILL.md` — `scripts/modules-pool/link.mjs` details
- `AGENTS.md` `## MCP Servers` section — `MCP_TIMEOUT` setting and symlink repair notes
