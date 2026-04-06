---
name: cloud-agent-mode
description: Running as a cloud coding agent (Claude Code on the web, Copilot Coding Agent). Covers GitHub and Jira auth setup, token configuration tables, Jira tool mapping, and which MCP servers are available vs unavailable in cloud environments. Load when operating in a cloud environment or when troubleshooting auth for cloud agents.
---

# Skill: Cloud Agent Mode

This section applies to **all** cloud agent platforms (Claude Code on the web, Copilot Coding Agent, etc.).

When running as a **cloud coding agent**:

- **No worktrees/twig/acli** — work directly in the repo root. Use `git` for branches, MCP tools for Jira.
- **No AWS access** — DB MCP server uses local Docker PostgreSQL seeded from `resources/dev-seed.dump`.
- **Linux** — `bash` shell, `/` paths. No junctions or file locks.
- **Native integrations (Claude Code on the web)** — Claude Code provides built-in GitHub and Atlassian connectors that work without configuring secrets. Prefer these over custom MCP servers when available.

**Cloud workflow:** Jira (`jira_create_ticket` → `jira_check_blockers` → `jira_transition` "In Progress") → code → `make_run <target>` (preferred; shell fallback: `make <target>` if MCP server is unavailable) → `db_migration_status` → `db_migrate` → `make pc` → commit + push → `github_create_pr(draft: true)` → `github_mark_pr_ready` → Jira "In Review"

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

On **Claude Code on the web**, Claude's native Atlassian plugin (`mcp__claude_ai_Atlassian__*`) is available without any credential configuration and is the **preferred** option. It connects to `bkrupa.atlassian.net` (cloud ID: `fb294606-6c8f-4b52-9a41-11fe45b77528`) via OAuth 2.1 with `read:jira-work` + `write:jira-work` scopes. The auth-aware routing rule applies: call `jira_auth_status` first — if `configured: false` or API calls fail, use the native plugin tools (pass `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"` to all calls). On **Copilot Coding Agent**, native Claude integrations are not available, so Jira credentials must be configured as repository secrets.

**Jira tool mapping** (native Atlassian plugin equivalents):

| Custom MCP tool        | Native plugin equivalent                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jira_view`            | `getJiraIssue`                                                                                                                                                                                                              |
| `jira_search`          | `searchJiraIssuesUsingJql`                                                                                                                                                                                                  |
| `jira_create_ticket`   | `createJiraIssue`                                                                                                                                                                                                           |
| `jira_edit_ticket`     | `editJiraIssue`                                                                                                                                                                                                             |
| `jira_transition`      | `transitionJiraIssue` (call `getTransitionsForJiraIssue` first)                                                                                                                                                             |
| `jira_bulk_transition` | No native bulk equivalent — call `transitionJiraIssue` per key in parallel. Use for batch claim/release (e.g. claim 5 tickets In Progress at once). Supports: "In Progress", "In Review", "Done" — does not support "To Do" |
| `jira_get_comments`    | No direct equivalent — use `getJiraIssue` with `comment` field                                                                                                                                                              |
| `jira_link_issues`     | No native equivalent (use custom `legacy-sports-jira` MCP or `acli`)                                                                                                                                                        |
| `jira_list_children`   | `searchJiraIssuesUsingJql` with `parent = LS-####`                                                                                                                                                                          |

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
