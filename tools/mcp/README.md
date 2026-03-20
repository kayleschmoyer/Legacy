# Legacy Sports MCP Servers

Model Context Protocol (MCP) servers that extend AI coding agents with project-specific tools.

## Cross-Client Discovery

MCP server configuration is maintained in multiple files to support different AI clients:

| File                       | Client(s)                         | Top-level key | Env var syntax |
| -------------------------- | --------------------------------- | ------------- | -------------- |
| `.vscode/mcp.json`         | VS Code Copilot, Cursor, Windsurf | `servers`     | `${env:VAR}`   |
| `.github/copilot/mcp.json` | GitHub Copilot (agent mode)       | `servers`     | `${VAR}`       |
| `.mcp.json`                | Claude Code CLI                   | `mcpServers`  | `${VAR}`       |

**Keep all files in sync.** When adding or removing a server, update all config files. The `create-mcp-server` skill (`.agents/skills/create-mcp-server/SKILL.md`) documents the full registration steps.

### Config Differences

VS Code and GitHub Copilot (agent mode) use a `"type": "stdio"` field per server; Claude Code omits it (stdio is the default transport). VS Code env var references use `${env:VAR_NAME}` while the other clients use `${VAR_NAME}`.

## Servers

### ci-server

> **Server ID:** `legacy-sports-ci`

GitHub Actions workflow run triage for CI failures and flaky-job diagnosis:

- **ci_list_runs** — List recent workflow runs with branch/workflow/status filters
- **ci_view_run** — Inspect run metadata, conclusions, and jobs
- **ci_get_logs** — Fetch full or failed-only logs for a run or specific job
- **ci_search_logs** — Search logs with context lines to extract concrete evidence
- **ci_rerun** — Rerun failed jobs, a specific job, or an entire run

See `.github/skills/debug-ci-failure/SKILL.md` and `.github/skills/github-actions-logs/SKILL.md` for the debugging workflow this server supports.

### jira-server

> **Server ID:** `legacy-sports-jira`

Wraps Jira operations with guardrails using the Jira REST API (with env var / netrc credential support):

- **jira_create_ticket** — Create tickets via REST API
- **jira_transition** — Transition ticket status with validation
- **jira_view** — Structured ticket details (summary, status, type, priority, description, assignee, reporter, labels, timestamps, blockers)
- **jira_check_blockers** — Automates the 3-way dependency check
- **jira_set_parent** — Set parent epic via Jira REST API
- **jira_get_comments** — Fetch all comments on a ticket with author and plain-text body

See `.agents/skills/mcp-jira/SKILL.md` for usage.

### db-server

> **Server ID:** `legacy-sports-db`

Database operations with built-in safety guardrails:

- **db_migration_status** — Check pending database migration status
- **db_migrate** — Apply pending database migrations
- **db_query** — Execute ad-hoc SQL queries (read-only by default)
- **db_print_schema** — Regenerate `schema.graphql` from Pothos schema
- **db_check_health** — Pre-flight health check (Docker, Postgres, migrations)
- **db_codegen** — Run GraphQL codegen via Nx affected (optional print-schema first)
- **db_restore_dev_seed** — Restore `resources/dev-seed.dump` into local DB (destructive, explicit confirmation required)

See `.agents/skills/mcp-db/SKILL.md` for usage.

### worktree-server

> **Server ID:** `worktree`

Git worktree management for parallel ticket work:

- **worktree_list** — List active worktrees with junction status and branch info
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

See `.github/skills/cloudwatch-logs/SKILL.md` and `.github/skills/aws-sso-login/SKILL.md` for context.

### github-server

> **Server ID:** `legacy-sports-github`

Pull request and review lifecycle management:

- **github_list_prs** — List PRs with filters (state, branch, author, label, search)
- **github_view_pr** — View detailed PR info (title, body, state, checks, reviews, diff stats)
- **github_create_pr** — Create a PR (writes body to temp file to avoid encoding issues)
- **github_request_review** — Request reviewers (fallback — Copilot reviews are auto-requested by workflow on PR open/update)
- **github_get_review_threads** — Fetch review threads via GraphQL (unresolved/resolved, comments with path+line)
- **github_resolve_thread** — Resolve a review thread via GraphQL mutation
- **github_manage_labels** — Add or remove labels (e.g. `merge-when-ready`)
- **github_get_repo_info** — Get repo owner, name, default branch, and URL

See `.agents/skills/create-pr/SKILL.md` and `.agents/skills/fix-copilot-reviews/SKILL.md` for the workflows this server supports.

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
- **make_wt_setup** — Set up a worktree (node_modules junction, .env, hooks) with optional junction removal and independent install
- **make_worktree_create** — Create a new git worktree for a Jira ticket (branch + worktree directory + parent registration)

## Cloud vs Local Availability

Some servers depend on infrastructure that is unavailable in the GitHub Copilot cloud agent environment. Use this table when deciding which servers you can call:

| Server ID              | Local (Windows dev) | Cloud agent (Copilot) | Notes                                                                                                                                     |
| ---------------------- | :-----------------: | :-------------------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-sports-ci`     |         ✅          |          ✅           | Uses `gh` CLI; authenticated via GitHub token in cloud                                                                                    |
| `legacy-sports-db`     |         ✅          |          ✅           | Cloud uses local Docker PostgreSQL seeded from `resources/dev-seed.dump`                                                                  |
| `legacy-sports-jira`   |         ✅          |  ✅ (needs secrets)   | Requires `JIRA_EMAIL` + `JIRA_API_TOKEN` env vars / GitHub secrets                                                                        |
| `legacy-sports-github` |         ✅          |          ✅           | Uses `gh` CLI; authenticated via GitHub token in cloud                                                                                    |
| `legacy-sports-nx`     |         ✅          |          ✅           | Uses `pnpm exec nx`; available after `pnpm install`                                                                                       |
| `worktree`             |         ✅          |          ❌           | Cloud agents work directly in a branch checkout — no worktrees needed                                                                     |
| `legacy-sports-make`   |         ✅          |          ✅           | Uses `make` CLI; worktree-create/wt-setup are Windows-only                                                                                |
| `legacy-sports-aws`    |         ✅          |          ❌           | No AWS SSO or OIDC credentials in cloud; no CloudWatch access — use GitHub Actions/CI logs via `legacy-sports-ci` (`ci_get_logs`) instead |
