---
name: cloud-agent-mode
description: Running as a cloud coding agent (Claude Code on the web, Copilot Coding Agent). Covers GitHub and Jira auth setup, token configuration tables, Jira tool mapping, and which MCP servers are available vs unavailable in cloud environments. Load when operating in a cloud environment or when troubleshooting auth for cloud agents.
---

# Skill: Cloud Agent Mode

This section applies to **all** cloud agent platforms (Claude Code on the web, Copilot Coding Agent, etc.).

When running as a **cloud coding agent**:

- **No worktrees/twig/acli** — work directly in the repo root. Use `git` for branches, MCP tools for Jira.
- **No AWS access for MCP** — the hosted Jira/GitHub/CI MCP servers are reached with a Cognito machine-grant bearer (minted by copilot-setup-steps.yml), not an AWS role; the SigV4/OIDC Function-URL path was retired (LS-5093). DB MCP server uses local Docker PostgreSQL seeded from `resources/dev-seed.dump`.
- **Linux** — `bash` shell, `/` paths. No symlinks or file locks.
- **Native integrations (Claude Code on the web)** — Claude Code provides built-in GitHub and Atlassian connectors that work without configuring secrets. Prefer these over custom MCP servers when available.

## Cloud Platform Matrix

The "cloud agent" label covers three distinct configurations with very different tool availability. **Identify which one you are in before following any workflow below** — each has its own MCP server availability, degraded-mode posture, and which workflow steps are runnable end-to-end.

| Capability                                     | CC web (default, no setup)                               | CC web (custom MCP configured)                     | Copilot Coding Agent                                    |
| ---------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Built-in `Read` / `Edit` / `Write` / `Bash`    | ✅                                                       | ✅                                                 | ❌ — uses agent-SDK tool surface, not Claude Code shell |
| Built-in `Glob` / `Grep`                       | ❌ verified absent (LS-4358 + reprobed)                  | ❌ verified absent (LS-4358 + reprobed)            | ✅ assumed (not re-verified)                            |
| Atlassian plugin (`mcp__claude_ai_*`)          | ✅                                                       | ✅                                                 | ❌                                                      |
| Built-in GitHub (`mcp__github__*`)             | ✅                                                       | ✅                                                 | ❌                                                      |
| Custom `legacy-sports-jira` (hosted API GW)    | ❌                                                       | ⚠️ if Cognito token + URL configured               | ✅                                                      |
| Custom `legacy-sports-github` (hosted API GW)  | ❌                                                       | ⚠️ if Cognito token + URL configured               | ✅                                                      |
| Custom `legacy-sports-ci` (hosted API GW)      | ❌                                                       | ⚠️ if Cognito token + URL configured               | ✅                                                      |
| `legacy-sports-make`, `-nx`, `-db`, `worktree` | ❌                                                       | ❌                                                 | ✅ (via copilot-setup-steps.yml)                        |
| `make pc` runnable                             | ⚠️ shell fallback only                                   | ⚠️ shell fallback only                             | ✅ via `make_run({ target: "pc" })`                     |
| Thread-resolution node IDs available           | ❌ no `mcp__github__*` read path returns them (verified) | ✅ via `github_get_review_threads` (custom server) | ✅ via `github_get_review_threads` (custom server)      |
| End-to-end driveable                           | ⚠️ Cycle-1-clean PRs only                                | ⚠️ partial — depends on what's loaded              | ✅ full implement-and-merge                             |

**Default Claude Code on the web is the most-restricted mode.** Three diagnostic probes this cycle confirmed the actual surface: CC web does not process project-level `.mcp.json` for stdio MCP servers at all, so custom `legacy-sports-*` servers cannot be loaded even with `node_modules` pre-populated. `.devcontainer/devcontainer.json` is also ignored — `postCreateCommand`, `remoteEnv`, and `features` (Docker-in-Docker) do not run. What you do have: Atlassian plugin + built-in `mcp__github__*` + built-in `Read`/`Edit`/`Write`/`Bash` + a usable `node_modules` (`tsx`, `prettier`, `nx` resolve via `pnpm exec`). What you do **not** have: `Glob`/`Grep` (verified absent), `gh` CLI (verified absent — no `GH_TOKEN`/`GITHUB_TOKEN` in env either), Docker daemon (verified absent — `/var/run/docker.sock` missing), `twig`, `acli`, or any of `worktree_*` / `make_run` / `nx_run*` / `db_*` / `ci_*` / `jira_*` MCP tools. The agent **can** drive a PR end-to-end if bot review returns clean on Cycle 1; if bot review returns mandates, thread resolution blocks (no `mcp__github__*` read path returns GraphQL thread node IDs). See [Degraded-Mode Workflow](#degraded-mode-workflow-claude-code-on-the-web-no-custom-mcp) below.

**How to detect which mode you're in** (run at session start):

1. Look at the deferred-tools `<system-reminder>`. If `mcp__legacy-sports-make__*`, `mcp__legacy-sports-nx__*`, `mcp__worktree__*` are absent → no Copilot-style hosted toolchain → default CC web.
2. Call `jira_auth_status` (worktree/legacy-sports-jira). If the tool itself is unavailable → no custom Jira server → default CC web. If it returns `configured: false` or fetch fails → see [Quirk 1](#quirk-1-legacy-sports-jira-mcp-server-fetch-failed-claude-code-on-the-web-only).
3. If both 1 and 2 indicate missing custom servers → switch to the degraded-mode workflow.
4. **If the `mcp__legacy-sports-{jira,github,ci}__*` tools _are_ present in a Claude Code on the web session**, they arrived via the OAuth custom-connector path (see below), not via project `.mcp.json`. Treat the session as fully-configured CC web (column 2 of the matrix) and use the MCP-first workflow.

### Claude Code web custom remote connectors (OAuth) — LS-5089 Track B

> **Posture change (epic LS-5089, Phase 3 / LS-5096).** The three hosted servers (`legacy-sports-jira`, `legacy-sports-github`, `legacy-sports-ci`) are now reachable from **Claude Code on the web** as **custom remote MCP connectors** registered in claude.ai. This supersedes the older "CC web is structurally excluded" framing: CC web still does **not** read project `.mcp.json` and its connector UI still exposes **no static-bearer field**, but the Lambdas now implement the MCP OAuth 2.0 Authorization spec (Protected Resource Metadata + `401`/`WWW-Authenticate` challenge — LS-5095), so the OAuth-only connector UI is sufficient.

> **New developer onboarding**: to get access as a new developer, see [`docs/dev-process/mcp-connector-access.md`](../../../docs/dev-process/mcp-connector-access.md) — it covers the full Track B setup (Cognito user invite from an Org Owner → claude.ai connector consent) and Track A setup for local sessions.

**How it works:**

- **Registration is owner-only and out-of-band.** A claude.ai **Org Owner** registers each server's API Gateway URL under **Org settings → Connectors** (Settings → Connectors on Free/Pro/Max). Agents **cannot** perform this step — it is a human, browser-driven action in claude.ai. Once registered, the connector **auto-syncs into Claude Code** for anyone logged in with the same account, so the `mcp__legacy-sports-*` tools appear in CC-web sessions without any `.mcp.json` or token configuration.
- **Auth is OAuth, not the machine credential.** CC web drives the interactive OAuth consent flow (human in a browser) against Cognito; the per-connect `headersHelper` machine-token model used locally/Copilot (Track A) does **not** apply in CC web. The MCP Gateways stay publicly reachable with OAuth-only authorization (no Anthropic-IP allowlist).
- **Residual limitation — re-consent on token expiry.** Claude Code does **not** auto-refresh MCP OAuth tokens mid-session ([claude-code#58607](https://github.com/anthropics/claude-code/issues/58607)). A CC-web session that outlives the OAuth access token must **re-consent via `/mcp`** to keep reaching the three servers; there is no silent refresh today. This is an upstream gap we design around, not a server bug — surface it to the user rather than retrying or falling back. (Local/Copilot sessions are immune because Track A re-mints a short-lived token at every connect; see `mcp-diagnostics`.)

**Cloud workflow (MCP-first — Copilot Coding Agent or fully-configured CC web):**

> The flow below assumes the full hosted-Lambda toolchain is connected (custom MCP servers all reached over Cognito-authenticated API Gateway endpoints — a machine-grant bearer on Copilot, an interactive token on developer machines). On default Claude Code on the web sessions where these servers do **not** auto-load, follow [Degraded-Mode Workflow](#degraded-mode-workflow-claude-code-on-the-web-no-custom-mcp) instead.

1. **Jira**: `jira_create_ticket({ summary: "...", sprint: "current" })` → `jira_claim_ticket({ key: "LS-####" })` (atomically checks blockers, validates status, and transitions to In Progress)
   - `action: "PROCEED"` → claimed; use `branchRecommendation` to decide git base (main vs a blocker branch)
   - `action: "STOP"` → read `reason` and halt; do not proceed
   - `action: "ALREADY_CLAIMED"` → call `github_list_prs(search: "LS-####")`; **STOP** if an open PR exists. If no PR exists, inspect the `ticket.updated` timestamp: **STOP** if within the last 60 minutes (assume another agent just claimed it); only proceed if older than 60 minutes (orphaned ticket — note it in the PR body and continue without re-transitioning)
2. **Code**: implement the changes
3. **Validate**: `make_run({ target: "typecheck" })`, `make_run({ target: "lint-fix" })`, `make_run({ target: "test" })`
4. **DB**: `db_migration_status()` → `db_migrate()`
5. **Pre-commit**: `make_run({ target: "pc" })`
6. **Self-review (MANDATORY gate)**: `make_run({ target: "lint-review-patterns" })`, then read every changed file in full and manually check patterns **#3, #4, #7, #8, #9, #19, #20** from `../pr-lifecycle/references/common-review-patterns.md`. Also scan for dead code, unsafe casts, missing/null guards, async correctness, stale comments, misleading success logs, and missing tests for changed behavior. Produce a **Self-Review Summary** before proceeding. If you find issues, fix them, re-run Step 5, then repeat this Step 6 on the updated diff and update the **Self-Review Summary** before proceeding.
   - **Copilot Coding Agent note**: there may be no `/review` slash-command support in this environment. That does **not** waive the gate — inline the checklist from `../pr-lifecycle/references/self-review.md` yourself.
7. **Ship**: `worktree_commit({ message: "type(scope): msg" })` → `worktree_push()`
8. **PR**: choose the create/mark-ready path based on environment, then label:
   - **Claude Code on the web (built-in available)**: `mcp__github__create_pull_request({ owner, repo, head, base, title, body, draft: true })` → `github_manage_labels({ prs: [<PR#>], add: ["agent-in-progress"] })` → `mcp__github__update_pull_request({ owner, repo, pullNumber: <PR#>, draft: false })`. Built-in tools authenticate via Claude's native GitHub connector so the PR is authored under the bot identity, not the user's personal token.
   - **Copilot Coding Agent (built-in unavailable)**: `github_create_pr({ title: "...", body: "...", draft: true })` → `github_manage_labels({ prs: [<PR#>], add: ["agent-in-progress"] })` → `github_mark_pr_ready({ number: <PR#> })`. The custom server uses the Agent Author app token provisioned by `copilot-setup-steps.yml`, which is also a bot identity (not a user PAT).
   - Apply the label while still a draft, before marking ready — see [Review Lifecycle in Cloud](#review-lifecycle-in-cloud). `github_manage_labels` has no built-in equivalent, so the label call is the same in both environments.
9. **Jira**: `jira_transition({ key: "LS-####", status: "In Review" })`

10. **Review lifecycle**: monitor PR → fix Copilot comments → self-review changed files → fix code → validate before every push → reply → resolve threads → re-request review (see [Review Lifecycle in Cloud](#review-lifecycle-in-cloud) below)

Shell fallbacks (only if MCP server is unavailable): `make <target>`, `git commit`, `git push`, `gh pr create`, `gh pr edit <PR#> --add-label "agent-in-progress"`.

## Degraded-Mode Workflow (Claude Code on the web, no custom MCP)

This is the runbook for default Claude Code on the web sessions. Three diagnostic probes (LS-4358 plus two follow-ups) mapped the actual operating envelope — what's below is confirmed facts, not aspirational guidance. The agent's reach is broader than earlier framings suggested (validation, tests, git, nx targets, and PR open-to-Cycle-1-merge all work) but has one structural hard limit: thread resolution after bot mandates is impossible without a local handoff.

### Confirmed capability matrix

| Capability                     | Available?          | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read files                     | ✅                  | `Read` (always available — never use `cat`/`head`/`tail`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Search/list files              | ❌ Glob/Grep absent | Bash `find`/`ls`/`grep` only — see [Degraded-tools fallback](#degraded-tools-fallback-when-globgrep-are-unavailable)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Edit code                      | ✅                  | `Edit`, `Write`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Read/search Jira               | ✅                  | Atlassian plugin (`searchJiraIssuesUsingJql` with `cloudId: "fb294606-..."`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Create/transition Jira tickets | ✅ (Quirk 2 caveat) | Atlassian plugin — `transitionJiraIssue({ transition: { id: "21" } })`. Cold-start can reject nested objects; retry once after any other plugin call. See [Quirk 2](#quirk-2-atlassian-plugin-transitionjiraissuecreatejiraissue-reject-nested-object-parameters-on-cold-start).                                                                                                                                                                                                                                                                               |
| Run `make pc`                  | ✅ via Bash         | `Bash` → `make pc`. CC web pre-populates `node_modules`, so `tsx`/`prettier`/`nx` resolve through `pnpm exec` without any install step.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Run tests / Nx targets         | ✅ via Bash         | `Bash` → `make test` or `pnpm exec nx run <project>:<target>` or `pnpm exec nx affected -t <target> --base=origin/main`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Git commit / push / rebase     | ✅ via Bash         | `Bash` → `git add <files> && git commit && git push -u origin HEAD`. Push auth is provided by the CC web sandbox.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Create PR                      | ✅                  | `mcp__github__create_pull_request({ owner, repo, title, head, base, body, draft: true })`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mark PR ready / request review | ✅                  | `mcp__github__update_pull_request({ draft: false })`, `mcp__github__request_copilot_review`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Read PR details / reviews      | ✅                  | `mcp__github__pull_request_read({ method: "get" \| "get_reviews" \| "get_review_comments" })`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Reply to review comments       | ✅                  | `mcp__github__add_reply_to_pull_request_comment` (replies to a numeric comment ID, not a thread)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Merge PR (Cycle-1 clean)       | ✅                  | `mcp__github__merge_pull_request({ pullNumber, mergeMethod: "squash" })` if it appears in the tool surface; otherwise the user merges via GitHub UI.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Resolve review threads**     | ❌ **HARD BLOCKER** | No `mcp__github__*` read path returns GraphQL thread node IDs (verified across three probes). `mcp__github__resolve_review_thread` exists but is unusable without an ID source. `gh api graphql` is also blocked — no `gh` CLI installed and no `GH_TOKEN`/`GITHUB_TOKEN` in env. Upstream gap: [github/github-mcp-server#2229](https://github.com/github/github-mcp-server/issues/2229), [#2331](https://github.com/github/github-mcp-server/issues/2331). Until either ships, **PRs that hit bot Cycle 2 cannot be completed from inside a CC web session**. |
| DB migrations                  | ❌                  | Docker daemon absent (`/var/run/docker.sock` missing) — no local Postgres. `psql` client is installed but has nothing to connect to.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| CI log queries                 | ❌                  | No `ci_*` MCP, no `gh` CLI, no `GH_TOKEN`/`GITHUB_TOKEN` in env. Rely on Claude Code's native PR/CI event surfacing for failure notifications.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Workflow run lookups           | ⚠️ partial          | `mcp__github__list_workflow_runs` may be loaded; if so, use it. Otherwise, native event surfacing.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Workflow shape

1. **Identify the ticket** via Atlassian plugin: `searchJiraIssuesUsingJql({ cloudId: "fb294606-...", jql: "key = LS-####", maxResults: 1 })`. Never `getJiraIssue` — see AGENTS.md.
2. **Transition to In Progress** via `transitionJiraIssue({ cloudId: "fb294606-...", issueIdOrKey: "LS-####", transition: { id: "21" } })`. Mind Quirk 2 — retry once if the first call rejects the nested object.
3. **Branch off latest main**:
   ```bash
   git fetch origin main
   git checkout -b claude/ls-####-<short-description> origin/main
   ```
4. **Implement**:
   - File reads → `Read(file_path: "...")`
   - File discovery → Bash `find . -name "*.tsx" -type f` / `grep -rl "pat" path/` / `ls -1 path/` (Glob/Grep absent — see [Degraded-tools fallback](#degraded-tools-fallback-when-globgrep-are-unavailable))
   - Edits → `Edit` / `Write`
5. **Validate**: `Bash` → `make pc`. The exit code is the truth; on failure, parse the output, fix the failing step, re-run.
6. **Self-review**: read every changed file in full, walk the patterns checklist from [`common-review-patterns.md`](../pr-lifecycle/references/common-review-patterns.md). The `/review` slash command may not be available in CC web — inline the checklist.
7. **Commit and push**:
   ```bash
   git add <specific files>                              # never `git add .` — sensitive-file risk
   git commit -m "<type>(<scope>): <msg> (LS-####)"
   git push -u origin HEAD                               # sets upstream on first push
   ```
8. **Open PR**: `mcp__github__create_pull_request({ owner: "bkrupa", repo: "legacy-sports", head: "<branch>", base: "main", title: "LS-#### <type>(<scope>): <msg>", body: "<markdown body>", draft: true })`. Then `mcp__github__update_pull_request({ pullNumber: N, draft: false })` → `mcp__github__request_copilot_review({ pullNumber: N })`.
9. **Transition Jira to In Review**: `transitionJiraIssue({ ..., transition: { id: "2" } })`.
10. **Watch for bot review** — Claude Code surfaces review events natively, no polling needed.
    - **Cycle 1 clean (LGTM)** → merge via `mcp__github__merge_pull_request` if available, or ask the user to merge.
    - **Cycle 1 with mandates** → reply to each thread's top-level comment with `FIX: <sha>` via `mcp__github__add_reply_to_pull_request_comment({ pullNumber, commentId, body: "FIX: <sha>" })`, push fix commits, then **STOP**. Thread resolution is the hard blocker — see the explicit handoff message below.

### Stop-point script (PR hit bot Cycle 2 with mandates)

Use this verbatim when thread resolution is required:

> PR #N has unresolved review threads that I can reply to but cannot mark resolved from Claude Code on the web. `mcp__github__resolve_review_thread` is loaded, but no `mcp__github__*` read path returns the GraphQL thread node IDs it needs. `gh api graphql` is also unavailable (no `gh` CLI, no `GH_TOKEN`). I have replied to each open thread with `FIX: <sha>` and pushed the fix commits. To complete the PR, please either (a) resolve the threads in the GitHub UI and re-request review, or (b) hand off to a local session — the custom `legacy-sports-github` MCP server's `github_resolve_threads` tool can finish the cycle.

LS-4377 wires this into the formal `/cloud-teleport` skill so the handoff produces a structured artifact instead of a chat message. Until that lands, use the script above.

### Concrete Bash recipes

Copy-paste replacements for MCP tools that are not loaded in CC web:

```bash
# Validate (replaces make_run({ target: "pc" }))
make pc

# Run a specific nx target (replaces nx_run)
pnpm exec nx run <project>:<target>

# Run affected nx target (replaces nx_run_affected)
pnpm exec nx affected -t <target> --base=origin/main

# Status / diff / log (replaces worktree_status / worktree_diff / worktree_log)
git status --short
git diff
git log --oneline -10

# Show a file at a ref (replaces worktree_show_file)
git show HEAD:<path>
git show origin/main:<path>

# Rebase onto main (replaces worktree_rebase)
git fetch origin main
git rebase origin/main
# resolve conflicts with Read + Edit; never edit with sed/awk
git rebase --continue
```

### Honest framing

In degraded mode the agent is a **near-full driver for Cycle-1-clean PRs** and a **research + ticketing + PR-author agent for anything requiring bot iteration**. Set expectations with the user at session start based on the change's risk: low-risk docs and small fixes usually land Cycle-1; medium/high-risk code changes usually trigger at least one mandate. When a mandate arrives, do not improvise — use the stop-point script.

## File Exploration in Cloud Sessions (Critical)

Cloud agents lose access to the `worktree`, `make`, and `nx` MCP servers. Built-in Claude Code tool availability for the remaining file-exploration primitives varies by cloud platform:

| Built-in tool | Claude Code on the web                                | Copilot Coding Agent                              |
| ------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `Read`        | ✅ always available                                   | ✅ always available                               |
| `Glob`        | ⚠️ frequently absent (verified 2026-05-12 in LS-4358) | ✅ assumed available (not re-verified in LS-4358) |
| `Grep`        | ⚠️ frequently absent (verified 2026-05-12 in LS-4358) | ✅ assumed available (not re-verified in LS-4358) |

**Probe before relying on `Glob`/`Grep`.** At the start of a Claude Code on the web session run `ToolSearch(query: "select:Glob,Grep")`. If it returns "No matching deferred tools found" and the tools also do not appear in the top-of-prompt tool list, treat them as unavailable for the rest of the session and use the degraded-tools fallback below. `Read` is always present and should never be substituted with `cat`/`head`/`tail`.

> **Upstream issue**: the built-in `Glob` and `Grep` tools are not enumerated in some Claude Code on the web sessions even though they exist on the platform. This is a Claude Code platform-side gap; LS-4358 verified the absence. Track that ticket for upstream resolution and removal of the degraded-tools section.

### When `Glob`/`Grep` are available (preferred)

The [Tool-first for file operations](../../../AGENTS.md) rule in AGENTS.md applies in cloud environments too. Key substitutions:

| Instead of (Bash)                     | Use (built-in tool)                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `find . -name "*.tsx" -type f`        | `Glob(pattern: "**/*.tsx")`                                                   |
| `find path -type d -name "*league*"`  | `Glob(pattern: "**/*league*", path: "path")`                                  |
| `ls -la path/`                        | `Glob(pattern: "*", path: "path")`                                            |
| `grep -n "pattern" file.tsx`          | `Grep(pattern: "pattern", path: "file.tsx", output_mode: "content")`          |
| `grep -rn "pattern" dir/`             | `Grep(pattern: "pattern", path: "dir", output_mode: "content")`               |
| `grep -n "minHeight\|100vh" file.tsx` | `Grep(pattern: "minHeight\|100vh", path: "file.tsx", output_mode: "content")` |
| `cat apps/web/src/app/app.tsx`        | `Read(file_path: "apps/web/src/app/app.tsx")`                                 |
| `head -n 50 file.ts`                  | `Read(file_path: "file.ts", limit: 50)`                                       |
| `tail -n 50 file.ts`                  | `Read(file_path: "file.ts", offset: <approx_line>, limit: 50)`                |

> **Why this matters**: a session (LS-2938 fix) ran 78 Bash commands, 50+ of which were `find`/`ls`/`grep`/`cat` that had direct built-in equivalents. `Glob`/`Grep`/`Read` are faster, have no shell-quoting hazards, and produce structured output. When these tools are present, the absence of custom MCP servers is not a signal to fall back to Bash for file exploration.

### Degraded-tools fallback (when `Glob`/`Grep` are unavailable)

If the probe above confirms `Glob` and `Grep` are absent, use Bash via the `Bash` tool — these are not antipatterns in that session; they are the only option for file discovery. Continue using `Read` for file content (it is always available).

| Goal                              | Bash fallback                      | Notes                                                      |
| --------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| List files by glob pattern        | `find . -name "*.tsx" -type f`     | Use `-type f` for files only; quote globs                  |
| List directory contents           | `ls -1 path/`                      | `-1` for one-entry-per-line output                         |
| Find files containing a pattern   | `grep -rl "pattern" path/`         | `-l` lists files with matches; `-r` recursive              |
| Show pattern matches with context | `grep -rn "pattern" path/`         | `-r` recursive, `-n` line numbers                          |
| Case-insensitive content search   | `grep -rin "pattern" path/`        | `-i` for case-insensitive                                  |
| Read file (any size)              | `Read(file_path: "...", limit: N)` | `Read` is always available — never use `cat`/`head`/`tail` |

For multi-pattern search, prefer `-e` to sidestep regex-flavor pitfalls:

```bash
grep -rn -e "pat1" -e "pat2" path/
```

If you do want regex alternation, the operator differs by regex flavor: with `-E` (extended regex / ERE) it is the literal pipe character `|` (e.g. `grep -rEn 'pat1|pat2' path/`); with basic regex (default) it is a backslash-escaped pipe (e.g. `grep -rn 'pat1\|pat2' path/`). The two forms are not interchangeable.

> When in doubt, route file **discovery** through Bash but always route file **reads** through `Read`. Built-in `Read` produces deterministic line-numbered output and respects size limits more cleanly than `cat`.

## Cloud MCP Cheat Sheet

Always use MCP tools instead of raw shell commands. The MCP tools provide structured output, error handling, and are permission-controlled.

| Instead of (Bash)                  | Use (MCP)                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make format`                      | `make_run({ target: "format" })`                                                                                                                                                                                                             |
| `make pc`                          | `make_run({ target: "pc" })`                                                                                                                                                                                                                 |
| `make lint-fix`                    | `make_run({ target: "lint-fix" })`                                                                                                                                                                                                           |
| `make build`                       | `make_run({ target: "build" })`                                                                                                                                                                                                              |
| `npx nx run proj:target`           | `nx_run({ project: "proj", target: "target" })`                                                                                                                                                                                              |
| `npx nx affected -t target`        | `nx_run_affected({ target: "target" })`                                                                                                                                                                                                      |
| `git add . && git commit -m "msg"` | `worktree_commit({ message: "msg" })`                                                                                                                                                                                                        |
| `git push`                         | `worktree_push()`                                                                                                                                                                                                                            |
| `git status`                       | `worktree_status()`                                                                                                                                                                                                                          |
| `git diff`                         | `worktree_diff()`                                                                                                                                                                                                                            |
| `git log`                          | `worktree_log()`                                                                                                                                                                                                                             |
| `gh pr create`                     | CC web: `mcp__github__create_pull_request({ owner, repo, head, base, title, body, draft: true })` (built-in, bot identity). Copilot: `github_create_pr({ title: "...", body: "...", draft: true })` (custom server, Agent Author app token). |
| `gh pr view`                       | CC web: `mcp__github__pull_request_read({ method: "get", owner, repo, pullNumber })` (built-in). Copilot: `github_view_pr({ number: N })` (custom server).                                                                                   |

## Review Lifecycle in Cloud

On **Claude Code on the web**, the built-in `mcp__github__*` tools are the **authoritative path for every PR operation that has a built-in equivalent** — create PR, mark ready, reply to threads, request Copilot review, read PR/reviews. The built-in surface authenticates via Claude's native GitHub connector, so PRs and comments are authored under a bot identity rather than the user's personal GitHub account. The custom `legacy-sports-github` server is reserved for the gaps the built-in surface does not cover: **fetching review thread node IDs** (`github_get_review_threads`), **batch-resolving threads with bot-review recheck** (`github_resolve_threads`), and **label management** (`github_manage_labels`). See "Which operations MUST use the custom MCP server" below for the full gap list.

### Cloud review workflow

```
1. Create PR (draft)     → mcp__github__create_pull_request({ owner, repo, title, head, base, draft: true })
2. Mark ready            → mcp__github__update_pull_request({ owner, repo, pullNumber, draft: false })
3. Request Copilot       → mcp__github__request_copilot_review({ owner, repo, pullNumber })
4. [Claude Code surfaces PR events natively — CI results, Copilot comments, merge status]
5. Read review threads   → github_get_review_threads({ number: <PR#>, unresolvedOnly: true })  ← custom server (returns GraphQL thread node IDs)
6. Fix code, validate (`make pc`), self-review the changed files, commit & push
7. Reply to threads      → mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })  ← built-in (bot identity)
8. Resolve threads       → github_resolve_threads({ threadIds: [...], prNumber: <PR#> })  ← custom server (batch; prNumber triggers bot-review recheck — may 403 on app tokens but threads are still resolved)
9. Re-request review     → mcp__github__request_copilot_review({ owner, repo, pullNumber })
10. [Loop back to 4 if new comments arrive, cap at 2 rounds]
```

### Thread ID resolution

The built-in `mcp__github__pull_request_read({ method: "get_review_comments" })` returns thread metadata (`isResolved`, `isOutdated`, `isCollapsed`) and the comments inside each thread, **but does not return the GraphQL thread node ID** that `mcp__github__resolve_review_thread` requires. There is currently no way to get thread node IDs through the built-in MCP server alone — `pull_request_read` does not have a `get_review_threads` method, and `includeThreadIds` is silently ignored.

> **Upstream feature requests**: [github/github-mcp-server#2331](https://github.com/github/github-mcp-server/issues/2331) (expose thread node ID in `get_review_comments` response — Option A) and [github/github-mcp-server#2229](https://github.com/github/github-mcp-server/issues/2229) (add `list_pull_request_review_threads` tool — Option B) are open on the official GitHub MCP server. Once either ships, the "Local fallback" and "Reply-only fallback" strategies below can be retired. Track these issues to determine when the custom `legacy-sports-github` server is no longer needed for thread reads in cloud sessions.

Three strategies, in preference order:

1. **Preferred (custom MCP for reads and resolves)**: Use `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })` from the custom `legacy-sports-github` server to fetch threads — it returns the GraphQL `id` per thread. Then pass those IDs to `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })`. This is the only fully-automated path and works with GitHub App installation tokens (`ghs_*`). The `prNumber` parameter triggers a bot-review recheck attempt when all resolutions succeed; if the app token lacks `actions: write` the dispatch is skipped/non-fatal and the tool returns a `recheckNote` in its output (threads are still resolved) — the recheck fires automatically on the next push.
2. **Local fallback (`gh` CLI)**: If `gh` is available (it usually is **not** in cloud agent environments), call:

   ```bash
   gh api graphql -f query='query($owner:String!,$repo:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$after){nodes{id isResolved} pageInfo{hasNextPage endCursor}}}}}' \
     -F owner=<owner> -F repo=<repo> -F number=<PR#>
   ```

   to fetch thread node IDs. If `pageInfo.hasNextPage` is `true`, rerun the same query with `-F after=<endCursor>` and keep paging until `hasNextPage` is `false`, then resolve the collected thread IDs via `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })`. Without paging, this misses threads on PRs with more than 100 reviews.

3. **Reply-only fallback (last resort)**: Only if both the custom MCP server (after the ~10s startup retry above) and `gh` are confirmed unavailable. Use `mcp__github__pull_request_read({ method: "get_review_comments" })` to inspect the unresolved threads, extract the numeric `commentId` for the top-level comment in each thread, and reply to that comment via `mcp__github__add_reply_to_pull_request_comment({ commentId, body: "addressed in <sha>" })` (the built-in tool replies to a specific review **comment**, not a thread). **This fallback requires manual user intervention and blocks autonomous PR merge. STOP here and tell the user:**

   > "PR #N has unresolved review threads that cannot be resolved automatically in cloud mode. I've replied to each thread with the fix SHA, but thread resolution requires the custom `legacy-sports-github` server or `gh` — neither is available. Please resolve the threads in the GitHub UI, then let me know and I will resume."

   Do not silently leave the PR in a stuck state and do not loop-retry or attempt the same fallback again — wait for the user to respond before continuing.

**Which operations MUST use built-in tools on Claude Code on the web** (authorship is visible to users; built-in routes through Claude's native GitHub connector with a bot identity, custom server would route through the user's PAT if `GH_TOKEN` is set in cloud env settings):

| Operation              | Why built-in                                                                   | Built-in tool                                        | Custom equivalent (do NOT use on CC web) |
| ---------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------- |
| Create PR              | PR author appears as bot, not user                                             | `mcp__github__create_pull_request`                   | `github_create_pr`                       |
| Mark PR ready          | `ready_for_review` event attributed to bot                                     | `mcp__github__update_pull_request({ draft: false })` | `github_mark_pr_ready`                   |
| Reply to review thread | Comment appears under bot identity, not user                                   | `mcp__github__add_reply_to_pull_request_comment`     | `github_reply_to_review_thread`          |
| Request Copilot review | App tokens silently fail; platform handles auth                                | `mcp__github__request_copilot_review`                | `github_request_review`                  |
| View PR / list reviews | Read-only, but routing through built-in avoids waking the custom server's auth | `mcp__github__pull_request_read`                     | `github_view_pr`, `github_list_reviews`  |

> **On Copilot Coding Agent**: the built-in `mcp__github__*` surface is not available. Use the custom `legacy-sports-github` server for the same operations — it authenticates via the Agent Author GitHub App installation token (provisioned by `.github/copilot-setup-steps.yml`), which is itself a bot identity, so PR/comment authorship is still bot-attributed, not user-attributed. The rule "built-in is authoritative" applies only where built-in is loaded.

**Which operations MUST use the custom MCP server** (built-in lacks required data):

| Operation            | Custom MCP tool (required)                                                                         | Why built-in is insufficient                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fetch review threads | `github_get_review_threads({ number, unresolvedOnly: true })` — returns GraphQL thread `id` values | `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` ⚠️ does **not** return thread node IDs — resolve step will fail |
| Resolve threads      | `github_resolve_threads({ threadIds, prNumber })` (batch + recheck)                                | `mcp__github__resolve_review_thread({ threadId })` — works but one thread at a time, no prNumber recheck; requires node IDs from `github_get_review_threads` |

> **Custom server startup patience**: the `legacy-sports-github` MCP server may take a few seconds to initialize in cloud environments. If a call returns a connection error on first attempt, wait ~10 seconds and retry once before concluding the server is unavailable and falling back to built-in tools.

> **Before every push in cloud/Copilot sessions**: after `make pc`, run the self-review gate from `../pr-lifecycle/references/self-review.md` (or the equivalent inline checklist if slash skills are unavailable). Do not rely on CI or Copilot review to catch issues you can catch locally first.

**Which operations can use either** (no visible authorship / read-only):

| Operation       | Custom MCP tool  | Built-in tool                                   |
| --------------- | ---------------- | ----------------------------------------------- |
| Read PR details | `github_view_pr` | `mcp__github__pull_request_read(method: "get")` |

### Tool mapping (custom → built-in)

| Custom MCP tool                                                                       | Built-in equivalent                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github_create_pr({ title, body, draft })`                                            | `mcp__github__create_pull_request({ owner, repo, title, head, base, body, draft })`                                                                                                   |
| `github_manage_labels({ prs: [N], add, remove })`                                     | No built-in equivalent — **always use custom server**. Shell fallback: `gh pr edit <PR#> --add-label '<label>'` / `--remove-label '<label>'`                                          |
| `github_mark_pr_ready({ number })`                                                    | `mcp__github__update_pull_request({ owner, repo, pullNumber, draft: false })`                                                                                                         |
| `github_view_pr({ number })`                                                          | `mcp__github__pull_request_read({ method: "get", owner, repo, pullNumber })`                                                                                                          |
| `github_get_review_threads({ number })`                                               | `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` ⚠️ built-in does **not** return GraphQL thread node IDs — avoid for review-fix workflows |
| `github_reply_to_review_thread({ threadId, body })` (alias: `github_reply_to_review`) | `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })`                                                                                        |
| `github_resolve_threads({ threadIds, prNumber })`                                     | Loop: `mcp__github__resolve_review_thread({ threadId })` per thread (no prNumber recheck)                                                                                             |
| `github_request_review({ prs: [number], copilot: true })`                             | `mcp__github__request_copilot_review({ owner, repo, pullNumber })`                                                                                                                    |
| `github_list_prs()`                                                                   | `mcp__github__list_pull_requests({ owner, repo, perPage: 5 })` ⚠️ output overflows context easily — see warning below                                                                 |
| `github_list_reviews({ number })`                                                     | `mcp__github__pull_request_read({ method: "get_reviews", owner, repo, pullNumber })`                                                                                                  |

> **`mcp__github__list_pull_requests` overflows context** — even at `perPage: 10` the response can exceed 160K characters because the GitHub MCP server returns the full PR object (body, head/base ref objects, requested reviewers, labels, milestone, \_links) per item. **Never call without an explicit `perPage` cap; default to `perPage: 5` for triage and reduce further (`perPage: 3`) if you need details.** When the PR number is already known, always use `mcp__github__pull_request_read({ method: "get", owner, repo, pullNumber })` instead — it returns a single PR with no list overhead. The custom `github_pr_dashboard` (when available) returns a compact triage view that does not have this problem.

> **Note:** On Copilot Coding Agent, the built-in `mcp__github__*` tools are NOT available — use the custom `legacy-sports-github` MCP server with `GH_TOKEN` from `.github/copilot-setup-steps.yml`.

## GitHub Authentication for PR Creation

The `legacy-sports-github` MCP server calls GitHub REST/GraphQL APIs directly (it does **not** require the `gh` CLI). It resolves a GitHub token in this order: `GH_TOKEN`/`GITHUB_TOKEN` env var, cached token file (expiry-aware), GitHub App installation token (if `AGENT_AUTHOR_APP_PRIVATE_KEY` is set — generates and caches a 1-hour token on demand), `~/.netrc`, `gh auth token` (optional, 5s timeout), then interactive OAuth device flow as a last resort. Claude Code on the web also provides a native GitHub connector that requires no token configuration.

| Platform                   | How to authenticate                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code on the web** | **Preferred**: use Claude's native GitHub connector (no secrets needed). Alternative: set `GH_TOKEN` or `GITHUB_TOKEN` in cloud environment settings (no `gh` CLI installation required) |
| **Copilot Coding Agent**   | Automatically available via `${{ github.token }}`. Authenticated in `.github/copilot-setup-steps.yml`. No native Claude integrations available                                           |
| **Local development**      | Already authenticated via `gh auth login`, `~/.netrc`, or env var — any token source works                                                                                               |

If token resolution fails during the MCP server's startup preflight, it logs a diagnostic warning and defers authentication to the first API call (which may trigger the interactive device flow).

For **interactive sessions** (local, Claude Code on the web), no token setup is needed — the device flow handles first-time auth automatically and caches the token for future sessions.

For **cloud environments** (Claude Code on the web, Copilot), pre-configuring a token is recommended — the device flow may not surface stderr prompts reliably. How the token gets there depends on the platform:

| Platform                   | Token source                            | Config file                | Setup                                                                                                                                                                                               |
| -------------------------- | --------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local development**      | `gh auth login` or device flow          | `.mcp.json`                | No env var needed — fallback chain handles it                                                                                                                                                       |
| **Claude Code on the web** | Agent Author app token (auto-generated) | `.mcp.json`                | Set `AGENT_AUTHOR_APP_PRIVATE_KEY` in env settings. The MCP server generates and caches tokens natively (no setup script step needed).                                                              |
| **Copilot Coding Agent**   | Agent Author app token (auto-generated) | `.github/copilot/mcp.json` | `.github/copilot-setup-steps.yml` generates a 1-hour installation token from the Agent Author GitHub App (ID `3158619`) and exports `GH_TOKEN`/`GITHUB_TOKEN`; this config consumes it via env vars |

**Token options (for `GH_TOKEN` in Claude Code cloud settings):**

| Method                            | Security | Lifetime         | Recommended for               |
| --------------------------------- | -------- | ---------------- | ----------------------------- |
| **Fine-grained PAT**              | Good     | Up to 1 year     | Solo developer cloud use      |
| **GitHub App installation token** | Best     | 1 hour (rotates) | Automated/shared agent setups |

**Required token permissions** (minimum for PR creation):

- **Fine-grained PAT**: Repository access → your repo. Permissions: _Contents_ (read/write), _Pull requests_ (read/write), _Metadata_ (read).
- **Classic PAT** (not recommended): `repo` scope.
- **GitHub App**: _Contents_ + _Pull requests_ read/write permissions on the repository.

> **Separation of duties:** Two GitHub Apps handle agent operations — the **Agent Author** app (ID `3158619`) pushes code and creates PRs, while the **Agent Reviewer** app (ID `3142924`) approves and merges. The same app never both authors and approves code.

> **Note:** The `.mcp.json` and `.vscode/mcp.json` configs forward `GH_TOKEN` from the host environment. The `.github/copilot/mcp.json` forwards both `GH_TOKEN` (from the Agent Author app) and `GITHUB_TOKEN` (auto-provided by GitHub). The MCP server checks `GH_TOKEN` first, then `GITHUB_TOKEN` at runtime.

## Jira Authentication

The `legacy-sports-jira` MCP server is **hosted on AWS** (API Gateway + Lambda). Jira credentials are stored in AWS Secrets Manager on the Lambda side — no Jira credential env vars are needed in the cloud agent environment.

The MCP client calls the API Gateway endpoint (`$MCP_JIRA_URL`) with a short-lived Cognito machine-grant bearer in the `Authorization` header. `copilot-setup-steps.yml` mints that bearer from the `client_credentials` secret (LS-5093, RFC AC-A6); the legacy SigV4/OIDC Function-URL path was retired. The hosted server reads Jira OAuth credentials from Secrets Manager on each invocation.

> **Precondition for Jira access in cloud environments**: use the `legacy-sports-jira` MCP server (or, on Claude Code on the web, the Atlassian plugin — see below). `acli` is a local-only CLI not installed in Copilot Coding Agent or Claude Code on the web containers; a "command not found" from `acli jira workitem view` in a cloud session is the wrong-tool signal, not an inaccessible-Jira signal. Use `jira_auth_status()` to verify connectivity; if it returns `configured: false`, check that `MCP_JIRA_URL` and `MCP_JIRA_BEARER` are set in the copilot environment (the bearer is minted by `copilot-setup-steps.yml`) and that the bearer-minting step succeeded in the bootstrap logs.

On **Claude Code on the web**, Claude's native Atlassian plugin (`mcp__claude_ai_Atlassian__*`) is available without any credential configuration and is the **preferred** option. It connects to `bkrupa.atlassian.net` (cloud ID: `fb294606-6c8f-4b52-9a41-11fe45b77528`) via OAuth 2.1 with `read:jira-work` + `write:jira-work` scopes. The auth-aware routing rule applies: call `jira_auth_status` first — if `configured: false` or API calls fail, use the native plugin tools (pass `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"` to all calls). On **Copilot Coding Agent**, native Claude integrations are not available, so Jira credentials must be configured as repository secrets.

**Jira tool mapping** (native Atlassian plugin equivalents):

| Custom MCP tool               | Native plugin equivalent                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jira_view`                   | **Do not use `getJiraIssue`** — known bug returns wrong data (see AGENTS.md). Use `searchJiraIssuesUsingJql({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", jql: "key = LS-####", maxResults: 1 })` instead.                                                                                                                                                                                                                                                |
| `jira_search`                 | `searchJiraIssuesUsingJql`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `jira_create_ticket`          | `createJiraIssue`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `jira_edit_ticket`            | `editJiraIssue`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `jira_transition`             | `transitionJiraIssue` — **pass transition as an object, not a string**: `transitionJiraIssue({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", issueIdOrKey: "LS-####", transition: { id: "21" } })`. Use `jira_get_transitions({ key: "LS-####" })` (custom MCP server) to look up the numeric ID; if the custom server is unavailable or returns `fetch failed` (see Quirk 1), use the static LS transition ID table in "Discovering transition IDs" below. |
| `jira_transition(key: [...])` | No native bulk equivalent — call `transitionJiraIssue` per key in parallel. Use for batch claim/release (e.g. claim 5 tickets In Progress at once). Supports: "In Progress", "In Review", "Done" — does not support "To Do".                                                                                                                                                                                                                                   |
| `jira_get_comments`           | No direct equivalent — use `searchJiraIssuesUsingJql({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", jql: "key = LS-####", maxResults: 1 })` with the `comment` field (avoids the buggy `getJiraIssue` tool — see AGENTS.md).                                                                                                                                                                                                                               |
| `jira_link_issues`            | No native equivalent — use custom `legacy-sports-jira` MCP only (`acli` is not available in cloud)                                                                                                                                                                                                                                                                                                                                                             |
| `jira_list_children`          | `searchJiraIssuesUsingJql` with `parent = LS-####`                                                                                                                                                                                                                                                                                                                                                                                                             |

## Copilot Coding Agent: Custom MCP Server Setup

Copilot Coding Agent **does** support custom stdio MCP servers via the Settings → Copilot → Cloud agent → MCP configuration UI. This is separate from Claude Code on the web.

### How it works

1. **Environment bootstrap**: `.github/workflows/copilot-setup-steps.yml` runs before every Copilot agent task. It sets up Node/pnpm, installs dependencies, starts Docker PostgreSQL, runs migrations, generates the Agent Author `GH_TOKEN`, **mints the three MCP machine-grant bearers** (`MCP_{JIRA,GITHUB,CI}_BEARER`) from the Cognito `client_credentials` secret, and exports env vars (`GH_TOKEN`, `DATABASE_URL`, `USE_LOCAL_CREDENTIALS`, `MCP_*_URL`, `MCP_*_BEARER`) to `$GITHUB_ENV` so the MCP HTTP transports and stdio subprocesses inherit them.

2. **MCP config**: paste the contents of the `mcpServers` object from `.github/copilot/copilot-cloud-mcp-config.json` into Settings → Copilot → Cloud agent → MCP configuration (JSON editor in the GitHub Settings UI — not a file in the repo). Do not paste the entire file including `_instructions`.

3. **Secrets**: add the following to Settings → Environments → `copilot` → Environment secrets:

   | Secret                      | Purpose                                                                                                      |
   | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
   | `MCP_JIRA_URL`              | API Gateway invoke URL for the hosted Jira MCP server (from SSM `/<name_prefix>/mcp/jira/api-url`)           |
   | `MCP_GITHUB_URL`            | API Gateway invoke URL for the hosted GitHub MCP server                                                      |
   | `MCP_CI_URL`                | API Gateway invoke URL for the hosted CI MCP server                                                          |
   | `MCP_MACHINE_CLIENT_ID`     | Cognito `client_credentials` client id (SSM `/<name_prefix>/mcp/cognito/machine-client-id`)                  |
   | `MCP_MACHINE_CLIENT_SECRET` | Cognito `client_credentials` secret (Secrets Manager `<env>/mcp-machine-client-secret`) — the long-lived key |
   | `MCP_AUTH_COGNITO_DOMAIN`   | Cognito hosted-UI domain (token-endpoint base) used for the `client_credentials` exchange                    |

   Jira credentials (`JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_CLOUD_ID`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) are **no longer required** as environment secrets — they are stored in AWS Secrets Manager on the hosted Lambda and injected server-side.

   > **Not needed as secrets**: `GH_TOKEN` (generated from the Agent Author GitHub App by copilot-setup-steps.yml), `GITHUB_TOKEN` (standard GitHub-provided Actions token), `DATABASE_URL` (exported by copilot-setup-steps.yml), `USE_LOCAL_CREDENTIALS` (also exported automatically), `MCP_{JIRA,GITHUB,CI}_BEARER` (minted per task by copilot-setup-steps.yml from `MCP_MACHINE_CLIENT_SECRET`). **No AWS credentials or OIDC role are used** — the SigV4/OIDC Function-URL path and the `mcp_invoke` policy were retired in LS-5093.

### Available MCP servers in Copilot cloud

| Server                  | Available      | Notes                                                                                                                                                                  |
| ----------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-sports-github`  | ✅             | Hosted on AWS (API Gateway + Lambda); called with a Cognito machine-grant bearer (`MCP_GITHUB_BEARER`) minted by copilot-setup-steps.yml — no GH_TOKEN required in env |
| `legacy-sports-ci`      | ✅             | Hosted on AWS (API Gateway + Lambda); called with a Cognito machine-grant bearer (`MCP_CI_BEARER`)                                                                     |
| `legacy-sports-jira`    | ✅             | Hosted on AWS (API Gateway + Lambda); called with a Cognito machine-grant bearer (`MCP_JIRA_BEARER`); Jira credentials in Secrets Manager — no Jira env vars required  |
| `legacy-sports-nx`      | ✅             | pnpm install run by copilot-setup-steps.yml                                                                                                                            |
| `legacy-sports-make`    | ✅             | Same as above                                                                                                                                                          |
| `legacy-sports-db`      | ✅             | `DATABASE_URL` exported by copilot-setup-steps.yml                                                                                                                     |
| `legacy-sports-browser` | ⚠️ needs setup | Not included by default; to enable: add `npx playwright install chromium` to copilot-setup-steps.yml then add the server entry to the cloud MCP config                 |
| `worktree`              | ✅             | git/run tools work (ping/run/push/stabilize); twig-dependent tools (worktree_rebase, worktree_clean, worktree_remove_batch) excluded from cloud config via allow-list  |
| `legacy-sports-aws`     | ❌             | Full AWS SSO access not available; cloud agents no longer use an AWS role for MCP (bearer auth replaced SigV4) — use `ci_get_logs` for CI log access                   |

> **Auth note**: all three hosted servers are reached over their API Gateway endpoints with a short-lived Cognito machine-grant bearer in the `Authorization` header (minted per task by `copilot-setup-steps.yml` from `MCP_MACHINE_CLIENT_SECRET`; LS-5093 / RFC AC-A6). If a server is unreachable, verify that `MCP_{JIRA,GITHUB,CI}_URL` and `MCP_MACHINE_CLIENT_{ID,SECRET}` + `MCP_AUTH_COGNITO_DOMAIN` are set as copilot environment secrets and that the bearer-minting step succeeded in the bootstrap logs.

### Verifying auth in a Copilot session

After the agent starts, verify MCP servers are connected by calling these status tools:

```
github_auth_status()      # legacy-sports-github (hosted — should report authenticated via Lambda/Secrets Manager)
ci_auth_status()          # legacy-sports-ci (hosted — same)
jira_auth_status()        # legacy-sports-jira (hosted — configured: true means Lambda reachable + Jira creds loaded)
make_ping()               # legacy-sports-make
nx_check_package_health() # legacy-sports-nx (doubles as health check)
db_check_health()         # legacy-sports-db
worktree_ping()           # worktree
```

If `github_auth_status`, `ci_auth_status`, or `jira_auth_status` fail to connect, check that the MCP bearer-minting step succeeded in the bootstrap logs and that `MCP_{JIRA,GITHUB,CI}_URL` and `MCP_MACHINE_CLIENT_{ID,SECRET}` + `MCP_AUTH_COGNITO_DOMAIN` are configured as copilot environment secrets.

## Known cloud-environment quirks

These are environment behaviors that look like bugs but are not — they cost real time on every fresh cloud session that touches Jira. If you hit either symptom below, recognize it immediately and switch strategy without declaring yourself blocked.

### Quirk 1: `legacy-sports-jira` MCP server `fetch failed` (Claude Code on the web only)

> **Copilot Coding Agent**: this quirk no longer applies — the Jira MCP server is hosted on AWS (API Gateway + Lambda) and called with a Cognito machine-grant bearer. The outbound request goes to AWS (not `api.atlassian.com`), which is not blocked by the cloud-session proxy.

**Symptom** (Claude Code on the web only): every call to `mcp__legacy-sports-jira__jira_*` returns one of:

- `{"success": false, "error": "fetch failed"}`
- `Failed to fetch Jira issue ...: fetch failed`

**Misleading signal**: `jira_auth_status` returns `{"configured": true, "authMethod": "oauth"}`, so the auth-status probe will tell you everything is fine. It is not — the credentials are loaded but outbound HTTPS is blocked.

**Root cause**: HTTPS egress to `api.atlassian.com` is blocked at the cloud-session proxy layer. A direct `curl` to the API endpoint returns `curl: (56) CONNECT tunnel failed, response 403`. `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_CLOUD_ID`, and `JIRA_SITE_URL` are all set in the env, but the custom MCP server cannot make the outbound call.

**Workaround** (Claude Code on the web): switch to the Claude Code Atlassian plugin (`mcp__claude_ai_Atlassian__*` / `mcp__82d0c0eb-...__*`) without prompting the user. The plugin routes through Anthropic's plugin infrastructure rather than the local proxy, so it works fine. On Claude Code on the web this is the **expected primary path** — the auth-aware-routing rule in AGENTS.md treats the plugin as primary in cloud sessions, not as a fallback. Pass `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"` to all calls.

> The earlier Jira-auth bullet in AGENTS.md only covers the case where `configured: false`. The `configured: true` + `fetch failed` case is the one that bites you on a fresh Claude Code on the web session — both look identical from a "should I switch tools?" decision point, and the answer is yes.

### Quirk 2: Atlassian plugin `transitionJiraIssue`/`createJiraIssue` reject nested object parameters on cold start

**Affected tools and parameters**:

| Tool                  | Affected parameter  | Notes                                                     |
| --------------------- | ------------------- | --------------------------------------------------------- |
| `transitionJiraIssue` | `transition`        | `additionalProperties: false` — cold-start only, warms up |
| `createJiraIssue`     | `additional_fields` | same encoding bug — use `jira_create_ticket` instead      |

**Symptom**: calls to either tool return:

```
MCP error -32602: Input validation error: ...
  "code": "invalid_type",
  "expected": "object",
  "received": "string",
  "path": ["transition"]
```

(`"path"` is `["additional_fields"]` when the error comes from `createJiraIssue`.)

The call payloads are formed correctly — e.g. `transition: { "id": "21" }` and `additional_fields: { parent: { key: "LS-####" } }` as JSON object literals. The same payload format is accepted by `editJiraIssue`, `createIssueLink`, and `addCommentToJiraIssue` at the same time. After ~30 seconds to ~5 minutes of unrelated tool calls, the identical `transitionJiraIssue` call typically succeeds on retry. The `createJiraIssue.additional_fields` parameter may remain broken for longer and is best avoided entirely (see preferred alternative below).

**Hypothesis**: a plugin schema cold-start where the harness temporarily mis-encodes parameters declared as `additionalProperties: false` objects (stricter than `additionalProperties: {}` variants used by tools that do work). Cannot be reliably reproduced or root-caused from inside the agent session.

**Workaround for `transitionJiraIssue`**: retry once after any other successful plugin call has completed. ~30 seconds of normal activity is usually enough. If that retry still fails: in a **cloud session**, use `jira_transition` from the custom `legacy-sports-jira` MCP server if it responds successfully — Copilot Coding Agent sessions have the server available via the SigV4-signed Lambda Function URL, but Claude Code on the web may see `fetch failed` (Quirk 1) in which case the server is unreachable; if so, perform the transition manually in the Jira UI. In a **local session**, fall through to `acli jira workitem transition --key LS-#### --status "In Progress" --yes`.

**Preferred alternative for `createJiraIssue` with parent** — use `jira_create_ticket` from the custom MCP server; it accepts `parent` as a plain string and calls the Jira REST API directly:

```
jira_create_ticket({ summary: "...", type: "Task", parent: "LS-####", sprint: "current" })
```

If the custom server is unavailable, create the ticket first (without `additional_fields`) then set the parent separately via `editJiraIssue({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", issueIdOrKey: "LS-CHILD", fields: { parent: { key: "LS-PARENT" } } })` — the Atlassian plugin's `editJiraIssue` uses `fields: { additionalProperties: {} }` and is unaffected by the cold-start encoding bug.

**Correct call pattern for `transitionJiraIssue`** (once warm):

1. Get transition IDs for the ticket — prefer `jira_get_transitions` (custom MCP server) if available, since the Atlassian plugin's `getTransitionsForJiraIssue` is known to return full issue data instead of the transitions array (see AGENTS.md). If the custom server is unavailable, look up the target status ID from the Jira UI or the static LS transition table in `.agents/skills/workflow-overview/SKILL.md`:
   `jira_get_transitions({ key: "LS-####" })`
2. Then pass the transition as a JSON object (NOT a string):
   `transitionJiraIssue({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", issueIdOrKey: "LS-####", transition: { id: "21" } })`

**Common mistake** (distinct from the cold-start bug): passing a string like `transition: "In Progress"` or `transition: "{\"id\": \"21\"}"` causes the `"expected object, received string"` error even when the server is warm. The `transition` parameter MUST be a JSON object `{ id: "21" }`, not a string. This error will never resolve with retries — it requires fixing the call format.

### Quirk 3: `ci_get_logs` returns step summaries instead of full log text in cloud sessions

**Symptom**: `ci_get_logs` returns output that begins with:

```
[Log download unavailable: the GitHub Actions log endpoint redirects to
results-receiver.actions.githubusercontent.com which is blocked in this
environment (cloud proxy restriction). Step conclusions shown instead:]
```

followed by a list of step names and `✓`/`✗`/`○` conclusions instead of full log text.

**Root cause**: The GitHub Actions log endpoint (`GET /actions/jobs/{id}/logs`) always returns a 302 redirect to `results-receiver.actions.githubusercontent.com`. The cloud-session proxy blocks CONNECT tunnels to that host with a 403 error. The MCP server falls back to fetching step-level conclusions from `/actions/jobs/{id}` (which does not redirect) so agents still get actionable signal.

**What you can see**: which steps failed (name + conclusion). **What you cannot see**: the actual log lines that explain why.

**Workarounds**:

1. **Open the run in a browser** — `ci_view_run(runId: RUN_ID)` returns `url`; navigate there in your browser to see full logs with GitHub's collapsible UI.
2. **Use `ci_search_logs` pattern search** — the same proxy restriction applies, so this also falls back to step summaries. Not helpful for log text.
3. **From a local session** — `ci_get_logs` works normally outside cloud environments; teleport to local if the exact error text is critical.

> This is a known infrastructure limitation (LS-3040). The step-summary fallback is intentional — it surfaces actionable failure signal (which step broke) even when full log text is unavailable.

### Discovering transition IDs

`transitionJiraIssue` requires a numeric workflow transition ID, and these are **not** stable across projects. Use `jira_get_transitions({ key: "LS-####" })` (custom MCP server) to discover them. **Do not use `getTransitionsForJiraIssue`** — the Atlassian plugin version is known to return full issue data instead of the transitions array. For the LS project specifically, the IDs are stable and listed here:

| Status        | Transition ID |
| ------------- | ------------- |
| `To Do`       | `11`          |
| `In Progress` | `21`          |
| `In Review`   | `2`           |
| `Done`        | `31`          |
| `Won't Do`    | `3`           |

If the IDs above stop working, call `jira_get_transitions({ key: "LS-####" })` (custom MCP server) and update this table.

### Quirk 4: `ci_dispatch_workflow` returns 403 in cloud — AGENT_AUTHOR_APP lacks `actions:write`

**Symptom**: calling `ci_dispatch_workflow({ workflow: "merge-queue.yml", ref: "main" })` returns:

```
Cannot dispatch workflow "merge-queue.yml": the GitHub App token lacks actions:write permission (HTTP 403 from GitHub).
```

(or the raw GitHub response: `Resource not accessible by integration`)

**Root cause**: the AGENT_AUTHOR_APP installation has `contents:write` and `pull_requests:write` but **not** `actions:write`. GitHub's workflow dispatch endpoint (`POST /actions/workflows/{workflow}/dispatches`) requires `actions:write`, so the call always returns HTTP 403 in cloud sessions regardless of auth being correct. This is a permissions gap, not an auth failure.

**Workaround**: do NOT loop-retry or declare yourself blocked. Pick one:

1. **Push an empty commit** to re-enter the merge queue:
   ```
   worktree_commit({ message: "chore: trigger merge queue (LS-####)" })   # allowEmpty flag if needed
   worktree_push()
   ```
   Shell fallback: `git commit --allow-empty -m "chore: trigger merge queue" && git push`
2. **Remove and re-add the merge-queue label** on the PR (if the queue is label-triggered).
3. **Wait for the queue's retry cycle** — if all review threads are resolved, the merge queue retries automatically without any action.

**Waiting for CI**: use the built-in `ScheduleWakeup` tool to sleep for an interval (270s keeps you within the prompt-cache window; 1200s+ for long builds), then call `ci_view_run({ runId: <id> })` to check status — repeat until the run reaches a terminal state. In Claude Code (local/web), CI events are surfaced natively so no manual waiting is needed. For one-shot status snapshots use `ci_list_runs` or `ci_view_run`.

## Jira Pagination (Critical)

The Atlassian plugin's `searchJiraIssuesUsingJql` defaults to `maxResults: 10`. The custom `jira_list_children` defaults to 25. Both will silently truncate results for large epics.

**Rules:**

- **Always set `maxResults: 100`** when listing children or searching tickets via the Atlassian plugin
- **Always set `limit: 100`** when using `jira_list_children`
- **Check for pagination** — the two tools use different pagination mechanisms (see below)
- **Verify counts**: log "Found N total children: X To Do, Y In Progress, Z In Review, W Done" and confirm the sum matches the total

> **Common trap**: an epic with 50 children returns only 10 on the first `searchJiraIssuesUsingJql` call with default parameters. The agent assumes those 10 are ALL children, works them, and prematurely transitions the parent — missing 40 tickets. This caused the LS-2079 incident.

### `jira_list_children` — cursor-based pagination (`nextPageToken`)

The custom MCP tool uses cursor pagination. `total` in the response equals the current page's result count, not the grand total — **do not use `total` to detect truncation**. The reliable signal is `nextPageToken`: if present, pass it back as `pageToken` and fetch the next page. Loop until `nextPageToken` is absent.

```
// Page 1
jira_list_children({ issueKey: "LS-####", limit: 100 })
// → { issues: [...], nextPageToken: "eyJ..." }

// Page 2
jira_list_children({ issueKey: "LS-####", limit: 100, pageToken: "eyJ..." })
// → { issues: [...] }  ← no nextPageToken means last page
```

### `searchJiraIssuesUsingJql` (Atlassian plugin) — offset-based pagination (`startAt`/`maxResults`)

The Atlassian plugin uses classic offset pagination. The response includes a `total` field that reflects the **grand total** across all pages. Fetch additional pages by incrementing `startAt` by `maxResults` until you have collected `total` issues.

```
// Page 1
searchJiraIssuesUsingJql(
  cloudId: "fb294606-...",
  jql: "parent = LS-#### ORDER BY priority DESC, created ASC",
  maxResults: 100,
  startAt: 0
)
// → { total: 150, issues: [...100 items...] }

// Page 2
searchJiraIssuesUsingJql(..., startAt: 100)
// → { total: 150, issues: [...50 items...] }
```

## Available MCP Servers in Cloud

- `legacy-sports-ci` — CI log queries, workflow reruns (hosted on AWS; called over API Gateway with a Cognito machine-grant bearer)
- `legacy-sports-db` — local Docker Postgres queries, migrations, schema generation
- `legacy-sports-jira` — ticket CRUD, transitions, blocker checks (hosted on AWS; called over API Gateway with a Cognito machine-grant bearer; Jira credentials in Secrets Manager — no env vars needed). On Claude Code on the web, Claude's native Atlassian tools (`mcp__claude_ai_Atlassian__*`) are an alternative that requires no secrets
- `legacy-sports-github` — PR and review lifecycle management (hosted on AWS; called over API Gateway with a Cognito machine-grant bearer; GitHub credentials in Secrets Manager — no env vars needed). On Claude Code on the web, Claude's native GitHub connector is an alternative that requires no secrets
- `legacy-sports-nx` — Nx project discovery, affected analysis, and target execution

**Unavailable in cloud (by design):**

- `worktree` — no worktree management needed (worktree server is present but only an allow-listed subset of tools is enabled)
- `legacy-sports-aws` — full AWS access not available; cloud agents use a Cognito machine-grant bearer for MCP, not an AWS role

## Cloud-to-Local Teleport

When a cloud agent hits a task that requires AWS credentials, real database access, Terraform, or other local-only capabilities, it should **not** skip the step or fail silently. Instead, follow the [cloud-teleport skill](../cloud-teleport/SKILL.md) to commit progress, write a structured handoff artifact, and alert the user to continue the session locally. This enables seamless cloud-to-local workflow continuity.
