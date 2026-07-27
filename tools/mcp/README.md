# Legacy Sports MCP Servers

Model Context Protocol (MCP) servers that extend AI coding agents with project-specific tools.

## Cross-Client Discovery

MCP server configuration is maintained in multiple files to support different AI clients:

| File                       | Client(s)                   | Top-level key | Env var syntax |
| -------------------------- | --------------------------- | ------------- | -------------- |
| `.vscode/mcp.json`         | VS Code IDE agents          | `servers`     | `${env:VAR}`   |
| `.github/copilot/mcp.json` | GitHub Copilot (agent mode) | `servers`     | `${VAR}`       |
| `.mcp.json`                | CLI-based agents            | `mcpServers`  | `${VAR}`       |

**Keep all files in sync.** When adding or removing a server, update all config files. The `create` skill (`.agents/skills/create/SKILL.md`) documents the full registration steps.

### Config Differences

VS Code-based agents use a `"type": "stdio"` field per server; CLI-based agents omit it (stdio is the default transport). VS Code env var references use `${env:VAR_NAME}` while other clients use `${VAR_NAME}`.

## Servers

### ci-server

> **Server ID:** `legacy-sports-ci`

GitHub Actions workflow run triage for CI failures and flaky-job diagnosis:

- **ci_list_runs** — List recent workflow runs with branch/workflow/status filters
- **ci_view_run** — Inspect run metadata, conclusions, and jobs
- **ci_get_logs** — Fetch full or failed-only logs for a run or specific job
- **ci_search_logs** — Search logs with context lines to extract concrete evidence
- **ci_rerun** — Rerun failed jobs, a specific job, or an entire run

See `.agents/skills/debugging/SKILL.md` and `.agents/skills/infrastructure/SKILL.md` for the debugging and log-reading workflows this server supports.

### jira-server

> **Server ID:** `legacy-sports-jira`

Wraps Jira operations with guardrails using the Jira REST API (with env var / netrc credential support):

- **jira_create_ticket** — Create tickets via REST API (supports `sprint: "current"`)
- **jira_edit_ticket** — Update ticket fields including sprint assignment
- **jira_delete_ticket** — Close tickets by transitioning to "Won't Do" with a comment
- **jira_transition** — Transition ticket status with validation
- **jira_view** — Structured ticket details (base fields by default; pass `include: ['comments','transitions','blockers','children']` to fetch sub-resources in one call — replaces former `jira_get_comments` and `jira_get_transitions`)
- **jira_check_blockers** — Automates the 3-way dependency check
- **jira_set_parent** — Set parent epic via Jira REST API

#### OAuth 2.0 Setup

The server supports OAuth 2.0 service account authentication (`client_credentials` grant). When creating an OAuth credential in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps):

**Required scopes** (only Jira platform scopes — Jira Software/Agile scopes are NOT needed):

| Scope             | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `read:jira-work`  | Read issues, search via JQL, fetch transitions and comments |
| `write:jira-work` | Create/update/transition issues, add comments, link issues  |

> **Note:** The server intentionally avoids the Jira Agile REST API (`/rest/agile/1.0/...`) because it requires Jira Software scopes (`read:board-scope:jira-software`, `read:sprint:jira-software`, `write:sprint:jira-software`) which are unavailable on the Atlassian Free plan. Sprint discovery uses JQL `openSprints()` and sprint assignment uses the `customfield_10020` field via the platform API instead.

> **Note:** The server does not use the `DELETE /rest/api/3/issue` endpoint because the User role lacks delete permission. The `jira_delete_ticket` tool transitions tickets to "Won't Do" with a comment instead.

See AGENTS.md for Jira auth-aware routing and MCP-first usage patterns.

### db-admin-server

> **Server ID:** `legacy-sports-db-admin` (hosted on AWS Lambda + API Gateway)

Database operations against the dev RDS over HTTPS — no SSM tunnel required:

- **db_query** — Read-only SQL via the SELECT-only `mcp_readonly` role inside a READ ONLY txn
- **db_migration_status** — Applied vs pending diff (client passes local migration filenames)
- **db_migrate** — Apply UNMERGED local migrations (client transpiles `.ts` to CJS, server applies transactionally)

See `tools/mcp/db-admin-server/README.md` and `.agents/skills/database/SKILL.md` for usage.

### worktree-server

> **Server ID:** `worktree`

Git worktree management for parallel ticket work:

- **worktree_list** — List active worktrees with symlink status and branch info
- **worktree_set** — Set the active worktree for subsequent commands
- **worktree_run** — Run a shell command in the active worktree
- **worktree_guard** — Check whether a path is inside the main repo (warns if worktrees are active)
- **worktree_rebase** — Fetch origin and rebase the active worktree branch onto its parent (via `twig rebase`)
- **worktree_stabilize** — Run post-rebase stabilization: `make install`, regenerate schema, and run codegen on affected projects
- **worktree_push** — Push the current branch with `--force-with-lease` (refuses to push `main`)

### aws-server

> **Server ID:** `legacy-sports-aws`

AWS CloudWatch logs and SSO authentication health:

- **aws_logs_tail** — Fetch recent CloudWatch logs for a Lambda function (wraps `aws logs tail`; auto-sets `AWS_PAGER=""` and `PYTHONIOENCODING=utf-8`)
- **aws_sso_status** — Check AWS SSO authentication status via `aws sts get-caller-identity`; returns caller identity or a structured remedy on failure

See `.agents/skills/infrastructure/SKILL.md` for context.

### github-server

> **Server ID:** `legacy-sports-github`

Pull request and review lifecycle management:

- **github_list_prs** — List PRs with filters (state, branch, author, label, search)
- **github_view_pr** — View detailed PR info (title, body, state, checks, reviews, diff stats)
- **github_create_pr** — Create a PR (writes body to temp file to avoid encoding issues)
- **github_request_review** — Request reviewers (fallback — bot reviews are auto-triggered by the `bot:ready-for-review` label)
- **github_get_review_threads** — Fetch review threads via GraphQL (unresolved/resolved, comments with path+line)
- **github_resolve_thread** — Resolve a review thread via GraphQL mutation
- **github_manage_labels** — Add or remove labels (e.g. `bot:ready-for-review`)
- **github_get_repo_info** — Get repo owner, name, default branch, and URL

See `.agents/skills/pr-lifecycle/SKILL.md` for the workflows this server supports.

### nx-server

> **Server ID:** `legacy-sports-nx`

Nx build system intelligence — project discovery, affected analysis, target execution, and dependency graph queries:

- **nx_show_projects** — List Nx projects with optional filters (affected, target, tag)
- **nx_show_project** — Inspect a single project's configuration (targets, tags, deps)
- **nx_affected** — Show which projects are affected by current changes
- **nx_run** — Run an Nx target on a specific project (allowlisted targets only)
- **nx_run_affected** — Run a target on all affected projects (allowlisted targets only)
- **nx_dep_graph** — Query project dependency relationships (dependencies or dependents)

### make-server

> **Server ID:** `legacy-sports-make`

Makefile target execution with whitelisted targets, appropriate timeouts, and worktree-aware operations:

- **make_run** — Run a whitelisted make target (pc, install, build, test, lint-fix, typecheck, codegen, kill-stale, etc.)
- **make_wt_setup** — Set up a worktree (node_modules symlink, .env, hooks) with optional symlink removal and independent install
- **make_worktree_create** — Create a new git worktree for a Jira ticket (branch + worktree directory + parent registration)

### browser-server

> **Server ID:** `legacy-sports-browser`

Agent-driven browser debugging and screenshot capture:

- **browser_dev_start** — Start the Vite dev server in a worktree (port 4300-4399 auto-allocation); waits ≤45s for readiness, then returns `ready: false` for callers to poll `browser_dev_status`
- **browser_dev_stop** — Stop a tracked dev server by port, worktree path, or all
- **browser_dev_status** — List running dev servers and browser state (managed rows include a live `listening` probe)
- **browser_navigate** — Open a URL in headless Chromium with snapshot-prep CSS injection
- **browser_screenshot** — Capture page or element screenshot as PNG (returns inline image)
- **browser_screenshot_upload** — Upload PNG to GitHub draft release for PR body embedding
- **browser_cleanup** — Close browser and kill all tracked dev servers

See `.agents/skills/pr-lifecycle/references/agent-screenshots.md` for the end-to-end screenshot workflow.

### rollbar-server

> **Server ID:** `legacy-sports-rollbar`

Read-only access to Rollbar error tracking data (the read complement to `lib/rollbar` / `lambdas/rollbar-discord`, which write):

- **rollbar_auth_status** — Check whether the read token is configured; call first
- **rollbar_list_items** — List items (deduplicated errors), filterable by status, level, environment, or search query
- **rollbar_get_item** — Fetch one item by internal id or by its per-project counter
- **rollbar_list_occurrences** — List recent occurrences of an item, each with a truncated message summary
- **rollbar_top_active_items** — The "top active items" view with summed recent occurrence counts
- **rollbar_graphql_introspect_type** — Introspect a type's fields on a deployed GraphQL endpoint (`env: "dev"|"prod"`), optionally diffing against a second environment; replaces hand-rolled `curl` introspection during schema-mismatch RCA

Requires `ROLLBAR_READ_ACCESS_TOKEN` (a Rollbar `read`-scope project access token) in `.env.local` for the stdio form. Also available as a **hosted OAuth connector** (`legacy-sports-rollbar`, LS-8142) with the token held server-side — see `.agents/skills/mcp-first/SKILL.md` and `docs/dev-process/mcp-connector-access.md`. See `tools/mcp/rollbar-server/README.md`.

## Cloud vs Local Availability

Some servers depend on infrastructure that is unavailable in the GitHub Copilot cloud agent environment. Use this table when deciding which servers you can call:

> **Note (2026-07-02):** this table describes the Copilot Coding Agent environment. Claude Code sessions (local and web) get the hosted servers as claude.ai OAuth connectors instead — the current environment × tool-surface routing map is homed in `.agents/skills/mcp-first/SKILL.md`.

| Server ID                | Local (Windows dev) | Cloud agent (Copilot) | Notes                                                                                                                                                                        |
| ------------------------ | :-----------------: | :-------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-sports-ci`       |         ✅          |          ✅           | Uses `gh` CLI; authenticated via GitHub token in cloud                                                                                                                       |
| `legacy-sports-db-admin` |         ✅          |          ✅           | Hosted on Lambda + API Gateway; reaches dev RDS over HTTPS via Cognito machine-grant bearer (no SSM tunnel)                                                                  |
| `legacy-sports-jira`     |         ✅          |  ✅ (needs secrets)   | OAuth 2.0: `JIRA_CLIENT_ID` + `JIRA_CLIENT_SECRET` + `JIRA_CLOUD_ID`. Legacy: `JIRA_EMAIL` + `JIRA_API_TOKEN`. Scopes: `read:jira-work`, `write:jira-work`                   |
| `legacy-sports-github`   |         ✅          |          ✅           | Uses `gh` CLI; authenticated via GitHub token in cloud                                                                                                                       |
| `legacy-sports-nx`       |         ✅          |          ✅           | Uses `pnpm exec nx`; available after `pnpm install`                                                                                                                          |
| `worktree`               |         ✅          |   ✅ (with caveats)   | Cloud: git/run tools work (ping/run/push/stabilize); twig-dependent tools (worktree_rebase, worktree_clean, worktree_remove_batch) excluded from cloud config via allow-list |
| `legacy-sports-make`     |         ✅          |          ✅           | Uses `make` CLI; worktree-create/wt-setup are Windows-only                                                                                                                   |
| `legacy-sports-aws`      |         ✅          |          ❌           | No AWS SSO or OIDC credentials in cloud; no CloudWatch access — use GitHub Actions/CI logs via `legacy-sports-ci` (`ci_get_logs`) instead                                    |
| `legacy-sports-browser`  |         ✅          |          ✅           | Requires Playwright browsers installed; cloud needs `npx playwright install chromium` in setup steps                                                                         |
| `legacy-sports-rollbar`  |         ✅          |  ✅ (needs secrets)   | Requires `ROLLBAR_READ_ACCESS_TOKEN` (Rollbar `read`-scope token) in the environment; cloud has it only if the secret is provided                                            |
