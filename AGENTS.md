# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

> **NEVER commit to main** — locally: create a worktree first (`make worktree TICKET=#### DESC=description`). Cloud agents already have an isolated branch checkout.

## Critical Rules

- **NEVER commit to main** — create a worktree first: `make worktree TICKET=#### DESC=description`
- **Drive to PR** — work is NOT complete until `gh pr create` runs and Jira moves to "In Review". Passing `make pc` is a checkpoint, not the finish line. After validation passes, you **must** continue to: commit, push, `gh pr create`, Jira "In Review". Stopping after code changes or after `make pc` without opening a PR is the single most common agent failure mode.
- **One ticket = one worktree = one PR** — never add unrelated changes to an existing branch or worktree. If a new task arises while working on a ticket (e.g., the user asks you to fix something unrelated), create a **separate Jira ticket and worktree** for it. Do not `git stash` changes into another worktree or tack extra commits onto an in-flight branch — each PR must map to exactly one Jira ticket.
- **Worktree-first**: always create a worktree for ticket work — never edit code in the main repo (`D:\code\legacy-sports`). After creating the worktree, all file edits and terminal commands must use the worktree path.
- **Shared node_modules** — never `make clean`/`make install`/`pnpm install` in the main repo while worktrees exist. Broken node_modules in a junction? Check if it's a junction first, then ask the user — never fix autonomously. Always use `make install` (never raw `pnpm install`). See `skills/worktree-workflow/SKILL.md`.
- **Make first**: prefer `make <target>` over raw `pnpm exec nx` — it sets `NODE_OPTIONS` for the Windows windowsHide patch and is cross-platform safe. For project-specific targets use `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (exception: `lib/db-client` migration scripts that have no Nx target equivalent). See `skills/makefile/SKILL.md` for the full target list.
- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging` instead of `console.log/warn/error/debug`. Exceptions: `lib/logging/` (the logger itself), `apps/cli/`, migration files, and build-time scripts (`codegen.ts`, Vite plugins).
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable` (see `skills/no-lint-disable/SKILL.md`)
- **E2E tests are hermetic** — never use `route.continue()` in E2E tests — there is no backend in CI. Use `route.fulfill()` for unmatched operations (return a diagnostic error so missing mocks surface immediately). When changing login/landing page UI, update E2E selectors in the same PR (see `skills/e2e-testing/SKILL.md`).
- **Prefer `.graphql` + codegen over inline `gql`** — for new code in `apps/web` and `lib/shared-components`, define queries in `.graphql` files and import generated hooks from `graphql.generated.ts`. Legacy inline `gql` usage exists in the codebase and generated files necessarily contain `gql` strings.
- **Never manually remove worktrees**: always `twig worktree clean` — never `git worktree remove` or manual deletion (destroys junctions).
- **Kill background servers when done** — stop all `isBackground=true` processes before workflow ends. Run `make kill-stale` to find stale node processes holding addon locks.
- **Jira — MCP tools first**: use `jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`, `jira_set_parent` for all Jira operations. Fall back to `acli` CLI — never direct HTTP.
- **Resolve PR review threads**: after fixing review comments, resolve each thread via GraphQL `resolveReviewThread` mutation. See `skills/create-pr/SKILL.md`.

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
8. Commit: `git commit -m "type(scope): msg"` then `git push origin HEAD`
9. Rebase onto parent: `git fetch origin ; twig rebase` — keeps branch current with its parent (main or a stacked branch)
   - 9b. **Post-rebase stabilization (BEFORE push)**: `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen --base=origin/main` — main may have changed deps, schema, or formatting. **Do NOT push until `make pc` passes** (see `skills/rebase-conflicts/SKILL.md` Step 7).
10. **Migrations (BEFORE make pc)**: run `pnpm --prefix lib/db-client run db:status` and `pnpm --prefix lib/db-client run db:up` — **always do this even if you think no migrations were added.** Confirm `Applied N new migrations` or `No new migrations to apply`. (See `skills/db-migration-write/SKILL.md`.) _Note: `pnpm run` is allowed here because these are `lib/db-client` package scripts with no Nx target equivalent._
11. Validate: `make pc` — must pass before pushing or opening PR. If `nx format:write` rewrites any files, `make pc` **fails** with a list of the changed files; commit them and re-run `make pc`.
    - 11b. **Push only after `make pc` passes**: `git push --force-with-lease origin HEAD` — pushing before validating is the #1 cause of post-rebase CI failures.
12. **Ship (REQUIRED — do NOT stop before this step)**: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` then `.\scripts\cleanup-pr-body.ps1` then Jira "In Review" (see `skills/create-pr/SKILL.md`)
    - 12b. **MCP gap audit (REQUIRED)**: review all Bash commands from this session, identify any that should be MCP tools, and file tickets under LS-1455 for gaps not already tracked. See `skills/mcp-gap-audit/SKILL.md`.
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

| Server                 | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `legacy-sports-db`     | Database queries, migrations, schema generation                           |
| `legacy-sports-jira`   | Ticket CRUD, transitions, blocker checks                                  |
| `legacy-sports-ci`     | CI log queries, workflow reruns                                           |
| `legacy-sports-github` | PR and review lifecycle (uses `gh` CLI)                                   |
| `legacy-sports-nx`     | Nx project discovery, affected analysis, target execution                 |
| `legacy-sports-make`   | Makefile targets: validation, build, install, worktree setup              |
| `worktree`             | Worktree lifecycle: list, set active, run, guard, rebase, stabilize, push |
| `legacy-sports-aws`    | CloudWatch log tailing, AWS SSO status checks                             |

Use MCP tools first for Jira operations (`jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`). Fall back to `acli` CLI — never direct HTTP.

> **MCP-first principle**: the shell commands shown elsewhere in this document (Workflow, Commands sections) are **fallbacks** for when MCP servers are unavailable. When MCP tools are available, always prefer them over the equivalent shell commands listed below.

**Nx targets — MCP first**: for project-specific targets (build, test, lint, typecheck, codegen, etc.), prefer the `nx_run` MCP tool over `pnpm exec nx run <project>:<target>`. For affected targets, prefer `nx_run_affected` over `pnpm exec nx affected -t <target>`. Fall back to shell commands only when the MCP server is unavailable.

**Make targets — MCP first**: prefer `make_run` MCP tool over running `make <target>` via Bash. The MCP tool enforces a target whitelist, sets appropriate timeouts, and provides structured output. For worktree creation use `make_worktree_create`; for worktree setup use `make_wt_setup` (supports junction removal + independent `make install`).

**Git operations in worktrees — MCP first**: use `worktree_commit` instead of `git add`/`git commit` via Bash — it handles staging and committing in one operation and refuses to stage likely credential/secret files (e.g., `.env`, `credentials.*`, `*.pem`, `*.key`). Use `worktree_push` (supports `setUpstream`) instead of `git push`, `worktree_rebase` instead of `git fetch && twig rebase`, and `worktree_run` for other git commands. These tools auto-resolve the worktree directory, refuse dangerous operations (pushing `main`, pushing during rebase), and require no manual `cd` or `-C` flags.

**GitHub PR operations — MCP first**: use `github_create_pr` instead of `gh pr create` via Bash, `github_resolve_thread` instead of `gh api graphql` mutations, `github_get_review_threads` instead of raw GraphQL queries, and `github_manage_labels` instead of `gh pr edit --add-label`. These tools handle temp file body encoding, GraphQL thread IDs, and structured output.

**CI operations — MCP first**: use `ci_list_runs`, `ci_view_run`, `ci_get_logs`, `ci_search_logs`, and `ci_rerun` instead of `gh run` commands via Bash. These tools parse and structure log output for agent consumption.

**Database operations — MCP first**: use `db_migration_status` and `db_migrate` instead of `pnpm --prefix lib/db-client run db:status/db:up` via Bash, `db_query` for ad-hoc SQL, `db_codegen` for GraphQL codegen, and `db_print_schema` for schema regeneration.

**AWS operations — MCP first**: use `aws_logs_tail` instead of `aws logs tail` via Bash, and `aws_sso_status` to check credentials before any AWS operation.

## Cloud Agent Mode

This section applies to **all** cloud agent platforms (Claude Code on the web, Copilot Coding Agent, etc.).

When running as a **cloud coding agent**:

- **No worktrees/twig/acli** — work directly in the repo root. Use `git` for branches, MCP tools for Jira.
- **No AWS access** — DB MCP server uses local Docker PostgreSQL seeded from `resources/dev-seed.dump`.
- **Linux** — `bash` shell, `/` paths. No junctions or file locks.

**Cloud workflow:** Jira (`jira_create_ticket` → `jira_check_blockers` → `jira_transition` "In Progress") → code → `make <target>` → `pnpm --prefix lib/db-client run db:status` → `pnpm --prefix lib/db-client run db:up` → `make pc` → commit + push → `gh pr create` → Jira "In Review"

**GitHub CLI authentication (required for PR creation):**

The `legacy-sports-github` MCP server uses the `gh` CLI, which requires a GitHub token. The MCP config forwards `GH_TOKEN` from the host environment automatically. How the token gets into the environment depends on the platform:

| Platform                   | How to provide `GH_TOKEN` / `GITHUB_TOKEN`                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code on the web** | Set `GH_TOKEN` as an environment variable in the cloud environment settings UI. Install `gh` CLI via the setup script field: `apt update && apt install -y gh` |
| **Copilot Coding Agent**   | Automatically available via `${{ github.token }}`. Authenticated in `copilot-setup-steps.yml`                                                                  |
| **Local development**      | Already authenticated via `gh auth login` — no env var needed                                                                                                  |

If `gh` is not authenticated, the MCP server logs a diagnostic warning at startup with remediation hints.

**Available MCP servers in cloud:**

- `legacy-sports-ci` — CI log queries, workflow reruns
- `legacy-sports-db` — local Docker Postgres queries, migrations, schema generation
- `legacy-sports-jira` — ticket CRUD, transitions, blocker checks (requires `JIRA_EMAIL` and `JIRA_API_TOKEN` secrets)
- `legacy-sports-github` — PR and review lifecycle management (requires `GH_TOKEN` — see table above)
- `legacy-sports-nx` — Nx project discovery, affected analysis, and target execution

**Unavailable in cloud (by design):**

- `worktree` — no worktree management needed
- `legacy-sports-aws` — no AWS credentials

## Environment Notes

- **Local**: Windows · PowerShell (`;` to chain commands, `$env:` for vars) · twig for branch management
- **Cloud**: Ubuntu Linux · bash · no worktrees/twig · Docker PostgreSQL (no AWS access)
- Package manager: pnpm 9.12.1 (enforced via corepack — never use npm or yarn)
- Commit format: `type(scope): message` (e.g. `feat(auth): add oauth`)
