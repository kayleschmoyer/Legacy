# Step 0 — Session Initialization

> Loaded from [work-ticket SKILL](../SKILL.md).

## Step 0: Session initialization

### 0a: Register the active worktree (FIRST — before any worktree MCP tool)

If the session was launched via the launcher's `worktree` checkbox (CWD is `.claude/worktrees/<name>/`), call `worktree_set` immediately:

```
worktree_set(key: "<absolute .claude/worktrees/... path>")
```

The worktree MCP server tracks an "active" worktree independently of the session CWD. Without this call it defaults to whatever worktree was active in a previous session, causing `worktree_rename_session`, `worktree_commit`, `worktree_run`, and all other worktree MCP tools to silently target the wrong tree (a past-incident root cause — see the "Agent committed/ran against the WRONG worktree" row in `.agents/skills/failure-archaeology/references/incident-index.md` if you want the ticket history; it has no bearing on the ticket you're working now). Use `pwd` or the `WORKTREE_PATH` env var to get the absolute path.

Skip this sub-step only if no worktree MCP tools will be used in this session (rare — `worktree_rename_session` in Step 1 already requires it).

**If `worktree_set` (or any `worktree_*`/`nx_*`/`make_*` tool) is unexpectedly absent** — `ToolSearch` returns "No matching deferred tools found" for an exact-name query — do not silently fall through to Bash/`git`/`make`/`npx nx` for the rest of the session. This is a recurring, documented failure mode in local Windows launcher-worktree sessions specifically (not only degraded cloud sessions), tracked under LS-8774/LS-9743. Run the [diagnostics checklist](../../mcp-first/references/diagnostics.md) first — it already covers this exact symptom (Check 1: `node_modules/.bin/tsx`) with recovery steps — and report the diagnosis before deciding a shell fallback is appropriate for the immediate operation.

### 0b: Verify Jira auth

```
jira_auth_status()
```

**If `jira_auth_status` returns a connection error** (the MCP server itself didn't start), wait ~10 seconds and retry once — the `legacy-sports-jira` server sometimes needs a moment to initialize. If it still fails, this is an MCP startup issue, not a credential issue; see the node_modules symlink note in AGENTS.md.

**If `jira_auth_status` doesn't exist at all** — **first rule out a name-form miss (LS-10136):** `select:` may not resolve bare names in some harnesses (CCR did not), so an empty `ToolSearch("select:jira_auth_status")` alone proves nothing. Retry with the fully-qualified name (`select:mcp__legacy-sports-jira__jira_auth_status`), then a keyword query (`ToolSearch("jira auth status")`), and read the deferred-tools listing in your context — see [name forms](../../mcp-first/references/tool-surfaces.md#toolsearch-name-forms-ls-10136). Only if all of those are empty (no error) — distinct from the connection-error case above — does this mean the `legacy-sports-jira` connector never registered for this session (observed in CCR sessions, LS-9576; the identical symptom recurs in local worktree-launcher sessions too — LS-9749). Retry the `ToolSearch` once after a few seconds first. If it's still absent, this evaluates as `configured: false` below, and the same applies to `legacy-sports-github`'s tools for the rest of this workflow — see the [CCR substitution table](../../mcp-first/references/auth-and-routing.md#jira-github-hosted-servers-absent-in-ccr-ls-9576) (also linked from the [local-session variant](../../mcp-first/references/auth-and-routing.md#jira-github-hosted-servers-absent-in-a-local-worktree-session-ls-9749)) for the per-tool fallback and which guardrails you need to compensate for by hand. **Do not trust `auth_check_all` alone to rule this out** — its presence-only check can report `ok: true` from local credentials even when the connector never registered; pass `sessionToolNames` (your session's own tool-name list) to get an explicit `rosterAbsent` flag instead (LS-9749).

> **This absence-at-Step-0b check is not final for the session (LS-9370).** In local launcher-worktree sessions the hosted `legacy-sports-jira`/`legacy-sports-github` connectors routinely attach later in the same session — sometimes under a UUID-prefixed tool alias rather than their configured names — after Step 0b already committed to a REST/`acli`/`gh` fallback. Do not run the whole claim → transition → comment → PR lifecycle on that fallback by default: before each subsequent Jira/GitHub-touching step, re-run `ToolSearch` on the bare tool name you need next (e.g. `select:jira_transition`, `select:github_open_pr`), falling back to the qualified/keyword forms if bare is empty ([name forms](../../mcp-first/references/tool-surfaces.md#toolsearch-name-forms-ls-10136)), and switch to it if found. Full protocol: [mcp-first — hosted connector late-attach](../../mcp-first/references/tool-surfaces.md#hosted-connector-late-attach-ls-9370).

**If `configured: false`**, stop immediately. The error message depends on your environment:

- **Copilot Coding Agent**: "Jira credentials are missing. Add `JIRA_EMAIL` + `JIRA_API_TOKEN` (Basic Auth) or `JIRA_CLIENT_ID` + `JIRA_CLIENT_SECRET` + `JIRA_CLOUD_ID` (OAuth 2.0) to Settings → Environments → `copilot` → Environment secrets, then re-run the task."
- **Claude Code on the web**: "Jira auth is not configured. Either set credentials in your cloud environment settings, or I can fall back to the native Atlassian plugin — just say so."
- **Local session**: "Jira auth is not configured. Check your `.netrc` or set `JIRA_EMAIL`/`JIRA_API_TOKEN` env vars."

> **Precondition for Jira access**: use the `legacy-sports-jira` MCP server (or the Atlassian plugin in cloud sessions). `acli` is local-only and not installed in cloud environments — a "command not found" from `acli jira workitem view LS-####` in a cloud session indicates the wrong tool, not an inaccessible Jira. Reserve `acli` for local sessions where both the MCP server and the Atlassian plugin are confirmed unavailable. Note: `configured: true` from `jira_auth_status` confirms credentials are loaded but not reachability — in cloud sessions HTTPS egress to `api.atlassian.com` may be proxy-blocked. If `jira_auth_status` returns `configured: true` but `jira_view` fails with `fetch failed`, see the proxy quirk in `.agents/skills/cloud-agent-mode/SKILL.md`. In worktree sessions where only the Atlassian plugin is available, **never call `mcp__*__getJiraIssue`** — it returns the parent epic's children instead of the requested issue (LS-3715); use `searchJiraIssuesUsingJql(jql: "key = LS-XXXX", maxResults: 1)` instead.

Do not proceed until auth is confirmed working or the user explicitly opts in to a plugin fallback.
