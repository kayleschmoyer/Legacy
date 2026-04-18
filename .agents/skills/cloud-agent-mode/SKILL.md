---
name: cloud-agent-mode
description: Running as a cloud coding agent (Claude Code on the web, Copilot Coding Agent). Covers GitHub and Jira auth setup, token configuration tables, Jira tool mapping, and which MCP servers are available vs unavailable in cloud environments. Load when operating in a cloud environment or when troubleshooting auth for cloud agents.
---

# Skill: Cloud Agent Mode

This section applies to **all** cloud agent platforms (Claude Code on the web, Copilot Coding Agent, etc.).

When running as a **cloud coding agent**:

- **No worktrees/twig/acli** — work directly in the repo root. Use `git` for branches, MCP tools for Jira.
- **No AWS access** — DB MCP server uses local Docker PostgreSQL seeded from `resources/dev-seed.dump`.
- **Linux** — `bash` shell, `/` paths. No symlinks or file locks.
- **Native integrations (Claude Code on the web)** — Claude Code provides built-in GitHub and Atlassian connectors that work without configuring secrets. Prefer these over custom MCP servers when available.

**Cloud workflow (MCP-first):**

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
8. **PR**: `github_create_pr({ title: "...", body: "...", draft: true })` → `github_manage_labels({ prs: [<PR#>], add: ["agent-in-progress"] })` → `github_mark_pr_ready({ number: <PR#> })` (apply label while still a draft, before marking ready — see [Review Lifecycle in Cloud](#review-lifecycle-in-cloud))
9. **Jira**: `jira_transition({ key: "LS-####", status: "In Review" })`

10. **Review lifecycle**: monitor PR → fix Copilot comments → self-review changed files → fix code → validate before every push → reply → resolve threads → re-request review (see [Review Lifecycle in Cloud](#review-lifecycle-in-cloud) below)

Shell fallbacks (only if MCP server is unavailable): `make <target>`, `git commit`, `git push`, `gh pr create`.

## Cloud MCP Cheat Sheet

Always use MCP tools instead of raw shell commands. The MCP tools provide structured output, error handling, and are permission-controlled.

| Instead of (Bash)                  | Use (MCP)                                                      |
| ---------------------------------- | -------------------------------------------------------------- |
| `make format`                      | `make_run({ target: "format" })`                               |
| `make pc`                          | `make_run({ target: "pc" })`                                   |
| `make lint-fix`                    | `make_run({ target: "lint-fix" })`                             |
| `make build`                       | `make_run({ target: "build" })`                                |
| `npx nx run proj:target`           | `nx_run({ project: "proj", target: "target" })`                |
| `npx nx affected -t target`        | `nx_run_affected({ target: "target" })`                        |
| `git add . && git commit -m "msg"` | `worktree_commit({ message: "msg" })`                          |
| `git push`                         | `worktree_push()`                                              |
| `git status`                       | `worktree_status()`                                            |
| `git diff`                         | `worktree_diff()`                                              |
| `git log`                          | `worktree_log()`                                               |
| `gh pr create`                     | `github_create_pr({ title: "...", body: "...", draft: true })` |
| `gh pr view`                       | `github_view_pr({ number: N })`                                |

## Review Lifecycle in Cloud

On **Claude Code on the web**, use the built-in `mcp__github__*` tools for authorship-sensitive PR operations (replies, Copilot review requests) — these tools authenticate via the platform's own token, ensuring agent comments appear under a bot identity rather than the user's GitHub username. However, **use the custom `legacy-sports-github` server for reading and resolving review threads** — the built-in `pull_request_read` does not return GraphQL thread node IDs, which are required for thread resolution (see "Which operations MUST use the custom MCP server" below).

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

The built-in `mcp__github__pull_request_read({ method: "get_review_comments" })` returns thread metadata (`isResolved`, `isOutdated`, `isCollapsed`) and the comments inside each thread, **but does not return the GraphQL thread node ID** that `mcp__github__resolve_review_thread` requires. There is currently no way to get thread node IDs through the built-in MCP server alone — `pull_request_read` does not have a `get_review_threads` method, and `includeThreadIds` is silently ignored. Three strategies, in preference order:

1. **Preferred (custom MCP for reads and resolves)**: Use `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })` from the custom `legacy-sports-github` server to fetch threads — it returns the GraphQL `id` per thread. Then pass those IDs to `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })`. This is the only fully-automated path and works with GitHub App installation tokens (`ghs_*`). The `prNumber` parameter triggers a bot-review recheck attempt when all resolutions succeed; if the app token lacks `actions: write` the dispatch is skipped/non-fatal and the tool returns a `recheckNote` in its output (threads are still resolved) — the recheck fires automatically on the next push.
2. **Local fallback (`gh` CLI)**: If `gh` is available (it usually is **not** in cloud agent environments), call:

   ```bash
   gh api graphql -f query='query($owner:String!,$repo:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$after){nodes{id isResolved} pageInfo{hasNextPage endCursor}}}}}' \
     -F owner=<owner> -F repo=<repo> -F number=<PR#>
   ```

   to fetch thread node IDs. If `pageInfo.hasNextPage` is `true`, rerun the same query with `-F after=<endCursor>` and keep paging until `hasNextPage` is `false`, then resolve the collected thread IDs via `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })`. Without paging, this misses threads on PRs with more than 100 reviews.

3. **Reply-only fallback (last resort)**: Only if both the custom MCP server (after the ~10s startup retry above) and `gh` are confirmed unavailable. Use `mcp__github__pull_request_read({ method: "get_review_comments" })` to inspect the unresolved threads, extract the numeric `commentId` for the top-level comment in each thread, and reply to that comment via `mcp__github__add_reply_to_pull_request_comment({ commentId, body: "addressed in <sha>" })` (the built-in tool replies to a specific review **comment**, not a thread). Then **surface the blocker to the user** with a message like:

   > "I've replied to all Copilot review threads on PR #2259 with the fix SHA, but neither the custom `legacy-sports-github` server nor `gh` is available to resolve thread IDs. The merge queue will block on `1+ unresolved review comment thread(s)` until the threads are resolved manually. Either click Resolve in the GitHub UI, or wait for the sweep agent to pick it up."

   Do not silently leave the PR in a stuck state; the user needs to know whether to wait or intervene.

**Which operations MUST use built-in tools** (authorship is visible to users):

| Operation              | Why built-in                                    | Built-in tool                                    |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Reply to review thread | Comment appears under bot identity, not user    | `mcp__github__add_reply_to_pull_request_comment` |
| Request Copilot review | App tokens silently fail; platform handles auth | `mcp__github__request_copilot_review`            |

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

| Custom MCP tool                                           | Built-in equivalent                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github_create_pr({ title, body, draft })`                | `mcp__github__create_pull_request({ owner, repo, title, head, base, body, draft })`                                                                                                   |
| `github_mark_pr_ready({ number })`                        | `mcp__github__update_pull_request({ owner, repo, pullNumber, draft: false })`                                                                                                         |
| `github_view_pr({ number })`                              | `mcp__github__pull_request_read({ method: "get", owner, repo, pullNumber })`                                                                                                          |
| `github_get_review_threads({ number })`                   | `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` ⚠️ built-in does **not** return GraphQL thread node IDs — avoid for review-fix workflows |
| `github_reply_to_review({ threadId, body })`              | `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })`                                                                                        |
| `github_resolve_threads({ threadIds, prNumber })`         | Loop: `mcp__github__resolve_review_thread({ threadId })` per thread (no prNumber recheck)                                                                                             |
| `github_request_review({ prs: [number], copilot: true })` | `mcp__github__request_copilot_review({ owner, repo, pullNumber })`                                                                                                                    |
| `github_list_prs()`                                       | `mcp__github__list_pull_requests({ owner, repo })`                                                                                                                                    |
| `github_list_reviews({ number })`                         | `mcp__github__pull_request_read({ method: "get_reviews", owner, repo, pullNumber })`                                                                                                  |

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

The `legacy-sports-jira` MCP server supports two authentication methods (resolved in order):

1. **OAuth 2.0 service account** (preferred): `JIRA_CLIENT_ID` + `JIRA_CLIENT_SECRET` + `JIRA_CLOUD_ID` env vars. Optionally set `JIRA_SITE_URL` (defaults to `https://bkrupa.atlassian.net`). Uses `client_credentials` grant with token caching (~60 min). Required OAuth scopes: `read:jira-work`, `write:jira-work` (Jira platform only — Jira Software/Agile scopes are not needed). See `tools/mcp/README.md` for details.
2. **Basic Auth** (legacy): `JIRA_EMAIL` + `JIRA_API_TOKEN` env vars or `~/.netrc` entry.

> **⛔ `acli` is NOT available in cloud environments.** Never use `acli jira workitem view`, `acli jira workitem transition`, or any other `acli` command as a Jira fallback. `acli` is a local-only CLI that is not installed in Copilot Coding Agent or Claude Code on the web containers. "command not found" from `acli` means the CLI is absent — it does NOT mean Jira is inaccessible. Always use `jira_auth_status()` to verify that Jira credentials are loaded; if it returns `configured: false`, check the secrets table below, not `acli`. Note: `configured: true` only confirms credentials are present — calls can still fail if HTTPS egress to `api.atlassian.com` is blocked by the cloud proxy. If `jira_auth_status` returns `configured: true` but a follow-up `jira_view` call fails with `fetch failed`, see the [Known cloud-environment quirks](#known-cloud-environment-quirks) section.

On **Claude Code on the web**, Claude's native Atlassian plugin (`mcp__claude_ai_Atlassian__*`) is available without any credential configuration and is the **preferred** option. It connects to `bkrupa.atlassian.net` (cloud ID: `fb294606-6c8f-4b52-9a41-11fe45b77528`) via OAuth 2.1 with `read:jira-work` + `write:jira-work` scopes. The auth-aware routing rule applies: call `jira_auth_status` first — if `configured: false` or API calls fail, use the native plugin tools (pass `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"` to all calls). On **Copilot Coding Agent**, native Claude integrations are not available, so Jira credentials must be configured as repository secrets.

**Jira tool mapping** (native Atlassian plugin equivalents):

| Custom MCP tool               | Native plugin equivalent                                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jira_view`                   | `getJiraIssue`                                                                                                                                                                                                                                                        |
| `jira_search`                 | `searchJiraIssuesUsingJql`                                                                                                                                                                                                                                            |
| `jira_create_ticket`          | `createJiraIssue`                                                                                                                                                                                                                                                     |
| `jira_edit_ticket`            | `editJiraIssue`                                                                                                                                                                                                                                                       |
| `jira_transition`             | `transitionJiraIssue` — **pass transition as an object, not a string**: `transitionJiraIssue({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", issueIdOrKey: "LS-####", transition: { id: "21" } })`. Call `getTransitionsForJiraIssue` first to get the numeric ID. |
| `jira_transition(key: [...])` | No native bulk equivalent — call `transitionJiraIssue` per key in parallel. Use for batch claim/release (e.g. claim 5 tickets In Progress at once). Supports: "In Progress", "In Review", "Done" — does not support "To Do".                                          |
| `jira_get_comments`           | No direct equivalent — use `getJiraIssue` with `comment` field                                                                                                                                                                                                        |
| `jira_link_issues`            | No native equivalent — use custom `legacy-sports-jira` MCP only (`acli` is not available in cloud)                                                                                                                                                                    |
| `jira_list_children`          | `searchJiraIssuesUsingJql` with `parent = LS-####`                                                                                                                                                                                                                    |

## Copilot Coding Agent: Custom MCP Server Setup

Copilot Coding Agent **does** support custom stdio MCP servers via the Settings → Copilot → Cloud agent → MCP configuration UI. This is separate from Claude Code on the web.

### How it works

1. **Environment bootstrap**: `.github/copilot-setup-steps.yml` runs before every Copilot agent task. It sets up Node/pnpm, installs dependencies, starts Docker PostgreSQL, seeds the DB, and exports env vars (`GH_TOKEN`, `DATABASE_URL`, `USE_LOCAL_CREDENTIALS`, and optionally Jira credentials) to `$GITHUB_ENV` so MCP server subprocesses inherit them.

2. **MCP config**: paste the contents of the `mcpServers` object from `.github/copilot/copilot-cloud-mcp-config.json` into Settings → Copilot → Cloud agent → MCP configuration (JSON editor in the GitHub Settings UI — not a file in the repo). Do not paste the entire file including `_instructions`.

3. **Secrets**: add the following to Settings → Environments → `copilot` → Environment secrets:

   | Secret               | When required                                      | Purpose                      |
   | -------------------- | -------------------------------------------------- | ---------------------------- |
   | `JIRA_CLIENT_ID`     | OAuth 2.0 (preferred; all three together)          | Jira OAuth 2.0 client ID     |
   | `JIRA_CLIENT_SECRET` | OAuth 2.0 (preferred; all three together)          | Jira OAuth 2.0 client secret |
   | `JIRA_CLOUD_ID`      | OAuth 2.0 (preferred; all three together)          | Jira cloud ID                |
   | `JIRA_SITE_URL`      | Never (defaults to `https://bkrupa.atlassian.net`) | Override Jira site URL       |
   | `JIRA_EMAIL`         | Basic Auth only (fallback when OAuth absent)       | Jira account email           |
   | `JIRA_API_TOKEN`     | Basic Auth only (fallback when OAuth absent)       | Jira API token               |

   > **Not needed as secrets**: `GH_TOKEN` (generated from the Agent Author GitHub App by copilot-setup-steps.yml), `GITHUB_TOKEN` (standard GitHub-provided Actions token), `DATABASE_URL` (exported by copilot-setup-steps.yml), `USE_LOCAL_CREDENTIALS` (also exported automatically).

### Available MCP servers in Copilot cloud

| Server                  | Available          | Notes                                                                                                                                                                 |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-sports-github`  | ✅                 | `GH_TOKEN` set by copilot-setup-steps.yml                                                                                                                             |
| `legacy-sports-ci`      | ✅                 | `GH_TOKEN` set by copilot-setup-steps.yml                                                                                                                             |
| `legacy-sports-jira`    | ✅ (needs secrets) | OAuth: `JIRA_CLIENT_ID` + `JIRA_CLIENT_SECRET` + `JIRA_CLOUD_ID`; Basic Auth fallback: `JIRA_EMAIL` + `JIRA_API_TOKEN`                                                |
| `legacy-sports-nx`      | ✅                 | pnpm install run by copilot-setup-steps.yml                                                                                                                           |
| `legacy-sports-make`    | ✅                 | Same as above                                                                                                                                                         |
| `legacy-sports-db`      | ✅                 | `DATABASE_URL` exported by copilot-setup-steps.yml                                                                                                                    |
| `legacy-sports-browser` | ⚠️ needs setup     | Not included by default; to enable: add `npx playwright install chromium` to copilot-setup-steps.yml then add the server entry to the cloud MCP config                |
| `worktree`              | ✅                 | git/run tools work (ping/run/push/stabilize); twig-dependent tools (worktree_rebase, worktree_clean, worktree_remove_batch) excluded from cloud config via allow-list |
| `legacy-sports-aws`     | ❌                 | No AWS SSO or OIDC credentials in cloud; use `ci_get_logs` instead                                                                                                    |

> **Jira note**: egress to `api.atlassian.com` _may_ be blocked at the cloud-session proxy layer (see [Known cloud-environment quirks](#known-cloud-environment-quirks) below). If `jira_auth_status` reports `configured: true` but all `jira_*` calls return `fetch failed`, the proxy is blocking outbound HTTPS. On Claude Code on the web, fall back to the native Atlassian plugin. On Copilot Coding Agent, there is no plugin fallback — raise with the repo admin to unblock the proxy or use Jira REST API via `make_run` shell commands.

### Verifying auth in a Copilot session

After the agent starts, verify MCP servers are connected by calling these status tools:

```
github_auth_status()      # legacy-sports-github
ci_auth_status()          # legacy-sports-ci
jira_auth_status()        # legacy-sports-jira (configured: true means creds loaded, not necessarily reachable)
make_ping()               # legacy-sports-make
nx_check_package_health() # legacy-sports-nx (doubles as health check)
db_check_health()         # legacy-sports-db
worktree_ping()           # worktree
```

## Known cloud-environment quirks

These are environment behaviors that look like bugs but are not — they cost real time on every fresh cloud session that touches Jira. If you hit either symptom below, recognize it immediately and switch strategy without declaring yourself blocked.

### Quirk 1: `legacy-sports-jira` MCP server cannot reach Atlassian from cloud sessions

**Symptom**: every call to `mcp__legacy-sports-jira__jira_*` returns one of:

- `{"success": false, "error": "fetch failed"}`
- `Failed to fetch Jira issue ...: fetch failed`

**Misleading signal**: `jira_auth_status` returns `{"configured": true, "authMethod": "oauth"}`, so the auth-status probe will tell you everything is fine. It is not — the credentials are loaded but outbound HTTPS is blocked.

**Root cause**: HTTPS egress to `api.atlassian.com` is blocked at the cloud-session proxy layer. A direct `curl` to the API endpoint returns `curl: (56) CONNECT tunnel failed, response 403`. `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_CLOUD_ID`, and `JIRA_SITE_URL` are all set in the env, but the custom MCP server cannot make the outbound call.

**Workaround**: switch to the Claude Code Atlassian plugin (`mcp__claude_ai_Atlassian__*` / `mcp__82d0c0eb-...__*`) without prompting the user. The plugin routes through Anthropic's plugin infrastructure rather than the local proxy, so it works fine. On Claude Code on the web this is the **expected primary path** — the auth-aware-routing rule in AGENTS.md treats the plugin as primary in cloud sessions, not as a fallback. Pass `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"` to all calls.

> The earlier Jira-auth bullet in AGENTS.md only covers the case where `configured: false`. The `configured: true` + `fetch failed` case is the one that bites you on a fresh cloud session — both look identical from a "should I switch tools?" decision point, and the answer is yes.

### Quirk 2: Atlassian plugin `transitionJiraIssue` rejects its `transition` parameter on cold start

**Symptom**: the first 3-4 calls to `mcp__82d0c0eb-...__transitionJiraIssue` (or `mcp__claude_ai_Atlassian__transitionJiraIssue`) return:

```
MCP error -32602: Input validation error: ...
  "code": "invalid_type",
  "expected": "object",
  "received": "string",
  "path": ["transition"]
```

The call payload is formed correctly (e.g. `{"id": "21"}` as a JSON object literal). The same payload format is accepted by `editJiraIssue`, `createIssueLink`, and `addCommentToJiraIssue` at the same time. After ~5 minutes of unrelated tool calls (Read, Glob, `createJiraIssue`, etc.), the identical `transitionJiraIssue` call succeeds on retry. The same warm-start behavior reproduces when transitioning a ticket back at the end of a session.

**Hypothesis**: a plugin schema cold-start where the wrapper temporarily mis-encodes the strictest object parameter (`transition` has `additionalProperties: false`, unlike `editJiraIssue.fields` which has `additionalProperties: {}`). Cannot be reliably reproduced or root-caused from inside the agent session.

**Workaround**: retry the same call after any other successful plugin call has completed. ~30 seconds of normal activity is usually enough. **Do not re-architect around the failure** — it warms up on its own.

**Correct call pattern** (once warm):

1. Get transition IDs for the ticket:
   `getTransitionsForJiraIssue({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", issueIdOrKey: "LS-####" })`
2. Then pass the transition as a JSON object (NOT a string):
   `transitionJiraIssue({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", issueIdOrKey: "LS-####", transition: { id: "21" } })`

**Common mistake**: passing a string like `transition: "In Progress"` or `transition: "{\"id\": \"21\"}"`
causes the `"expected object, received string"` error even when the server is warm.
The `transition` parameter MUST be a JSON object `{ id: "21" }`, not a string.

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

`transitionJiraIssue` requires a numeric workflow transition ID, and these are **not** stable across projects. `getTransitionsForJiraIssue` is the right way to discover them for any given ticket. For the LS project specifically:

| Status        | Transition ID |
| ------------- | ------------- |
| `To Do`       | `11`          |
| `In Progress` | `21`          |
| `In Review`   | `2`           |
| `Done`        | `31`          |
| `Won't Do`    | `3`           |

If the IDs above stop working, call `getTransitionsForJiraIssue({ issueIdOrKey: "LS-####" })` and update this table.

### Quirk 3: `ci_dispatch_workflow` returns 403 in cloud — AGENT_AUTHOR_APP lacks `actions:write`

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

**`ci_wait_for_run` does not exist**: the acceptance criteria in LS-3065 mentions `ci_wait_for_run`, but this tool was never implemented. CI run status is surfaced natively by Claude Code — no polling tool is needed. Use `ci_list_runs` or `ci_view_run` for one-shot status snapshots if you need them explicitly.

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

- `legacy-sports-ci` — CI log queries, workflow reruns
- `legacy-sports-db` — local Docker Postgres queries, migrations, schema generation
- `legacy-sports-jira` — ticket CRUD, transitions, blocker checks (requires Jira API credentials via env vars or `.netrc`). On Claude Code on the web, Claude's native Atlassian tools (`mcp__claude_ai_Atlassian__*`) are an alternative that requires no secrets
- `legacy-sports-github` — PR and review lifecycle management (requires a GitHub token via `GH_TOKEN`, `GITHUB_TOKEN`, `.netrc`, `gh auth token`, or device flow — see table above). On Claude Code on the web, Claude's native GitHub connector is an alternative that requires no secrets
- `legacy-sports-nx` — Nx project discovery, affected analysis, and target execution

**Unavailable in cloud (by design):**

- `worktree` — no worktree management needed
- `legacy-sports-aws` — no AWS credentials

## Cloud-to-Local Teleport

When a cloud agent hits a task that requires AWS credentials, real database access, Terraform, or other local-only capabilities, it should **not** skip the step or fail silently. Instead, follow the [cloud-teleport skill](../cloud-teleport/SKILL.md) to commit progress, write a structured handoff artifact, and alert the user to continue the session locally. This enables seamless cloud-to-local workflow continuity.
