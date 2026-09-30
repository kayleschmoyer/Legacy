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

## Tool Reference

Every tool across all servers — names, descriptions, and full input schemas — is
indexed in a single browsable page:

- **[`docs/mcp/api-reference.html`](../../docs/mcp/api-reference.html)** — open it
  in a browser to search and filter the whole tool surface.
- **[`docs/mcp/api-reference.json`](../../docs/mcp/api-reference.json)** — the same
  model as machine-readable data.

Both are generated from the server sources by
`scripts/generate-mcp-api-reference.mjs`. Run **`make mcp-api-reference`** after
adding, removing, or re-describing a tool and commit the result — CI's
`custom-checks` job fails on drift (check locally with
`make lint-mcp-api-reference`).

## Tool-Definition Budget

A tool definition (name + description + input schema) is advertised to the model
up front, so **every registered tool bills every session whether or not it is
called** — 256 tools cost ~89,250 tokens today.

`docs/mcp/tool-budget.json` holds a per-server ceiling for tool count and
definition tokens, enforced by the same `make lint-mcp-api-reference` check.
It is a **ratchet**, so the check fails in both directions:

| Situation                                   | Result | Fix                                                        |
| ------------------------------------------- | ------ | ---------------------------------------------------------- |
| Over the ceiling                            | fail   | Consolidate, or raise the ceiling and justify it in the PR |
| Well under the ceiling (beyond a tolerance) | fail   | Lower the ceiling in the same PR to lock the saving in     |

Without the second direction a ceiling is a one-time cap that erodes — the next
tool added quietly spends whatever a consolidation saved. The tolerance is 2% of
the ceiling with a 200-token floor, so routine description edits don't force a
budget commit while a real consolidation does.

Re-seed every ceiling from the current measurement with **`make mcp-tool-budget`**
(review the diff — it overwrites all ceilings, including ones you may not have
meant to raise).

> Before adding a tool, read
> [`.agents/skills/create/references/mcp-tool-consolidation.md`](../../.agents/skills/create/references/mcp-tool-consolidation.md).
> An `action` param on an existing tool is almost always cheaper than a new tool,
> and anything superseded must be deregistered in the same PR.

#### Stability of `api-reference.json`

The JSON is a **generated artifact, not a published API**. Its shape follows
whatever the page needs to render, and it changes without a deprecation period.
Nothing outside this repo consumes it, and the only in-repo consumer is the
generator's own `--check` drift comparison, which compares whole-file content
and regenerates in the same commit.

If you build automation on it, pin a copy or regenerate from source rather than
depending on the shape staying put — and add yourself to this note so the next
shape change accounts for you.

Shape changes so far:

| Change                           | Reason                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `tools[].line` removed (LS-9593) | Never rendered, and it made every generated file churn whenever an unrelated edit shifted a server source down a line. |

### Served by the hosted servers

Each hosted server also serves its **own** page from its API Gateway URL at
`GET /docs` — the Swagger-UI equivalent for these JSON-RPC endpoints. The page
is generated into `lib/mcp-docs/src/pages/<server>.generated.ts`, embedded in the
Lambda bundle, and redeployed with the server, so it can never describe a
version of the tools that is not the one running.

The route sits **after** the bearer check, not before it: tool descriptions name
internal buckets, workflow names, and ticket keys, so the page requires the same
Cognito token the tools do. A browser cannot supply that on its own, so fetch it
with:

```bash
make mcp-docs SERVER=ci     # ci | github | jira | db-admin | rollbar
```

That mints a short-lived scoped token, fetches the page, and writes it to
`scratch/mcp-docs-<server>.html` to open locally. The offline copy covering every
server — hosted and local — is `docs/mcp/api-reference.html` and needs no token.

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
- **jira_check_blockers** — Automates the 3-way dependency check; pass `keys: [...]` (1-50) to resolve a whole dispatch batch in one JQL call
- **jira_get_all_descendants** — Full-tree leaf descendants of an epic/story with blocker state annotated inline
- **jira_search** / **jira_list_children** — Pass `includeBlockers: true` to annotate rows with `blocked` / `blockers` at no extra Jira request
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
- **worktree_run** — Run a shell command in the active worktree (120s process-level cap)
- **worktree_run_long** — Run a long (>120s) ad-hoc command in a specific worktree, with a caller-adjustable timeout and the same job/poll pattern as `worktree_run`
- **worktree_guard** — Check whether a path is inside the main repo (warns if worktrees are active)
- **worktree_rebase** — Fetch origin and rebase the active worktree branch onto its parent (via `twig rebase`)
- **worktree_stabilize** — Run post-rebase stabilization: `make install`, regenerate schema, and run codegen on affected projects
- **worktree_push** — Push the current branch with `--force-with-lease` (refuses to push `main`)

### aws-server

> **Server ID:** `legacy-sports-aws`

AWS CloudWatch logs and SSO authentication health:

- **aws_logs_tail** — Fetch recent CloudWatch logs for a Lambda function (wraps `aws logs tail`, or `aws logs filter-log-events` for a `startTime`/`endTime` window; auto-sets `AWS_PAGER=""` and `PYTHONIOENCODING=utf-8`)
- **aws_sso_status** — Check AWS SSO authentication status via `aws sts get-caller-identity`; returns caller identity or a structured remedy on failure

See `.agents/skills/infrastructure/SKILL.md` for context.

### github-server

> **Server ID:** `legacy-sports-github`

Pull request and review lifecycle management:

- **github_list_prs** — List PRs with filters (state, branch, author, label, search)
- **github_view_pr** — View detailed PR info (title, body, state, checks, reviews, diff stats)
- **github_request_review** — Request reviewers (fallback — bot reviews are auto-triggered by the `bot:ready-for-review` label)
- **github_get_review_threads** — Fetch review threads via GraphQL (unresolved/resolved, comments with path+line)
- **github_resolve_thread** — Resolve a review thread via GraphQL mutation
- **github_manage_labels** — Add or remove labels (e.g. `bot:ready-for-review`)
- **github_get_repo_info** — Get repo owner, name, default branch, and URL. Optional `include: ["rulesets", "actions_permissions"]` for workflow-403 triage

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

- **browser_dev_start** — Start an nx dev server in a worktree (port 4300-4399 auto-allocation); defaults to `web:serve` but accepts any `target` (nx `project:target`, e.g. `shared-components:storybook`); waits ≤45s for readiness, then returns `ready: false` for callers to poll `browser_dev_status`
- **browser_dev_stop** — Stop a tracked dev server by port, worktree path, or all
- **browser_dev_status** — List running dev servers and browser state (managed rows include a live `listening` probe)
- **browser_navigate** — Open a URL in headless Chromium with snapshot-prep CSS injection
- **browser_screenshot** — Capture page or element screenshot as PNG (returns inline image)
- **browser_screenshot_upload** — Upload PNG to GitHub draft release for PR body embedding
- **browser_cleanup** — Close browser and kill all tracked dev servers

See `.agents/skills/pr-lifecycle/references/agent-screenshots.md` for the end-to-end screenshot workflow.

### android-server

> **Server ID:** `legacy-sports-android`

Android device/emulator/build tooling — the Android counterpart to
`browser-server`'s dev-server/screenshot lifecycle, closing the mobile
before/after visual-evidence gate without hand-rolled `adb`/`emulator`/
`gradlew` shell plumbing (LS-8815):

- **android_device** — `list` connected devices / `start_emulator` (boots an AVD, blocks on `sys.boot_completed`, bounded per call) / `reverse` (port-forward to a local Metro dev server); resolves the SDK path itself
- **android_app** — `install` an APK (`adb install`) / `launch` the app (force-stop then `adb shell am start`)
- **android_screenshot** — capture and return a PNG inline (`adb exec-out screencap -p`), mirroring `browser_screenshot`
- **android_logcat** — filtered `adb logcat -d` crash triage (tag filters, buffer clear, line cap)
- **android_build** — `gradlew app:assemble<Variant>`, with an auto-generated `versionCode` override to avoid `INSTALL_FAILED_VERSION_DOWNGRADE`

Reuses SDK-path resolution and `adb`/`emulator` output parsing from
`scripts/run-android-dev.mjs` rather than reimplementing it. See
`tools/mcp/android-server/README.md`.

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
| `legacy-sports-android`  |   ✅ (needs SDK)    |          ❌           | No Android SDK/emulator/device in any cloud agent environment (Copilot, Claude Code Remote) — every tool returns a structured error rather than crashing                     |
