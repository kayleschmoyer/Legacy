# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

> **NEVER commit to main** — locally: create a worktree first (`make worktree TICKET=#### DESC=description`). Cloud agents already have an isolated branch checkout.

## Critical Rules

- **NEVER commit to main** — create a worktree first: `make worktree TICKET=#### DESC=description`
- **Drive to PR** — work is NOT complete until `gh pr create` runs and Jira moves to "In Review". Passing `make pc` is a checkpoint, not the finish line. After validation passes, you **must** continue to: commit, push, `gh pr create`, Jira "In Review". Stopping after code changes or after `make pc` without opening a PR is the single most common agent failure mode.
- **One ticket = one worktree = one PR** — never add unrelated changes to an existing branch or worktree. If a new task arises while working on a ticket (e.g., the user asks you to fix something unrelated), create a **separate Jira ticket and worktree** for it. Do not `git stash` changes into another worktree or tack extra commits onto an in-flight branch — each PR must map to exactly one Jira ticket.
- **Worktree-first**: always create a worktree for ticket work — never edit code in the main repo (`D:\code\legacy-sports`). After creating the worktree, all file edits and terminal commands must use the worktree path.
- **Built-in `isolation: "worktree"` for throwaway tasks only**: Claude Code's Agent tool supports `isolation: "worktree"` which creates ephemeral worktrees in `.claude/worktrees/`. Use this **only** for disposable exploration — code research, architecture spikes, parallel file searches — where no Jira ticket, dependency setup, or PR is needed. These worktrees lack junction optimization, twig dependency tracking, and git hooks (pre-commit security checks installed via `make setup-hooks`). All ticket-based work **must** use the custom worktree workflow (`make worktree` + `make wt-setup` + worktree MCP server).
- **Shared node_modules** — never `make clean`/`make install`/`pnpm install` in the main repo while worktrees exist. Broken node_modules in a junction? Check if it's a junction first, then ask the user — never fix autonomously. Always use `make install` (never raw `pnpm install`). See `skills/worktree-workflow/SKILL.md`.
- **Make first**: prefer `make <target>` over raw `pnpm exec nx` — it sets `NODE_OPTIONS` for the Windows windowsHide patch and is cross-platform safe. For project-specific targets use `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (exception: `lib/db-client` migration scripts that have no Nx target equivalent). See `skills/repo-tooling/SKILL.md` for the full target list.
- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging` instead of `console.log/warn/error/debug`. Exceptions: `lib/logging/` (the logger itself), `apps/cli/`, migration files, and build-time scripts (`codegen.ts`, Vite plugins).
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable` (see `skills/standards/SKILL.md`)
- **E2E tests are hermetic** — never use `route.continue()` in E2E tests — there is no backend in CI. Use `route.fulfill()` for unmatched operations (return a diagnostic error so missing mocks surface immediately). When changing login/landing page UI, update E2E selectors in the same PR (see `.agents/skills/testing/SKILL.md`).
- **Prefer `.graphql` + codegen over inline `gql`** — for new code in `apps/web` and `lib/shared-components`, define queries in `.graphql` files and import generated hooks from `graphql.generated.ts`. Legacy inline `gql` usage exists in the codebase and generated files necessarily contain `gql` strings.
- **Never manually remove worktrees**: always `twig worktree clean` — never `git worktree remove` or manual deletion (destroys junctions).
- **Kill background servers when done** — stop all `isBackground=true` processes before workflow ends. Run `make kill-stale` to find stale node processes holding addon locks. Call `browser_cleanup` to close any Playwright browsers and dev servers started by the browser MCP server.
- **Jira — auth-aware routing**: call `jira_auth_status` at the start of any Jira workflow. If `configured: true`, use `jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`, `jira_set_parent` for all Jira operations. If `configured: false`, fall back to Claude's built-in Atlassian tools (`mcp__claude_ai_Atlassian__*`). Last resort: `acli` CLI — never direct HTTP.
- **Resolve PR review threads**: after fixing review comments, resolve each thread via GraphQL `resolveReviewThread` mutation. See `skills/pr-lifecycle/SKILL.md`.

## Workflow

0. **Epic check**: if the given ticket is an Epic, do NOT implement the epic directly. Instead, use `jira_view` to inspect the epic's child issues, identify the next unblocked To Do ticket, and begin working on that child ticket. If `jira_list_children` is available, prefer it; otherwise use `acli jira workitem search --jql "parent = LS-####"`. Repeat for each child until all are complete or blocked.
1. Ticket: create if needed using the `jira_create_ticket` MCP tool with `sprint: "current"` to add it to the active sprint (or `acli jira workitem create --summary "..." --project LS --type Task`) — note `$key`
2. **Dependency check**: inspect the Jira ticket for "blocked-by" linked issues. Query their status before any status transition:
   - **Blocker is not In Review or Done — STOP.** Do not proceed with the ticket. Inform the user that the blocking ticket must reach at least "In Review" before work can begin.
   - **Blocker is In Review — use its branch as the parent.** The worktree must branch from that ticket's branch, not from `main` (see `skills/worktree-workflow/SKILL.md` Step 1).
   - **Blocker is Done (or no blockers) — base off `origin/main`.**
3. **Jira "In Progress" after blocker check passes**: use the `jira_transition` MCP tool with status "In Progress" (or `acli jira workitem transition --key LS-#### --status "In Progress"`) only after confirming blockers are In Review/Done (or absent). If the ticket is not in the current sprint, move it using `acli jira sprint list --board-id LS --state active` to find the active sprint ID, then `acli jira sprint add --sprint-id <id> --issue LS-####` to add the ticket — tickets worked on outside the active sprint are invisible to the team.
4. Worktree: `make worktree TICKET=#### DESC=description` (or `PARENT=LS-XXXX/branch` for dependent tickets) — this creates the branch, worktree, **and registers the parent dependency** in one step. Run `twig worktree list` to note the path. **Do NOT use `twig worktree create` directly** — it skips parent registration and creates orphaned branches.
5. Setup worktree: `make wt-setup WT=$wt` (or manually: navigate to `$wt` then `make install`, copy `.env`, junction `.twig`)
   - 5b. **Agent multi-root access** (optional): `make sync-worktrees` then `code legacy-sports.code-workspace` — gives agents search access across all worktrees in one window.
6. **All remaining work happens at the worktree path (`$wt`), NOT `D:\code\legacy-sports`.** Every file edit, terminal command, and git operation must target `$wt`.
7. Code: `make <target>` (e.g. `make test`, `make build`, `make typecheck`, `make lint-fix`). For project-specific targets: `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (exception: `lib/db-client` migration scripts — see step 10).
   - 7b. **Test new test files (MANDATORY)**: if you wrote or modified any test file (`.spec.ts`, `.spec.tsx`, `.test.ts`, `.test.tsx`, `.integration.spec.ts`), run those tests locally and confirm they pass **before committing**. For Jest: `pnpm exec nx run <project>:test --testPathPattern="SpecName"`. For Playwright E2E: `pnpm exec nx build web` then `pnpm exec nx e2e web-e2e -- --grep='test name' --config=apps/web-e2e/playwright.config.ts`. Never push untested test code. See `.agents/skills/testing/SKILL.md`.
8. Commit: `git commit -m "type(scope): msg"` then `git push origin HEAD`
9. Rebase onto parent: `git fetch origin ; twig rebase` — keeps branch current with its parent (main or a stacked branch)
   - 9b. **Post-rebase stabilization (BEFORE push)**: `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen --base=origin/main` — main may have changed deps, schema, or formatting. **Do NOT push until `make pc` passes** (see `skills/rebase/SKILL.md` Step 4).
10. **Migrations (BEFORE make pc)**: run `pnpm --prefix lib/db-client run db:status` and `pnpm --prefix lib/db-client run db:up` — **always do this even if you think no migrations were added.** Confirm `Applied N new migrations` or `No new migrations to apply`. (See `skills/repo-tooling/SKILL.md`.) _Note: `pnpm run` is allowed here because these are `lib/db-client` package scripts with no Nx target equivalent._
11. Validate: `make pc` — must pass before pushing or opening PR. If `nx format:write` rewrites any files, `make pc` **fails** with a list of the changed files; commit them and re-run `make pc`.
    - 11b. **Self-review (BEFORE first push)**: run the `/review` skill (or follow the self-review steps in `skills/pr-lifecycle/SKILL.md`) to catch project-rule violations and code quality issues that `make pc` does not check. This significantly reduces Copilot review rounds.
    - 11c. **Push only after `make pc` passes**: `git push --force-with-lease origin HEAD` — pushing before validating is the #1 cause of post-rebase CI failures.
12. **Ship (REQUIRED — do NOT stop before this step)**: Create PR as **draft** first, then mark ready after validation. This prevents sweep/review agents from racing with the creating agent.
    - 12a. **Create draft PR**: `github_create_pr(title: "LS-#### type(scope): msg", body: <markdown>, draft: true, worktreePath: <path>)` (or `gh pr create --draft --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` then `bash scripts/cleanup-pr-body.sh`)
    - 12b. **Mark ready for review**: after PR creation succeeds, `github_mark_pr_ready(number: <PR#>)` (or `gh pr ready <PR#>`) — this signals to sweep/review agents that the PR is available.
    - 12c. **Jira "In Review"**: transition the ticket after marking the PR ready.
    - 12d. **MCP gap audit (REQUIRED)**: review all Bash commands from this session, identify any that should be MCP tools, and file tickets under LS-1455 for gaps not already tracked. See `skills/mcp-gaps/SKILL.md`.
13. Cleanup: `twig worktree clean` then `git branch -d LS-####/description` then Jira "Done" — **NEVER use `git worktree remove` directly** (see Rules)

## Command Patterns — Avoid `cd` Compound Commands

**Never use `cd <dir> && <command>` or `cd <dir> ; <command>` patterns.** These trigger security prompts in some agents and obscure which directory a command targets. Use flag-based alternatives:

| Pattern                            | Replacement                           |
| ---------------------------------- | ------------------------------------- |
| `cd lib/db-client && pnpm run ...` | `pnpm --prefix lib/db-client run ...` |
| `cd $wt && git ...`                | `git -C $wt ...`                      |
| `cd $wt && make ...`               | `make -C $wt ...`                     |
| `cd terraform && terraform ...`    | `terraform -chdir=terraform ...`      |

## Commands

```bash
make build          # build affected projects
make test           # test changed files
make test-all       # test all projects
make lint           # lint
make lint-fix       # lint with auto-fix
make typecheck      # type check all projects
make format         # format code
make pc             # full pre-commit validation (lint + typecheck + test + build)

make dev            # start all dev services
make dev-storybook  # Storybook component dev
make graphiql       # GraphQL explorer

make db-migrate     # run database migrations
make db-studio      # Drizzle Studio UI

make worktree TICKET=#### DESC=description   # create worktree for ticket
make wt-setup WT=$wt                         # install deps and configure worktree
make kill-stale                              # kill stale node processes

# Project-specific targets (use instead of pnpm run):
pnpm exec nx run <project>:<target>
pnpm exec nx affected -t <target>

# db-client migration scripts only (no Nx target equivalent):
pnpm --prefix lib/db-client run db:status
pnpm --prefix lib/db-client run db:up

# GraphQL codegen:
make codegen
```

**`scratch/` directory**: use `scratch/` for ad-hoc output files (lint results, CI logs, debug dumps, Playwright output). Everything in `scratch/` is gitignored. Each worktree has its own isolated `scratch/` directory.

## Architecture

**Stack**: React Native (Expo) · Next.js · AWS Lambda · GraphQL (Apollo) · PostgreSQL (Drizzle ORM) · Nx monorepo · pnpm

```
apps/          React Native app, Next.js web app, CLI, E2E test suites
lambdas/       Serverless backend: GraphQL API (db), game-selection, stats, draft-processor, websocket, oauth-proxy, stripe-webhook, apple-iap
lib/           19+ shared libraries (shared-components, db-client, scoring, data-loaders, logging, api, utils, aws-utils, analytics, ...)
terraform/     Infrastructure-as-Code
scripts/       PowerShell and shell automation scripts
.agents/skills/ Modular skill docs for specific tasks
```

**GraphQL API**: Lives in `lambdas/db` (Apollo Server on Lambda). Schema changes require Drizzle migrations in `lib/db-client/migrations/` and regenerating types via `make codegen`.

**Cross-platform components**: `lib/shared-components/src/platform-components/` — `.native.ts` files are auto-resolved by Metro. The `__PLATFORM_COMPONENTS__` magic string is used for build-time resolution of more complex platform splits.

**Database**: Drizzle ORM with PostgreSQL. Schema lives in `lib/db-client`. Always run `pnpm --prefix lib/db-client run db:status` and `pnpm --prefix lib/db-client run db:up` before `make pc`.

**Logging**: Import `LOGGER` from `@legacy-sports/logging`. ESLint enforces `no-console`.

**Testing**:

- Unit/integration: Jest (`make test`)
- Web E2E: Playwright (hermetic — mock all network with `route.fulfill()`, never `route.continue()`)
- Mobile E2E: WebdriverIO

## Skills

Detailed how-to docs live in `.agents/skills/<name>/SKILL.md`. The `description` frontmatter field enables skill auto-discovery; agents can also browse the directory directly. CSV reference data is in `docs/agents/*.csv`.

## MCP Servers

| Server                  | Purpose                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `legacy-sports-db`      | Database queries, migrations, schema generation                                                               |
| `legacy-sports-jira`    | Ticket CRUD, transitions, blocker checks                                                                      |
| `legacy-sports-ci`      | CI log queries, workflow reruns                                                                               |
| `legacy-sports-github`  | PR and review lifecycle (GitHub REST/GraphQL API)                                                             |
| `legacy-sports-nx`      | Nx project discovery, affected analysis, target execution                                                     |
| `legacy-sports-make`    | Makefile targets: validation, build, install, worktree setup                                                  |
| `worktree`              | Worktree lifecycle: list, set active, run, guard, rebase, stabilize, push                                     |
| `legacy-sports-aws`     | CloudWatch log tailing, AWS SSO status checks                                                                 |
| `claude_ai_Stripe`      | Claude Code built-in Stripe integration (Claude Code only; not configured via this repo's `.vscode/mcp.json`) |
| `legacy-sports-browser` | Dev server lifecycle, headless screenshots, GitHub image upload                                               |

Call `jira_auth_status` at the start of any Jira workflow. If `configured: true`, use our custom tools (`jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`). If `configured: false`, fall back to Claude's built-in Atlassian tools (`mcp__claude_ai_Atlassian__*`). Last resort: `acli` CLI — never direct HTTP.

> **MCP-first principle**: the shell commands shown elsewhere in this document (Workflow, Commands sections) are **fallbacks** for when MCP servers are unavailable. When MCP tools are available, always prefer them over the equivalent shell commands listed below.

**Nx targets — MCP first**: for project-specific targets (build, test, lint, typecheck, codegen, etc.), prefer the `nx_run` MCP tool over `pnpm exec nx run <project>:<target>`. For affected targets, prefer `nx_run_affected` over `pnpm exec nx affected -t <target>`. Fall back to shell commands only when the MCP server is unavailable.

**Make targets — MCP first**: prefer `make_run` MCP tool over running `make <target>` via Bash. The MCP tool enforces a target whitelist, sets appropriate timeouts, and provides structured output. For worktree creation use `make_worktree_create`; for worktree setup use `make_wt_setup` (supports junction removal + independent `make install`).

**Git operations in worktrees — MCP first**: use `worktree_commit` instead of `git add`/`git commit` via Bash — it handles staging and committing in one operation and refuses to stage likely credential/secret files (e.g., `.env`, `credentials.*`, `*.pem`, `*.key`). Use `worktree_push` (supports `setUpstream`) instead of `git push`, `worktree_rebase` instead of `git fetch && twig rebase`, and `worktree_run` for other git commands. These tools auto-resolve the worktree directory, refuse dangerous operations (pushing `main`, pushing during rebase), and require no manual `cd` or `-C` flags.

**GitHub PR operations — MCP first**: use `github_create_pr` (with `draft: true`) instead of `gh pr create` via Bash, `github_mark_pr_ready` instead of `gh pr ready`, `github_resolve_thread` instead of `gh api graphql` mutations, `github_get_review_threads` instead of raw GraphQL queries, and `github_manage_labels` instead of `gh pr edit --add-label`. These tools handle temp file body encoding, GraphQL thread IDs, and structured output.

**GitHub auth-aware routing**: call `github_auth_status` at the start of any GitHub workflow. If `configured: true`, use our custom GitHub MCP tools. If `configured: false`, fall back to `gh` CLI commands directly (which may have their own authentication via `gh auth login`).

**CI operations — MCP first**: use `ci_list_runs`, `ci_view_run`, `ci_get_logs`, `ci_search_logs`, and `ci_rerun` instead of `gh run` commands via Bash. These tools parse and structure log output for agent consumption.

**Database operations — MCP first**: use `db_migration_status` and `db_migrate` instead of `pnpm --prefix lib/db-client run db:status/db:up` via Bash, `db_query` for ad-hoc SQL, `db_codegen` for GraphQL codegen, and `db_print_schema` for schema regeneration.

**AWS operations — MCP first**: use `aws_logs_tail` instead of `aws logs tail` via Bash, and `aws_sso_status` to check credentials before any AWS operation.

**Claude built-in integrations**: Claude Code provides native integrations that work without local credentials. Use these when working on related code:

- **Stripe** (`mcp__claude_ai_Stripe__*`): Full Stripe API access — create/list customers, products, prices, invoices, subscriptions, payment links, refunds, coupons, and disputes. Use when working on `lambdas/stripe-webhook`, `lambdas/apple-iap`, or any billing/payment code. Search Stripe docs with `search_stripe_documentation`.
- **Atlassian** (`mcp__claude_ai_Atlassian__*`): Jira + Confluence access — used as fallback when local Jira credentials are unavailable (see Jira MCP server prerequisites: `JIRA_EMAIL`/`JIRA_API_TOKEN` and troubleshooting docs in this repo).

**Browser operations — MCP first**: use `browser_dev_start` to start a dev server, `browser_navigate` + `browser_screenshot` to capture UI state, and `browser_screenshot_upload` to get GitHub-hosted image URLs for PR bodies. Always call `browser_cleanup` before ending a workflow. See `.agents/skills/pr-lifecycle/references/agent-screenshots.md` for the full workflow.

## Cloud Agent Mode

This section applies to **all** cloud agent platforms (Claude Code on the web, Copilot Coding Agent, etc.).

When running as a **cloud coding agent**:

- **No worktrees/twig/acli** — work directly in the repo root. Use `git` for branches, MCP tools for Jira.
- **No AWS access** — DB MCP server uses local Docker PostgreSQL seeded from `resources/dev-seed.dump`.
- **Linux** — `bash` shell, `/` paths. No junctions or file locks.
- **Native integrations (Claude Code on the web)** — Claude Code provides built-in GitHub and Atlassian connectors that work without configuring secrets. Prefer these over custom MCP servers when available (see details below).

**Cloud workflow:** Jira (`jira_create_ticket` → `jira_check_blockers` → `jira_transition` "In Progress") → code → `make <target>` → `pnpm --prefix lib/db-client run db:status` → `pnpm --prefix lib/db-client run db:up` → `make pc` → commit + push → `github_create_pr(draft: true)` → `github_mark_pr_ready` → Jira "In Review"

**GitHub authentication for PR creation:**

The `legacy-sports-github` MCP server calls GitHub REST/GraphQL APIs directly (it does **not** require the `gh` CLI). It resolves a GitHub token in this order: `GH_TOKEN`/`GITHUB_TOKEN` env var, cached token file (expiry-aware), GitHub App installation token (if `AGENT_AUTHOR_APP_PRIVATE_KEY` is set — generates and caches a 1-hour token on demand), `~/.netrc`, `gh auth token` (optional, 5s timeout), then interactive OAuth device flow as a last resort. Claude Code on the web also provides a native GitHub connector that requires no token configuration.

| Platform                   | How to authenticate                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code on the web** | **Preferred**: use Claude's native GitHub connector (no secrets needed). Alternative: set `GH_TOKEN` or `GITHUB_TOKEN` in cloud environment settings (no `gh` CLI installation required) |
| **Copilot Coding Agent**   | Automatically available via `${{ github.token }}`. Authenticated in `copilot-setup-steps.yml`. No native Claude integrations available                                                   |
| **Local development**      | Already authenticated via `gh auth login`, `~/.netrc`, or env var — any token source works                                                                                               |

If token resolution fails during the MCP server's startup preflight, it logs a diagnostic warning and defers authentication to the first API call (which may trigger the interactive device flow).

For **interactive sessions** (local, Claude Code on the web), no token setup is needed — the device flow handles first-time auth automatically and caches the token for future sessions.

For **cloud environments** (Claude Code on the web, Copilot), pre-configuring a token is recommended — the device flow may not surface stderr prompts reliably. How the token gets there depends on the platform:

| Platform                   | Token source                            | Config file                | Setup                                                                                                                                  |
| -------------------------- | --------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Local development**      | `gh auth login` or device flow          | `.mcp.json`                | No env var needed — fallback chain handles it                                                                                          |
| **Claude Code on the web** | Agent Author app token (auto-generated) | `.mcp.json`                | Set `AGENT_AUTHOR_APP_PRIVATE_KEY` in env settings. The MCP server generates and caches tokens natively (no setup script step needed). |
| **Copilot Coding Agent**   | Agent Author app token (auto-generated) | `.github/copilot/mcp.json` | Copilot generates a 1-hour installation token from the Agent Author GitHub App (ID `3158619`) and writes it to this config             |

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

**Jira authentication:**

The `legacy-sports-jira` MCP server requires Jira API credentials — either `JIRA_EMAIL` + `JIRA_API_TOKEN` env vars or a `~/.netrc` entry for your Atlassian host. On **Claude Code on the web**, Claude's native Atlassian tools (`mcp__claude_ai_Atlassian__*`) are available without any credential configuration and are the preferred option. The existing Jira auth-aware routing rule applies: call `jira_auth_status` first — if `configured: false`, use `mcp__claude_ai_Atlassian__*` tools. On **Copilot Coding Agent**, native Claude integrations are not available, so `JIRA_EMAIL`/`JIRA_API_TOKEN` must be configured as repository secrets.

**Available MCP servers in cloud:**

- `legacy-sports-ci` — CI log queries, workflow reruns
- `legacy-sports-db` — local Docker Postgres queries, migrations, schema generation
- `legacy-sports-jira` — ticket CRUD, transitions, blocker checks (requires Jira API credentials via env vars or `.netrc`). On Claude Code on the web, Claude's native Atlassian tools (`mcp__claude_ai_Atlassian__*`) are an alternative that requires no secrets
- `legacy-sports-github` — PR and review lifecycle management (requires a GitHub token via `GH_TOKEN`, `GITHUB_TOKEN`, `.netrc`, `gh auth token`, or device flow — see table above). On Claude Code on the web, Claude's native GitHub connector is an alternative that requires no secrets
- `legacy-sports-nx` — Nx project discovery, affected analysis, and target execution

**Unavailable in cloud (by design):**

- `worktree` — no worktree management needed
- `legacy-sports-aws` — no AWS credentials

## Environment Notes

- **Local**: Windows · PowerShell (`;` to chain commands, `$env:` for vars) · twig for branch management
- **Cloud**: Ubuntu Linux · bash · no worktrees/twig · Docker PostgreSQL (no AWS access)
- Package manager: pnpm 9.12.1 (enforced via corepack — never use npm or yarn)
- Commit format: `type(scope): message` (e.g. `feat(auth): add oauth`)
