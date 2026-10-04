# MCP Server Diagnostics (LS-3022)

## Symptom Recognition

An MCP server has silently failed to load when **any** of the following is true:

- `ToolSearch(query: "select:worktree_ping")` returns "No matching deferred tools found"
- `ToolSearch(query: "worktree_commit")` returns empty
- `ToolSearch(query: "make_run")` returns empty
- The `<system-reminder>` deferred tools list is empty or missing `mcp__legacy-sports-github__*`, `mcp__worktree__*`, `mcp__legacy-sports-make__*`, `mcp__legacy-sports-nx__*`
- The session's `[MCP WARNING]` output from `check-mcp-servers.sh` reports a failure

**A tool call failing with `No such tool available: <name>` for a tool that worked earlier in the same session is a different symptom from the absence patterns below — it means the tool's prefix changed out from under you (a reconnect re-exposed the same logical server under a new hashed or friendly-name prefix), not that the server or tool was removed.** This happens on any MCP server, not only this repo's `legacy-sports-*` ones — see [Recurrence: Self-Recovery Under Hashed Tool Names (LS-9850/LS-9722)](#recurrence-self-recovery-under-hashed-tool-names--acli-as-sanctioned-jira-fallback-ls-9850) below. Re-run `ToolSearch` on the bare tool name before concluding it's gone.

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

**This self-heal claim is scoped to the session-boot race only — it does not extend to a repair performed mid-session in a CCR session (LS-9777/LS-9780).** "Re-verifies `tsx` on every stdio server launch attempt" describes `mcp-bootstrap.mjs`'s own one-shot check-then-spawn logic (it has no retry loop of its own — read the file directly if in doubt), so the self-heal only happens at all if something outside this repo re-invokes that script as a fresh launch attempt. At session boot, the CCR harness does exactly that a few times while the container comes up, which is what makes the boot-time race self-heal. There is no evidence the harness ever repeats that launch attempt once a stdio server has already failed to connect and the session has moved past its boot window — see [Mid-Session Repair Does Not Trigger Reconnection in CCR](#mid-session-repair-does-not-trigger-reconnection-in-ccr-ls-9777) below for a repro where a manual `node scripts/modules-pool/link.mjs` repair, confirmed successful, produced zero reconnections for the rest of an hour-plus session. If you hit a `tsx`-missing (or any other) stdio failure **after** the session has been running for a while rather than in its first minute, do not expect this self-heal — go straight to that section's guidance instead of retry-looping `ToolSearch`.

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

**Not the same symptom as a present-but-corrupted `node_modules`.** The checks above cover `node_modules`/`tsx` being **absent or unlinked**, which breaks stdio MCP server startup. If `tsx` is present and MCP servers connect fine, but `pc-typecheck`/`pc-lint`/`pc-build`/`pc-test` fail on files your branch never touched (in a long-lived persistent container), that's a different failure mode — see [cloud-agent-mode: phantom typecheck/lint errors](../../cloud-agent-mode/references/platform-detection.md#known-failure-mode-phantom-typechecklint-errors-on-unrelated-files-ls-8384) (LS-8384) — `make clean-cache` does not fix it (its auto-relink only runs in a worktree checkout); a plain `node scripts/modules-pool/link.mjs` run does, by auto-detecting the corrupted slot and quarantine-rebuilding it (`--check` only diagnoses, no filesystem changes; `--rebuild` forces the rebuild even when the health check finds nothing).

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

> **CCR exception (LS-8924)**: this "stop and wait for the user" protocol assumes a human is attending the session. In a Claude Code Remote (CCR) watch-to-merge loop, the session is deliberately unattended for the multi-hour-to-multi-day spans that make this expiry likely, so waiting is not actionable. Do not stop — switch to the generic `mcp__github__*`/`mcp__Atlassian__*` fallback and keep driving the PR to merge instead. Full fallback mapping (mark-ready, re-trigger review, Jira transitions): [cloud-agent-mode — hosted github/jira OAuth expires mid-session](../../cloud-agent-mode/references/ccr-known-failures.md#known-failure-mode-hosted-legacy-sports-githublegacy-sports-jira-oauth-expires-mid-session-on-long-running-watch-to-merge-loops-ls-8924).

> **Distinct from `legacy-sports-ci-local` 401s in CCR (LS-8740)**: the above is about the _hosted_ OAuth connectors expiring. `legacy-sports-ci-local` (a stdio server, not an OAuth connector) can 401 with "Bad credentials" in CCR sessions from its very first call, for a different reason — the CCR network proxy only injects working GitHub credentials for the pinned `gh`/GitHub-MCP request paths, and this server's own direct REST calls fall outside that set even when `GH_TOKEN`/`GITHUB_TOKEN`/`AGENT_AUTHOR_APP_PRIVATE_KEY` are all present. Not fixable by re-consenting via `/mcp` (there is no OAuth session to refresh). See [cloud-agent-mode Quirk 10](../../cloud-agent-mode/references/known-quirks.md#quirk-10-legacy-sports-ci-local-stdio-tools-401-bad-credentials-against-the-raw-github-rest-api-in-ccr-sessions-even-with-gh_tokengithub_tokenagent_author_app_private_key-all-present-ls-8740) for the fallback (use the hosted `legacy-sports-ci` server instead).

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

**`stripe` is a different mechanism, not a corroboration (LS-9845).** LS-9631 reported `stripe` alongside this server cohort with the same `CONNECT_TIMEOUT` symptom, but `stripe` is not one of the stdio servers this section covers — before LS-9845, `.mcp.json` launched it via a bare `npx -y @stripe/mcp@0.3.3` instead of the `mcp-bootstrap.mjs` wrapper every other stdio server uses. `npx -y` resolves and extracts the package fresh against the npm registry on every cold container (~18s measured in a repro CCR session), deterministically exceeding the 10s `MCP_TIMEOUT` — a repo-side, fixable cause, unlike the platform-side transport failure above. Fixed by pinning `@stripe/mcp@0.3.3` as a repo `devDependency` (so it installs via the same `pnpm install` the other servers' health check already waits on) and launching it directly via `node node_modules/@stripe/mcp/dist/index.js` (~0.2s, no network round-trip) instead of `npx`. Do not lump a future `stripe` timeout report into this section without first checking whether `.mcp.json`'s `stripe` entry has regressed back to a bare `npx` invocation.

**`legacy-sports-ci-local`'s non-recovery is not a distinct, ci-local-specific bug (LS-9780).** LS-9780 was filed from a single session (LS-9344) where `legacy-sports-ci-local` alone stayed `CONNECTION_CLOSED` for the whole session while `worktree`/`legacy-sports-make`/`legacy-sports-nx`/`legacy-sports-aws`/`legacy-sports-browser`/`legacy-sports-dev-process` all self-healed after the documented `node scripts/modules-pool/link.mjs` tsx repair — proposing a `ci-local`-specific startup defect (a dependency, entrypoint, or crash-loop condition the generic tsx fix doesn't cover) as the cause.

Investigation compared `tools/mcp/ci-server/src/index.ts`'s stdio-launch path against `tools/mcp/nx-server/src/index.ts` and `tools/mcp/make-server/src/index.ts`: all three launch identically through `mcp-bootstrap.mjs` (`node --import tsx tools/mcp/<server>/src/index.ts`), with no `ci-local`-specific dependency, startup check, or synchronous work at import time. The one real code difference is that `ci-server`'s `index.ts` also doubles as a Lambda handler (`lambda.ts` imports `createServer` from it), so its stdio-transport connect is gated: `if (!process.env['AWS_LAMBDA_FUNCTION_NAME']) { void (async () => { ... await createServer().connect(transport); })(); }` — `nx-server`/`make-server` connect unconditionally at the top level instead. This gate is inert in CCR sessions: `AWS_LAMBDA_FUNCTION_NAME` is confirmed unset there (verified via `env | grep -i lambda` in a live CCR session), so `ci-server` takes the same unconditional-connect branch as its siblings. No other repo-side asymmetry was found.

Against that negative result, this ticket's own later corroborating comments (LS-9506, LS-9598) already show the "never-recovers" set is **not** fixed to `ci-local` — in one session it was `ci-local` + `worktree` + `legacy-sports-make` + `legacy-sports-nx`; in another, `ci-local` + `worktree` + `legacy-sports-make` (with `nx` self-healing that time). `ci-local` happened to be present in every observed session, but so was at least one other sibling each time, and which siblings varied — the pattern matches [Persistent Whole-Session Non-Connection in CCR Direct-Branch Sessions](#persistent-whole-session-non-connection-in-ccr-direct-branch-sessions-ls-8689) and [Repeated Cyclic Flapping](#repeated-cyclic-flapping-during-long-running-sessions-ls-9431) — both already established as platform-side (CCR container/MCP-transport), not a per-server code defect — rather than a distinct `ci-local` root cause.

**Conclusion: no repo-side fix applies.** Treat a `legacy-sports-ci-local` `CONNECTION_CLOSED` that outlives the documented few-minutes tsx self-heal window as an instance of the LS-8689/LS-9431 patterns, not a standalone bug — follow their recovery steps (retry-with-backoff, then the Bash/`gh`/`git`/`make` fallback, `ci_view_run`/`ci_get_logs` equivalents via the hosted `legacy-sports-ci` connector where available) rather than waiting on a `ci-local`-specific repair. If a future session reproduces `ci-local` failing to recover while **every** sibling stdio server recovers cleanly (the original LS-9780 signature, not the mixed cohort seen since), that would be new diagnostic signal worth a fresh comment on LS-9780 — a plain repeat of the mixed-cohort pattern should land on LS-8689/LS-9431 instead, per their own dedup convention.

## `legacy-sports-ci-local` and `stripe` CONNECTION_CLOSED as a Two-Server-Only Cohort, Distinct Repo-Side Per-Entry Causes (LS-10125)

**Do not fold a session where only `legacy-sports-ci-local` and `stripe` show `CONNECTION_CLOSED`, with every other stdio server (`nx`, `make`, `worktree`, `aws`, `browser`, `android`, `dev-process`) connecting and used normally, into LS-8689/LS-9780 above.** Those sections cover a _mixed, varying_ cohort of stdio servers going down together (platform-side transport, confirmed no repo-side cause). The exact-two-server cohort — `ci-local` + `stripe`, nothing else — recurred across 20+ CCR sessions tracked on [LS-10099](https://bkrupa.atlassian.net/browse/LS-10099) and has two separate, repo-side, deterministic causes, confirmed by direct reproduction in [LS-10125](https://bkrupa.atlassian.net/browse/LS-10125):

**`legacy-sports-ci-local`: an ESM/CommonJS interop bug in `@legacy-sports/logging`, not a `node_modules` materialization gap.** LS-10099's comment trail (see comment 21056) proposed that `node_modules/@legacy-sports/*` workspace-package symlinks are missing in the CCR container, causing `ERR_MODULE_NOT_FOUND` for `@legacy-sports/mcp-format`. That theory does not survive a repro: running `corepack pnpm install --frozen-lockfile` to completion in a live repro session still leaves `node_modules/@legacy-sports` entirely absent — because this repo's pnpm workspace packages are never hoisted to root `node_modules` at all; every stdio MCP server resolves them via each server's own `tsconfig.json` `"paths"` mapping to the package's `src/index.ts` (see `mcp-bootstrap.mjs`'s `TSX_TSCONFIG_PATH` auto-detection), not via `node_modules` resolution. The absent root `node_modules/@legacy-sports` directory is a red herring that exists in every session, connected or not — it is not diagnostic.

The real, reproduced cause: `tools/mcp/ci-server/src/tools/wait-run.ts` does `import { LOGGER } from '@legacy-sports/logging'` (a bare, non-`/server`-subpath specifier). `lib/logging/package.json` has no `"type": "module"` field (unlike `lib/mcp-format`, `lib/mcp-docs`, `lib/mcp-jobs`, `lib/mcp-path-safety`, and `lib/api`, which all declare it). Under `tsx`'s `NodeNext`-resolution Node-ESM loader, a package with no `"type"` field defaults to CommonJS, so `lib/logging/src/index.ts` — despite being written with `export const LOGGER = ...` — gets transpiled and loaded as a CJS module; Node's ESM/CJS interop then exposes the entire `module.exports` object under a single `default` key instead of individual named exports. Confirmed directly:

```
$ TSX_TSCONFIG_PATH=tools/mcp/ci-server/tsconfig.json node --import tsx -e \
  "import('@legacy-sports/logging').then(m => console.log(Object.keys(m)))"
KEYS: [ 'default' ]
```

The named import `{ LOGGER }` therefore throws `SyntaxError: The requested module '@legacy-sports/logging' does not provide an export named 'LOGGER'` at module-evaluation time — before the MCP stdio transport ever attaches — and the process exits immediately. The client sees a bare `CONNECTION_CLOSED` because stdout/stderr from the crashed child is not surfaced to the agent even though `mcp-bootstrap.mjs` spawns it with `stdio: 'inherit'` (a harness-side visibility gap, not a repo-side one — see the `See Also` LS-9845 entry for the general "no diagnostic signal" complaint this also explains). `legacy-sports-github`/`legacy-sports-jira` are unaffected because they are hosted OAuth connectors, not `.mcp.json` stdio entries (Check 1 above), so this local `tsx` resolution path never runs for them; their own source files that import `@legacy-sports/logging` use the `/server` subpath or aren't loaded from those servers' actual entrypoints. `legacy-sports-browser` imports the same bare `@legacy-sports/logging` specifier in `launch-chromium.ts` with an identical per-server `tsconfig.json` `paths` mapping — it is a plausible second victim of the same defect and would explain some of `browser`'s own CONNECTION_CLOSED reports previously attributed only to LS-8689, but this was not independently reproduced for `browser` in LS-10125; treat that as a hypothesis for whoever picks up the follow-up fix, not a confirmed finding.

**Fix is out of scope for a "Low risk" ticket, filed separately.** Adding `"type": "module"` to `lib/logging/package.json` is the correct fix (it would put `lib/logging` on the same footing as the other ESM-declared `lib/mcp-*` packages), but `@legacy-sports/logging` is imported from dozens of apps/lambdas/tests outside the MCP server tree, so changing its module type needs full-suite verification before landing, not a same-PR change bundled with a diagnostics write-up. Tracked separately — see the ticket this section links from.

**`stripe`: a missing `STRIPE_SECRET_KEY` in the CCR container, not a regression of LS-9845.** LS-9845's fix (pin `@stripe/mcp` as a `devDependency`, launch via `node node_modules/@stripe/mcp/dist/index.js` instead of `npx`) is confirmed still in place in `.mcp.json` and still fast — launching it directly with a key present starts in well under a second, no network round-trip. The failure is a different, later step: `.mcp.json`'s `stripe` entry passes `"STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}"` as env, but the CCR container does not have `STRIPE_SECRET_KEY` set (confirmed via `env | grep -i stripe` in a repro session — empty). `@stripe/mcp@0.3.3` throws synchronously and exits when no key is available (`Error: Stripe API key not provided...`), which the client again reports as a bare `CONNECTION_CLOSED` (same stderr-visibility gap as above). This is a **new cause** (missing secret provisioning in this environment), not evidence LS-9845's fix regressed — `CONNECTION_CLOSED` from an immediate clean exit and `CONNECT_TIMEOUT` from a slow `npx` resolve are different failure signatures for a reason. (Separately, `--tools=all` in the same `.mcp.json` args is a deprecated flag this package version no longer supports — it only produces a warning, not a fatal error, so it is not part of the failure, but it's worth dropping in the same follow-up pass since Stripe's own error output calls it out.)

Whether `STRIPE_SECRET_KEY` (a Stripe test/restricted key, scoped for MCP tool use only) should be provisioned into CCR containers at all is an environment-provisioning decision outside this repo's fix surface — same category as AWS SSO being unavailable in CCR. Until/unless it is provisioned, **treat `stripe` as expected-unavailable in CCR** rather than re-diagnosing the connection failure each occurrence; do not attempt to work around it by hand-editing secrets into `.mcp.json` or the environment from an agent session.

## Mid-Session Repair Does Not Trigger Reconnection in CCR (LS-9777)

Generalizes LS-8689 above from "never connects, from session start" to "a stdio server that fails to connect does not reconnect in CCR even after a mid-session repair confirms the underlying cause fixed, and even though the server connected successfully earlier in the same session." This is a distinct symptom from every failure mode above it in this file:

- Not LS-9154 (the boot-time race) — that failure and its self-heal both happen in the session's first minute or two. This one is reported hitting a missing-`tsx` failure and running the repair well after boot, mid-session.
- Not LS-9431 (cyclic flapping) — flapping servers reconnect and drop repeatedly on their own, unprompted. Here, nothing reconnects at all, with or without a manual repair, for the rest of the session.
- Not LS-8689 as originally scoped — that ticket's repro sessions never had a working connection to begin with. LS-9777/LS-9780 both report servers that had been connected and working earlier in the same session, broke, were manually repaired, and then stayed down anyway.

**Repro (LS-9345, CCR session):** `worktree`, `legacy-sports-make`, `legacy-sports-nx`, `legacy-sports-ci-local`, `legacy-sports-aws`, `legacy-sports-browser`, `legacy-sports-dev-process`, and the hosted `stripe` connector all showed `CONNECT_TIMEOUT`/`CONNECTION_CLOSED` after the SessionStart hook warned `node_modules/.bin/tsx` was missing. Ran the documented repair directly:

```
node scripts/modules-pool/link.mjs   # completed: "[ok] slot materialised and linked"
ls -la node_modules/.bin/tsx         # confirmed: valid symlink, present
```

`ToolSearch` was retried immediately after the repair, again ~45s later, and repeatedly over the following hour-plus across dozens of intervening tool calls (the [Repeated Cyclic Flapping](#repeated-cyclic-flapping-during-long-running-sessions-ls-9431) retry window and well beyond it). Not one of the affected servers ever reconnected for the remainder of the session. LS-9780 corroborates the same shape with a narrower affected set (`legacy-sports-ci-local` alone, then in a later session also `worktree`/`legacy-sports-make`/`legacy-sports-nx`) and confirms it isn't `ci-local`-specific — which server(s) get stuck down varies session to session.

**Root cause, verified by reading the code (not inferred):** `mcp-bootstrap.mjs` (`.github/copilot/hooks/mcp-bootstrap.mjs`) has no retry, polling, or daemon behavior of its own — it is a one-shot script that runs its `tsx`-health check, repairs `node_modules` if needed, and then does a single `spawn()` of the real server process before exiting the bootstrap process's own responsibility (the spawned child inherits stdio and runs the actual MCP server). It never re-checks or relaunches anything on a timer; it only runs at all when something _external to this repo_ — the CCR harness's own MCP client — invokes it as a fresh launch attempt. The "self-repairs... within a few minutes" behavior documented under LS-9154 works only because the harness happens to make a few such launch attempts back-to-back while the container is still booting; that boot-time retry behavior is not something this repo's code drives and is not documented anywhere as continuing, at any cadence, once the session is past its boot window. Consistent with that, LS-8689's own closing implementation note (2026-09-08) independently concluded the platform-side CCR MCP-transport layer — not `mcp-bootstrap.mjs` or `.mcp.json` — governs whether/when a stdio server's connection is (re-)established, after ruling out every repo-side artifact across 10+ corroborating sessions.

This confirms **acceptance criterion (a) from LS-9777/LS-9780**: mid-session reconnection is not something this repo's bootstrap script can trigger, and empirically (LS-9345, LS-9506, LS-9598, and LS-8689's own multi-session corroboration through 2026-09-08) it does not happen in CCR — with or without a manual repair — once a stdio server has failed to connect past the session's boot window. There is no launch-attempt re-verification loop in this repo's code to fix (option (b) does not apply); the retry loop the LS-9154 guidance implicitly relies on lives entirely in the CCR harness itself, outside this repo's fix surface, and does not run mid-session.

**Recovery:**

1. Do not retry-loop `ToolSearch` waiting for a stdio server to come back after you've already run the documented repair (`node scripts/modules-pool/link.mjs`) and confirmed it worked (e.g. `ls -la node_modules/.bin/tsx` shows a valid symlink). Two short retries (per the [Repeated Cyclic Flapping](#repeated-cyclic-flapping-during-long-running-sessions-ls-9431) protocol) is still worth doing in case this instance happens to be ordinary flapping instead — but past that, treat the server as down for the rest of this session, not "still healing."
2. Report the outage per the [Reporting Protocol](#reporting-protocol) above (which servers, that the repair itself succeeded, how long you waited) and proceed on the documented Bash/generic-tool fallback (same fallback set as [LS-8689](#persistent-whole-session-non-connection-in-ccr-direct-branch-sessions-ls-8689)) for the rest of the session.
3. **Restarting the session is the only way to get an affected stdio server back**, since only a fresh boot re-enters the launch-attempt window the harness actually retries in. Restarting mid-ticket has its own cost (re-establishing context) — weigh that against the remaining fallback-driven work before doing it; for a ticket that's nearly done via fallback, finishing on the fallback path is usually cheaper than restarting.
4. Add a corroborating comment to LS-9777 or LS-9780 only if it surfaces new diagnostic signal (a case where a mid-session repair _does_ trigger reconnection, a harness-side log excerpt, or a different affected-server pattern) — this section is now the canonical reference for "repaired but still down" and a plain "happened again" adds nothing.

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
2. **Unattended/autonomous session already driving an approved, CI-green PR to merge** (the CCR exception pattern — see [cloud-agent-mode: hosted OAuth expires mid-session](../../cloud-agent-mode/references/ccr-known-failures.md#known-failure-mode-hosted-legacy-sports-githublegacy-sports-jira-oauth-expires-mid-session-on-long-running-watch-to-merge-loops-ls-8924)): if no generic `mcp__github__*`/`mcp__Atlassian__*` built-in fallback is available either, and no user response arrives within a reasonable wait, falling back to already-authenticated CLI tools for the remaining mechanical steps only (PR status checks, CI reruns, merge via `gh`; Jira view/transition/comment via `acli jira workitem`) is the documented recovery — both are separately authenticated outside the MCP OAuth path. **Report the fallback explicitly** (which servers, which error string, which steps used the CLI) so it lands in the MCP gap audit instead of being silently absorbed. This is a last resort for unattended sessions, not a first response — always attempt step 1 first if there is any chance a user is present to re-consent.

## Session-Start Auth Incompatibility Combined With Late Attach (LS-9924)

Distinct from both halves above taken separately: [Mid-Session Auth-Server Incompatibility](#mid-session-auth-server-incompatibility-does-not-support-dynamic-client-registration-ls-9439) assumes the error appears after the session was already working; [Persistent Whole-Session Non-Connection in Local Windows Launcher-Worktree Sessions](#persistent-whole-session-non-connection-in-local-windows-launcher-worktree-sessions-ls-8774) is scoped to the stdio-only servers (`worktree`/`nx`/`make`/etc.) with healthy `node_modules`. LS-9924 (2026-09-08, local Windows worktree session, PR #7629) reproduced a **combination** neither section covers on its own:

- **All seven** hosted-and-adjacent servers failed at session **start** (not mid-session): `legacy-sports-ci`, `legacy-sports-db-admin`, `legacy-sports-github`, `legacy-sports-jira`, `legacy-sports-rollbar` with the exact LS-9439 string (`Incompatible auth server: does not support dynamic client registration`); `legacy-sports-ci-local` and `stripe` with `CONNECTION_CLOSED`.
- `auth_check_all` reported `allAuthenticated: true` throughout — same false-green symptom as every LS-9439 recurrence comment.
- The servers **did** reconnect, exactly as LS-9370 describes for stdio servers, but under UUID-prefixed tool aliases rather than their configured names, and not until **after the PR had already merged** — so the reconnect window never overlapped the work. This matches LS-9370's "attach only mid-session" behavior extended to the hosted OAuth connectors, with a materially longer delay than LS-9370's own repro.
- Falling back to `gh pr create` for the whole lifecycle also produced the jira-link marker omission (`jira-mismatch` label) — the seventh recorded instance of that specific downstream chain (PRs #4743, #6660, #7506, #7517, #7522, #7565, #7629).

**The repeatedly-proposed `auth_check_all` reachability fix is not implementable here — stop re-filing it as a code fix.** LS-9439's original proposed fix, its own comment thread, and LS-9924 have each independently proposed "make `auth_check_all` detect this and report reachability, not just presence." It has not landed across three tickets not because it was missed, but because it sits outside what `auth_check_all` can observe: it runs inside the `worktree` MCP server, a single stdio process with no API to query a _sibling_ MCP server's connection or OAuth-session state — that state is owned entirely by the Claude Code client / claude.ai connector layer, outside this repo's process boundary. See `HOSTED_CONNECTOR_CAVEAT` in `tools/mcp/worktree-server/src/auth-checks.ts` (surfaced as the `caveat` field on every `auth_check_all` response — not in the tool's static `description`, which stayed unchanged to avoid tipping the `worktree` server's always-resident tool-definition token budget over its ceiling; see `docs/mcp/tool-budget.json`) — that is the actionable version of this fix: make the limitation visible in-band instead of promising a reachability signal the tool cannot produce. A future gap ticket proposing this should link here rather than re-opening the investigation from zero; it remains open only for someone to change the process boundary itself (e.g. a harness-level connector-health API), which is outside this repo's fix surface.

**Recovery — do not stall the ticket waiting on either half to self-resolve:**

1. Treat a session-start "Incompatible auth server"/`CONNECTION_CLOSED` result on the hosted+adjacent servers as this combined pattern, not a transient flap — the [LS-9924 repro's own reconnect took 60–90+ minutes](#reconnect-window-no-longer-reliable-ls-10127), well past the [Repeated Cyclic Flapping](#repeated-cyclic-flapping-during-long-running-sessions-ls-9431) retry window (two retries inside ~60–90 seconds), and — per LS-10127 below — reconnect within the session may not happen at all. A miss on that short retry does not mean it will self-heal soon; proceed to the fallback in step 2 rather than polling longer or waiting on reconnect.
2. Proceed on the documented per-server CLI/REST fallback for the rest of the ticket lifecycle (`acli jira workitem` for Jira, `gh` for GitHub/CI, `aws ssm`/direct `db_query` equivalents for DB) — this is the same compliant fallback set LS-9439 and LS-9370 already document, not a new workaround to invent per session.
3. **Before each subsequent Jira/GitHub/CI-touching step**, re-run `ToolSearch` on the bare tool name you need (`jira_view`, `github_open_pr`, `ci_view_run`, …) rather than trusting the start-of-session absence for the rest of the session — a reconnect _can_ land under a UUID-prefixed alias (e.g. `mcp__3b78d339-…__jira_*`) rather than the configured server name, so it will not show up under a search for the `legacy-sports-*` names. If a hit appears, switch to it for the remaining steps even mid-ticket. Treat this as a cheap habit, not an expectation — see below, most recent recurrences see no reconnect at all, under any name, for the rest of the session.
4. When falling back to `gh pr create` in place of `github_open_pr`, hand-author the `<!-- jira-link / primary: LS-#### -->` marker in the PR body yourself — omitting it is what produces the `jira-mismatch` label; see [create PR — Jira link marker](../../pr-lifecycle/references/create-pr.md#jira-link-marker-source-of-truth-for-ticket-linkage).
5. Report the outage in the post-merge MCP gap audit (which servers, which error string, how long until reconnect if observed) as a comment on **LS-10127** (below) rather than filing another near-duplicate ticket, unless the report includes new diagnostic signal (a partial reconnect, a different error string, evidence the process-boundary constraint above no longer holds).

<a id="reconnect-window-no-longer-reliable-ls-10127"></a>

### Recurrence: reconnect window shrinks to zero, `auth_check_all` fixes confirmed shipped but out of scope (LS-10127)

Ninth-plus data point on this same pattern (LS-10127, filed 2026-09-12, 8 corroborating comments through 2026-09-19 — all local Windows launcher-worktree sessions). No new root cause; this section — not a new ticket — is now the canonical landing spot for further recurrences, per this doc's own dedup convention (see LS-9850/LS-9722 above).

**What's new here, verified by reading the code (not re-asked from scratch):**

- **LS-9924's `auth_check_all` asks are confirmed shipped, exactly as narrow as documented above.** `HOSTED_CONNECTOR_CAVEAT` and the opt-in `sessionToolNames` → `rosterAbsent` cross-check (`rosterHasService()` in `tools/mcp/worktree-server/src/auth-checks.ts`) are both present and wired into `auth_check_all`'s handler in `tools/mcp/worktree-server/src/index.ts`. This is the full extent of what shipped from LS-9924/LS-9850/LS-9439/LS-9370 — none of those four tickets produced any other source change (`git log --all --grep`/`-S` for all four keys returns nothing beyond this). They were investigation/documentation tickets, and this file is their deliverable. A reachability probe (detecting a _dead_ OAuth session, not just an _absent_ one) remains unbuilt and is still not implementable from this process boundary — do not re-file it a fifth time.
- **The reconnect window that LS-9924/LS-9850/LS-9439 documented (60–90+ minutes, landing under a UUID-prefixed alias) is no longer something to count on.** Every LS-10127 recurrence comment reports the affected servers **never** reconnecting for the entire session, including after merge — a strictly worse outcome than LS-9924's own repro. Keep doing the bare-name `ToolSearch` re-probe before each step (recovery step 3 above) since it's cheap and a hit is still possible, but do not treat a continued miss as evidence anything is wrong on this repo's side, and do not delay the CLI fallback waiting for a reconnect that, per the current evidence, may not come.
- **No file-level conflict with LS-10099 or LS-10125.** Both are real, open, unparented Jira tickets (verified via `jira_view`) but neither has any code footprint in this repo (no commits, no branches, no grep hits) — they cover the _stdio_ `legacy-sports-ci-local`/`stripe` `CONNECTION_CLOSED` half of the picture (see [Persistent Whole-Session Non-Connection](#persistent-whole-session-non-connection-in-ccr-direct-branch-sessions-ls-8689) and the `stripe`/`ci-local` notes under it) rather than this section's hosted-OAuth-connector half, and remain unimplemented investigation tickets themselves as of this writing — nothing to rebase against.

**Conclusion, same as every prior ticket on this pattern:** root cause is upstream of this repo (the hosted auth server's OAuth dynamic-client-registration incompatibility, and separately the CCR/Claude-Code MCP transport's reconnect behavior) — both outside this repo's fix surface. Track the underlying platform fix on LS-9439 (still open) rather than per-recurrence tickets, per LS-10127's own proposed next step. A future occurrence of this exact signature is a comment here, not ticket number ten.

## Recurrence: Self-Recovery Under Hashed Tool Names + `acli` as Sanctioned Jira Fallback (LS-9850)

Third data point on the same pattern as [LS-9439](#mid-session-auth-server-incompatibility-does-not-support-dynamic-client-registration-ls-9439) and [LS-9924](#session-start-auth-incompatibility-combined-with-late-attach-ls-9924) — filed as a new ticket rather than a comment on LS-9439 because LS-9439 is Done and comments on a Done ticket don't get worked (see this repo's own dedup convention). No new root cause here; this section exists so the next recurrence lands here too instead of re-opening the investigation a further time.

> **Generalized beyond `legacy-sports-*`/hosted connectors (LS-9722).** Everything below was written from repros on this repo's own hosted/stdio servers, but the underlying mechanism — a logical MCP server getting re-exposed under a different tool-name prefix (UUID hash vs. configured friendly name) across a mid-session reconnect, with no notice to the caller — is a property of the Claude Code / CCR MCP client layer itself, not of any individual server. It reproduces identically on servers this repo does not own or configure at all: LS-9722's own repro was `mcp__Claude_Code_Remote__send_later` (a CCR session/trigger-management tool, not a `legacy-sports-*` server) working once under a UUID prefix, then failing outright under the friendly-name prefix used earlier in the same session, with the same bare "No such tool available" error this section already documents for `legacy-sports-*`. The Atlassian plugin (`mcp__claude_ai_Atlassian__*`) has shown the same churn. **Treat every instance of this failure — on any tool prefix, not only `mcp__legacy-sports-*`/`mcp__<uuid>__` — as this pattern**, and apply the same recovery: re-probe by bare tool name via `ToolSearch` before concluding a tool was removed, rather than trusting that a name which worked earlier in the session is still valid.
>
> **Disposition of LS-9722's three proposed fixes, evaluated against this same repo boundary:**
>
> 1. **Stable, session-durable prefix per logical server across reconnects** — not implementable from this repo. Prefix assignment on (re)connect is decided entirely by the Claude Code/CCR MCP client, a process this repo's code has no hook into; there is no server-side registration knob (in `.mcp.json`, a hosted server's Lambda code, or otherwise) that controls what prefix the client hands back after a reconnect. Same process-boundary argument [LS-9924](#session-start-auth-incompatibility-combined-with-late-attach-ls-9924) already used to close the `auth_check_all` reachability ask.
> 2. **Alias the old prefix to the new one for a grace period** — same boundary; aliasing a stale tool name to a live one would have to happen in the client's tool-dispatch layer (which resolves `mcp__<prefix>__<tool>` to a live server connection), not in any server this repo builds or deploys.
> 3. **Make the "No such tool available" error message itself actionable** — the literal error string is generated by the harness's own tool-dispatch failure path when it can't resolve a name, not by any code in this repo (no `tools/mcp/*-server` here emits that string) — so it can't be edited from this repo either. What this repo **can** do, and now does: make "re-run `ToolSearch` on the bare tool name" the standing, generalized response to that error (this note, plus the existing per-step re-probe guidance in [Hosted connector late-attach](tool-surfaces.md#hosted-connector-late-attach-ls-9370) and this section) — so an agent treats a bare "No such tool available" as a signal to re-probe by default, on any server, without needing the harness's own error text to say so. This is the AC3 "at minimum" fix, delivered at the documentation/practice layer since the code layer is out of reach.
>
> Do not re-file AC1/AC2 as a fourth attempt at a code fix (three prior tickets — LS-9439, LS-9924, LS-9850 — already reached this conclusion for the adjacent hosted-connector case; LS-9722 confirms it generalizes). A future recurrence — on any server, not just `legacy-sports-*` — should land as a comment on LS-9722 or this section, not a new ticket, unless it carries genuinely new diagnostic signal (e.g. evidence the client-side prefix assignment is influenced by something server-side after all).

**Observed (2026-09-03, PRs #7506/#7517/#7522):** `legacy-sports-github`, `legacy-sports-jira`, `legacy-sports-ci`, `legacy-sports-db-admin`, `legacy-sports-rollbar`, `stripe`, and `legacy-sports-ci-local` all failed at session start with the LS-9439 error string (the last two with `CONNECTION_CLOSED`). The hosted connectors self-recovered mid-session, but under opaque UUID-prefixed tool names (e.g. `mcp__cc498999-5040-4dc3-85e1-d205ffb5c4b0__github_*`) rather than their configured `mcp__legacy-sports-*` names — the same behavior [LS-9924](#session-start-auth-incompatibility-combined-with-late-attach-ls-9924) already documents. The actionable mitigation is unchanged from that section: **re-run `ToolSearch` on the bare tool name before every subsequent Jira/GitHub/CI-touching step**, even (especially) after you've already switched to a CLI fallback for the session — a session that routes around the initial failure has no other reason to notice a recovered connector, so the re-probe has to be a habit, not a one-time check. There is no session-start notice or stable-name guarantee to fix this in-band; the tool-name instability itself is a harness/platform-level behavior outside this repo's fix surface (same boundary as the `auth_check_all` limitation below).

**`auth_check_all` false-green (LS-9439 proposed-fix #1):** still not implementable for the reason [LS-9924](#session-start-auth-incompatibility-combined-with-late-attach-ls-9924) already closed the loop on — `auth_check_all` runs inside the `worktree` stdio server, which has no API to observe a sibling hosted connector's live OAuth-session state (that state belongs to the Claude Code client / claude.ai connector layer). The `caveat` field PR #7730 added to `auth_check_all`'s response is the actionable form of this fix already shipped; there is nothing further to build here. Do not re-file this as a code fix a fourth time — link here instead.

**Shared auth-proxy/gateway root cause (LS-9439 proposed-fix #3):** still unconfirmed. Every recurrence so far (LS-9439's own comment thread, LS-9924, this ticket) is consistent with a shared upstream cause — multiple independently-hosted connectors failing with the identical OAuth-registration string at once — but none has produced new diagnostic signal (proxy logs, a timing correlation with a deploy, etc.) beyond "it keeps happening." This is infra investigation outside a single repo session's reach; add a timestamp/affected-server comment to LS-9439 if you get new signal, rather than re-investigating from scratch.

**`acli` is the sanctioned Jira fallback for this failure mode** (user-confirmed preference, LS-9838) — when `legacy-sports-jira` is one of the failed servers, use `acli jira workitem` for view/comment/transition rather than waiting on the hosted connector or improvising a different tool. When the fallback also forces a raw `gh pr create` in place of `github_open_pr`, you lose that tool's automatic jira-link-marker insertion — hand-author the full `<!-- jira-link\nprimary: LS-####\n-->` block into the body yourself (see [create-pr.md — Jira-Link Marker](../../pr-lifecycle/references/create-pr.md#jira-link-marker-source-of-truth-for-ticket-linkage)); omitting it is what produces the `jira-mismatch` label. PRs #7506/#7517/#7522 each hit this and were fixed with a manual body edit at the time — all three are merged and none currently carries the label, so no further cleanup is needed there.

## Pre-flight Auth Check (Separate from Load Failures)

Call `auth_check_all()` (worktree MCP server) at the start of any workflow requiring GitHub,
Jira, AWS, or CI access. This checks credentials, not server availability — a server can be
connected but unauthenticated. If `allAuthenticated: false`, surface the `hint` for each
failing service and stop. When the worktree stdio server is absent (degraded CC-web),
use the per-service checks instead: `github_auth_status`, `jira_auth_status`, `ci_auth_status`,
`rollbar_auth_status`, `aws_sso_status`. See [SKILL.md — Pre-flight Auth Check](../SKILL.md#pre-flight-auth-check).

**This check is credential-presence only — it cannot detect a live-session failure** like [Mid-Session Auth-Server Incompatibility](#mid-session-auth-server-incompatibility-does-not-support-dynamic-client-registration-ls-9439) above, which reported `allAuthenticated: true` throughout a real outage (LS-9439). Trust an actual tool-call error over a green `auth_check_all` result.

## Skill Tool Returns This Command Instead of SKILL.md Content (LS-8719)

Distinct from the MCP server connectivity failures above — this is the `Skill` tool itself (not an MCP server), and it can misbehave even when every MCP server is healthy.

**Symptom:** `Skill(skill: "<name>", args: "...")` returns a short, self-referential turn instructing the agent to "invoke `Skill(skill: '<name>')` immediately" instead of the actual `SKILL.md` procedure, and a follow-up call made per that instruction **drops the passed argument** (e.g. a ticket key rendered empty or as `****`). Agents have reported it as "Skill returned boilerplate (LS-8719 defect)".

**Root cause (repo-side, deterministic):** Claude Code discovers skills only under `.claude/skills/` and also exposes every `.claude/commands/<name>.md` as a skill of the same name. This repo deliberately has no `.claude/skills/` (see [skill-routing.md](../../../../docs/dev-process/skill-routing.md)), so `Skill(skill: "<name>")` can only ever resolve to the **command** file — never to `.agents/skills/<name>/SKILL.md`. Commands that told the agent to "load `Skill(skill: "<name>")`" with their own name (or another command's name that did the same) therefore re-loaded themselves; the re-invocation carried no `args`, so `$ARGUMENTS` rendered empty. This was earlier misdiagnosed as a harness defect (LS-8503, LS-6259, LS-8719).

**Fix:** commands and skills load skill playbooks with `Read(file_path: ".agents/skills/<name>/SKILL.md")`, never `Skill(skill: "<name>")`. Reserve `Skill(...)` for invoking a **slash command** (`.claude/commands/<name>.md`) whose body does not route back to itself (e.g. `review`, `mcp-gap-audit`). `scripts/sync-agent-prompts.mjs` already renders `Read(file_path: "...")` as a plain path in the Copilot/Cursor/OpenCode/Codex mirrors.

**If you still hit it** (e.g. a stale command on an old branch): do not retry `Skill(...)`. Read the skill directly instead — this preserves any ticket key you were passed:

```
Glob(pattern: ".agents/skills/<skill-name>/**")
Read(file_path: ".agents/skills/<skill-name>/SKILL.md")
```

Then `Read` any `references/*.md` the `SKILL.md` points to for the mode you're routing into (e.g. `references/leaf-mode.md` for `work-ticket`), and fix the offending `Skill(...)` reference in the same PR.

## DesignSync Tool Absent From Subagent Tool Inventory (LS-9985)

Distinct from the MCP server connectivity failures above — `DesignSync` is a Claude Code harness built-in (not one of this repo's MCP servers), and it is simply not registered in a subagent's deferred-tool list, not attached-but-down.

**Symptom:** an `Agent`-dispatched subagent runs `ToolSearch({ query: "select:DesignSync" })` (or any keyword/name-constrained variant) and gets `"No matching deferred tools found."` The main session that spawned the subagent has full `DesignSync` access throughout. Confirmed with five parallel general-purpose subagents dispatched to pull disjoint file sets for one design sync (LS-9981) — all five hit the identical result and correctly refused to fabricate content, writing nothing.

**Do not loop on retrying `ToolSearch` inside the subagent or re-dispatching with different phrasing** — the tool is absent from that inventory by harness-level design, not a transient miss; no query variant surfaces it. This is the same category of out-of-repo-fix-surface limitation as the [Skill Tool command-resolution issue](#skill-tool-returns-this-command-instead-of-skillmd-content-ls-8719) above: there is no `.mcp.json` entry, agent definition, or server-side registration this repo controls that grants a subagent a main-session-only built-in tool.

**Recovery:** run every `DesignSync` call (`get_project`, `list_files`, `get_file`, and the write flow) from the main session, never from a dispatched subagent. Pace a bulk pull in-context instead of trying to parallelize it away — see [design-sync/references/designsync-tool.md § Main-session only](../../design-sync/references/designsync-tool.md#main-session-only--not-exposed-to-subagents-ls-9985) for the workaround and the file-size cost asymmetry to plan around.

## `db_execute` / `db_query` "password authentication failed" for `mcp_write` / `mcp_readonly` (LS-10416)

**Symptom:** a hosted DB tool (`db_execute`, `db_query`, `db_migration_status`) returns `password authentication failed for user "mcp_write"` (or `"mcp_readonly"`), or `Database unavailable: ... automatic resync failed: ...`. The connector itself is connected and the other role works — this is **not** an MCP transport or OAuth problem, so none of the checks above apply and `/mcp` re-consent will not fix it.

**Cause:** the Postgres role password drifted from its Secrets Manager value (seeded once by a migration; Terraform `random_password` owns the secret; nothing else links them).

**Fix path:** the hosted mcp-db Lambda resyncs the role from its secret automatically on the first `28P01` in a container and logs a Rollbar error as the alert — normally an agent never sees this. If it surfaces anyway, retry once (a cold container may heal it); if the error names `automatic resync failed`, run the manual fallback it prints (`pnpm --prefix lib/db-client run db:resync-role -- --role <role> --secret-name <secret>`, local session with AWS creds + DB tunnel — user-run if it needs `aws sso login`). Full detail: [database/references/mcp-role-password-drift.md](../../database/references/mcp-role-password-drift.md).

## See Also

- [LS-9439](https://bkrupa.atlassian.net/browse/LS-9439) — tracking ticket for the auth-server-incompatibility failure mode above; root cause still open
- [LS-9850](https://bkrupa.atlassian.net/browse/LS-9850) — third recurrence (filed fresh since LS-9439 is Done); documents `acli` as the sanctioned Jira fallback and confirms the `auth_check_all`/tool-name-instability limitations are already at their final documented-not-implementable state — land further recurrences here, not a new ticket
- [LS-9722](https://bkrupa.atlassian.net/browse/LS-9722) — generalized the LS-9850 tool-name-instability finding beyond `legacy-sports-*`/hosted connectors to any MCP server (repro: `mcp__Claude_Code_Remote__send_later`); confirmed AC1 (stable prefix) and AC2 (alias grace period) are not implementable from this repo for the same process-boundary reason as LS-9924's `auth_check_all` finding, and delivered AC3 ("make the error actionable") at the documentation/practice layer since the literal error string is harness-generated, not repo code
- [LS-9370](https://bkrupa.atlassian.net/browse/LS-9370) — tracking ticket for the hosted-connector late-attach failure mode; root cause still open
- [LS-9924](https://bkrupa.atlassian.net/browse/LS-9924) — tracking ticket for the combined session-start-incompatibility-plus-late-attach pattern above; also the ticket that closed the loop on the repeatedly-proposed `auth_check_all` reachability fix (see that section for why it's not implementable here)
- [LS-10127](https://bkrupa.atlassian.net/browse/LS-10127) — ninth-plus recurrence of the LS-9924 pattern; confirmed LS-9924's `auth_check_all` fixes shipped (caveat + roster check) and are the full extent of what's buildable here; new diagnostic signal is the reconnect window shrinking to "never, even after merge" — see [§ Reconnect window no longer reliable](#reconnect-window-no-longer-reliable-ls-10127) above; canonical landing spot for further recurrences of this exact signature
- [LS-8689](https://bkrupa.atlassian.net/browse/LS-8689) — tracking ticket for the persistent whole-session non-connection failure mode above; root cause is platform-side (CCR host), not this repo
- [LS-10099](https://bkrupa.atlassian.net/browse/LS-10099) — 20+ session recurrence log for the `ci-local`+`stripe`-only cohort; closed as a duplicate of LS-10125, which delivered the confirmed per-entry root causes documented above
- [LS-10125](https://bkrupa.atlassian.net/browse/LS-10125) — root-caused the `ci-local`/`stripe` two-server cohort above (superseding LS-10099's `node_modules`-materialization hypothesis for `ci-local`); the actual `lib/logging` `"type": "module"` fix is tracked as a separate follow-up ticket linked from LS-10125 since it needs full-suite verification outside this diagnostics-only change
- [LS-9845](https://bkrupa.atlassian.net/browse/LS-9845) — corroborated LS-8689 for the stdio-server cohort (no new signal, no repo fix); separately root-caused and fixed the bundled `stripe` `CONNECT_TIMEOUT` report as a distinct, repo-side `npx` cold-resolve issue — see the `stripe` note under LS-8689 above
- [LS-9780](https://bkrupa.atlassian.net/browse/LS-9780) — investigated `legacy-sports-ci-local`'s apparent non-recovery as a distinct, server-specific bug; ruled out (its stdio-launch path is architecturally identical to `nx`/`make`, and the ticket's own later comments show the never-recovers set is not fixed to `ci-local`) — folded into LS-8689/LS-9431 above, see the `ci-local` note under LS-8689; also corroborates [LS-9777](#mid-session-repair-does-not-trigger-reconnection-in-ccr-ls-9777) below (a mid-session repair not triggering reconnection)
- [LS-8774](https://bkrupa.atlassian.net/browse/LS-8774) / [LS-9743](https://bkrupa.atlassian.net/browse/LS-9743) — tracking tickets for the local Windows launcher-worktree equivalent of LS-8689 above; root cause likely platform/launcher-side, not confirmed
- [LS-9777](https://bkrupa.atlassian.net/browse/LS-9777) — tracking ticket for the mid-session-repair-does-not-reconnect failure mode above; confirmed `mcp-bootstrap.mjs` has no retry logic of its own, root cause is the same platform-side CCR transport layer as LS-8689
- [LS-9265](https://bkrupa.atlassian.net/browse/LS-9265) — narrowed the LS-8689 pattern to `legacy-sports-nx` specifically (AC1 ruled out via the same LS-9780 code-diff method, AC2 delivered as a concrete stop-polling threshold); also corrected a stale "`nx_run_pc_chunk` is absent by definition in CCR" assumption in `cloud-agent-mode/references/claude-code-remote.md`'s platform-detection logic — see [ccr-known-failures.md § LS-9265](../../cloud-agent-mode/references/ccr-known-failures.md#known-failure-mode-legacy-sports-nx-connects-unreliably-at-ccr-session-start-no-signal-distinguishes-still-connecting-from-never-will-ls-9265)
- `docs/dev-process/session-startup.md` — sequence diagram + orientation for the SessionStart hook chain that produces `[MCP WARNING]` output (LS-4505)
- [`../SKILL.md`](../SKILL.md) — tool surfaces, server load order, per-server tool substitution tables, and the auth model (absorbed the former `credentials` skill 2026-07-02)
- `docs/authentication/mcp-machine-credential-lifecycle.md` — rotation, revocation, and blast-radius runbook for the long-lived Cognito `client_credentials` machine secret (epic LS-5089, Track A)
- `.agents/skills/worktree-workflow/SKILL.md` — `scripts/modules-pool/link.mjs` details
- `AGENTS.md` `## MCP Servers` section — `MCP_TIMEOUT` setting and symlink repair notes

<a id="whole-session-stdio-absence-by-session-type-ls-9320"></a>

## Whole-session absence is expected in some session types, not just transient failure (LS-9320)

AGENTS.md's "shell fallback" language reads as if MCP tools normally exist and occasionally fail on a given call. That framing is incomplete: for `worktree`/`legacy-sports-nx`/`legacy-sports-make` (and sometimes their siblings — `legacy-sports-aws`/`browser`/`dev-process`/`ci-local`/`stripe`), **total absence for the entire session** — not one flaky call, not a mid-session drop — is a recurring, documented pattern in specific session types. If a probe from the [Environment Detection table](../SKILL.md#environment-detection) comes back absent, do not treat that as a one-off before checking whether your session type is a known case:

| Session type                                            | What's absent, for how long                                                                                                                                                                                                                                                                                                                                                                                          | Sanctioned fallback (compliant, not a stopgap)                                                                                                                                                                                                                                         | Canonical reference                                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CCR (Claude Code Remote) direct-branch / cloud sessions | `worktree`, `legacy-sports-nx`, `legacy-sports-make` (often the whole stdio cohort) `CONNECT_TIMEOUT`/`CONNECTION_CLOSED` at session start, no self-heal for the session's lifetime — and this also holds for a server that connected fine earlier in the session, then broke mid-session: a manual repair (e.g. `node scripts/modules-pool/link.mjs`) confirmed successful does **not** trigger reconnection either | Raw `git status`/`add`/`commit`/`push`/`fetch`/`diff`/`merge` via Bash; `pnpm exec nx run <project>:<target>` or backgrounded `make pc-<chunk>` in place of `nx_run_pc_chunk`/`make_run`; restart the session if you need the stdio server back rather than retry-looping `ToolSearch` | [§ LS-8689](#persistent-whole-session-non-connection-in-ccr-direct-branch-sessions-ls-8689), [§ LS-9777](#mid-session-repair-does-not-trigger-reconnection-in-ccr-ls-9777)                          |
| Local Windows launcher-worktree sessions                | Same stdio cohort absent for the whole session even with `node_modules`/`tsx` confirmed healthy (rules out the usual bootstrap-script cause)                                                                                                                                                                                                                                                                         | Same raw `git`/`make pc-<chunk>`/`npx nx` fallback as above                                                                                                                                                                                                                            | [§ LS-8774/LS-9743](#persistent-whole-session-non-connection-in-local-windows-launcher-worktree-sessions-ls-8774)                                                                                   |
| Any session (hosted connectors specifically)            | `legacy-sports-jira`/`-github`/`-ci`/`-db`/`-rollbar` absent or `Incompatible auth server` at start, sometimes attaching only **after** the PR has already merged                                                                                                                                                                                                                                                    | `acli`/`gh`/REST fallback, **plus** a bare-name `ToolSearch` re-probe before each subsequent Jira/GitHub step (a late attach can land under a UUID-prefixed alias)                                                                                                                     | [§ Hosted connector late-attach](tool-surfaces.md#hosted-connector-late-attach-ls-9370), [§ LS-9439](#mid-session-auth-server-incompatibility-does-not-support-dynamic-client-registration-ls-9439) |

In every row, the absence is platform/transport-side (confirmed via repo-side artifact checks in the linked tickets), not a repo misconfiguration to chase down mid-ticket. Diagnose once per the linked section's Check/Recovery steps, report per this file's [Reporting Protocol](#reporting-protocol), then proceed on the fallback for the rest of the session — that is the expected, compliant path, not something to apologize for or keep re-litigating on every subsequent tool miss.
