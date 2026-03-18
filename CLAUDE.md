# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules

- **NEVER commit to main** — create a worktree first: `make worktree TICKET=#### DESC=description`
- **Drive to PR** — work is NOT complete until `gh pr create` runs and Jira moves to "In Review"
- **One ticket = one worktree = one PR** — never mix unrelated changes
- **Shared node_modules** — never `make clean`/`make install` in the main repo while worktrees exist. Broken junction? Ask the user, never fix autonomously.
- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging`. Exceptions: `lib/logging/`, `apps/cli/`, migration files, build-time scripts.
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable`
- **E2E tests are hermetic** — never `route.continue()`; use `route.fulfill()` so missing mocks surface immediately
- **Kill background servers when done** — `make kill-stale`
- **Prefer `.graphql` + codegen over inline `gql`** — for new code in `apps/web` and `lib/shared-components`, define queries in `.graphql` files and import generated hooks from `graphql.generated.ts`. Legacy inline `gql` usage exists in the codebase and generated files necessarily contain `gql` strings.

## Post-Session Reflection (AI Workspace Improvements)

After completing any task, reflect on the session and identify gaps in MCP tooling or agent skills:

1. **Check** [LS-1455](https://bkrupa.atlassian.net/browse/LS-1455) for existing child tickets (`parent = LS-1455` JQL)
2. **File a child Task/Story** under LS-1455 if the gap is not already tracked

**What qualifies as a gap:**

- A needed MCP tool doesn't exist or returns incomplete data
- A skill doc (`.agents/skills/<name>/SKILL.md`) is missing, outdated, or misleading for a workflow agents perform
- CLAUDE.md instructions were ambiguous or missing coverage for a real scenario

## Workflow

Full details in `.github/copilot-instructions.md`. Summary:

1. **Jira**: `jira_create_ticket` → `jira_check_blockers` → `jira_transition` "In Progress"
   - If blocker is not In Review or Done → **STOP**, inform user
   - If blocker is In Review → branch from that ticket's branch, not main
2. **Worktree**: `make worktree TICKET=#### DESC=description` → `make wt-setup WT=$wt`
   - All subsequent file edits and commands must use the worktree path, not `D:\code\legacy-sports`
3. **Code**: `make <target>` (never `pnpm run` directly — exception: `lib/db-client` migration scripts)
4. **Migrations (before `make pc`)**: `cd lib/db-client && pnpm run db:status && pnpm run db:up`
5. **Rebase**: `git fetch origin ; twig rebase` → `make install` → `make pc`
6. **Validate**: `make pc` must pass before pushing. If `nx format:write` rewrites files, commit them and re-run.
7. **PR**: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main`
8. **Cleanup**: Jira "In Review" → `twig worktree clean` (never `git worktree remove` directly)

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
cd lib/db-client && pnpm run db:status
cd lib/db-client && pnpm run db:up

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

**Database**: Drizzle ORM with PostgreSQL. Schema lives in `lib/db-client`. Always run `pnpm run db:status && pnpm run db:up` in `lib/db-client` before `make pc`.

**Logging**: Import `LOGGER` from `@legacy-sports/logging`. ESLint enforces `no-console`.

**Testing**:

- Unit/integration: Jest (`make test`)
- Web E2E: Playwright (hermetic — mock all network with `route.fulfill()`, never `route.continue()`)
- Mobile E2E: WebdriverIO

## Skills Reference

Detailed how-to docs under `.agents/skills/<name>/SKILL.md`:

| Task                         | Skill                                                            |
| ---------------------------- | ---------------------------------------------------------------- |
| Full workflow                | `worktree-workflow`                                              |
| Architecture deep-dive       | `architecture`                                                   |
| DB queries / schema          | `db-query`, `db-schema`                                          |
| E2E / integration tests      | `e2e-testing`, `integration-testing`                             |
| Bug / lint / type fixes      | `fix-bugs`, `fix-lint`, `fix-types`                              |
| New app / lambda / lib / MCP | `create-app`, `create-lambda`, `create-lib`, `create-mcp-server` |
| PR creation / review threads | `create-pr`, `pr-operations`                                     |
| Rebase / merge conflicts     | `rebase-conflicts`, `resolve-merge-conflicts`                    |
| Platform file conventions    | `platform-file-convention`                                       |
| Makefile targets             | `makefile`                                                       |

## MCP Servers

| Server                 | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `legacy-sports-db`     | Database queries, migrations, schema generation           |
| `legacy-sports-jira`   | Ticket CRUD, transitions, blocker checks                  |
| `legacy-sports-ci`     | CI log queries, workflow reruns                           |
| `legacy-sports-github` | PR and review lifecycle (uses `gh` CLI)                   |
| `legacy-sports-nx`     | Nx project discovery, affected analysis, target execution |

Use MCP tools first for Jira operations (`jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`). Fall back to `acli` CLI — never direct HTTP.

## Environment Notes

- **Local**: Windows · PowerShell (`;` to chain commands, `$env:` for vars) · twig for branch management
- **Cloud agent**: Ubuntu Linux · bash · no worktrees/twig · Docker PostgreSQL (no AWS access)
- Package manager: pnpm 9.12.1 (enforced via corepack — never use npm or yarn)
- Commit format: `type(scope): message` (e.g. `feat(auth): add oauth`)
