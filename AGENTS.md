# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

> **NEVER commit to the `main` branch.** Primary local sessions: spawn Claude Code with the **`worktree` checkbox checked** in the session launcher — the session starts inside an ephemeral worktree at `.claude/worktrees/<name>/` on a new branch, and Claude Code's header, `Create PR` button, and `gitStatus` all reflect that branch natively. For parallel work (sweep, batch, chained branches): `make worktree TICKET=#### DESC=description` creates a sibling worktree. Cloud agents already have an isolated branch checkout.

## Critical Rules

- **NEVER commit to the `main` branch** — every commit must be on a feature branch. Working in `D:\code\legacy-sports` with HEAD on `main` is forbidden.
- **Drive to merge** — work is NOT complete until the PR is **merged**, Jira moves to "Done", the MCP gap audit runs, and any tracking tasks are marked completed. Stopping after `make pc`, after `github_create_pr`, or while CI/reviews are still pending are all common agent failure modes.
- **One ticket = one worktree = one PR** — never add unrelated changes to an existing branch or worktree. Create a **separate Jira ticket and worktree** for unrelated work.
- **Worktree-first**: every ticket runs in its own worktree. Native ephemeral (launcher checkbox) is default — **do not rename the local branch**, use `worktree_push({ remoteBranch: "claude/LS-####-short-kebab-description" })` on first push so the remote gets the LS key while the local stays unchanged (keeps Claude Code UI in sync). Sibling worktrees (`make_worktree_create`) for parallel work only. Re-attach existing branches with `worktree_attach`. See `skills/worktree-workflow/SKILL.md`.
- **Claude Code's `isolation: "worktree"` Agent parameter** (Agent tool only): creates ephemeral worktrees for subagents. MCP tools work inside them — `worktree_set(key: "<absolute .claude/worktrees/... path>")` accepts absolute paths. Always prefer MCP tools over raw `git -C` even in ephemeral worktrees.
- **Shared node_modules** — never `make clean`/`make install`/`pnpm install` in the main repo while worktrees exist. Always use `make install` (never raw `pnpm install`). See `skills/worktree-workflow/SKILL.md`.
- **MCP-first, then Make**: always prefer MCP tools over shell commands — `make_run` over `make`, `nx_run`/`nx_run_affected` over `pnpm exec nx`. Shell equivalents are fallbacks only. See `skills/mcp-first/SKILL.md` for the full tool mapping and substitution table.
- **Tool-first for file operations**: use `Glob` (not `find`/`ls`), `Grep` (not `grep`/`rg`), and `Read` (not `cat`/`head`/`tail`). See `skills/mcp-first/SKILL.md` for the complete substitution table.
- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging`. Exceptions: `lib/logging/`, `apps/cli/`, migration files, and build-time scripts.
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable` (see `skills/standards/SKILL.md`)
- **Never embed secrets in tool calls** — never put raw secret values in `Edit`, `Write`, or `Bash` arguments. See `skills/secrets-handling/SKILL.md`.
- **E2E tests are hermetic** — never use `route.continue()` in E2E tests. Use `route.fulfill()` for unmatched operations. See `skills/testing/SKILL.md`.
- **Prefer `.graphql` + codegen over inline `gql`** — for new code in `apps/web` and `lib/shared-components`, define queries in `.graphql` files and import generated hooks from `graphql.generated.ts`.
- **Never manually remove worktrees**: always `twig worktree clean` — never `git worktree remove` or manual deletion (destroys junctions).
- **Kill background servers when done** — stop all `isBackground=true` processes before workflow ends. Run `make kill-stale` to find stale node processes. Call `browser_cleanup` to close Playwright browsers.
- **Jira — auth-aware routing**: call `jira_auth_status` first. If `configured: true`, use custom MCP tools (`jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`). If `configured: false` or API calls fail, **stop and tell the user**. On Claude Code on the web, use the Atlassian plugin (`mcp__claude_ai_Atlassian__*`, cloud ID `fb294606-6c8f-4b52-9a41-11fe45b77528`). See `skills/cloud-agent-mode/SKILL.md` for known quirks.
- **Resolve PR review threads**: after fixing review comments, resolve threads via `github_resolve_threads({ threadIds: [...] })`. See `skills/pr-lifecycle/SKILL.md`.

## Branch Naming

All pushed branches must contain at least one `LS-####` Jira key — Jira Branch Sync reads the branch name for "In Progress" transitions.

| Driver                        | Pattern                                                                                                                                                                                                            | Example                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Human / `make worktree`       | `LS-####/short-kebab-description`                                                                                                                                                                                  | `LS-2333/surface-resolved-worktree`                                                |
| Claude Code launcher checkbox | Local stays `claude/<random>`. On **first push**, use `worktree_push({ remoteBranch: "claude/LS-####-short-kebab-description" })` — remote gets the LS key, local stays unchanged so Claude Code UI stays in sync. | Local: `claude/kind-kepler` / Remote: `claude/LS-3049-worktree-push-remote-branch` |
| Agent (cloud, Copilot, bots)  | `<agent>/LS-####-short-kebab-description[-<suffix>]`                                                                                                                                                               | `copilot/LS-2401-fix-rollbar-init`                                                 |

Key rules: `<agent>` prefix identifies the runner (`claude/`, `copilot/`, `bot/`). Separator after `LS-####` in agent branches is `-`, not `/`. Description is short kebab-case, max 5 words. One ticket = one branch = one PR. Do **not** use `worktree_rename_branch` for native-checkbox sessions — it breaks Claude Code's branch detection. If on a branch without `LS-####`, include ticket keys in PR title/body as backstop.

## Workflow

Follow the **Agent Workflow Checklist (Steps 0-16)** in `skills/workflow-overview/SKILL.md`. Summary:

0. Epic check → 1. Create/identify ticket → 2. Dependency check → 3. Jira "In Progress" → 4. Worktree setup → 5. node_modules junction → 6. Work in worktree → 7. Code & test → 8. Commit → 9. Rebase → 10. Migrations → 11. `make pc` + self-review → 12. Ship (draft PR → label → mark ready → Copilot review → Jira "In Review") → 13. Watch PR to merge → 14. MCP gap audit → 15. Complete tracking tasks → 16. Cleanup

## Risk Classification

| Level      | Scope                                  | Planning Budget | Examples                           |
| ---------- | -------------------------------------- | --------------- | ---------------------------------- |
| **Low**    | Cosmetic, docs, test-only, single-file | 2-3 min         | Typo fix, add test, update README  |
| **Medium** | Business logic, multi-file, schema     | 5-10 min        | New resolver, UI feature, refactor |
| **High**   | Auth, payments, infra, migrations      | 10-15 min       | OAuth, Stripe webhook, Terraform   |

See `skills/planning/SKILL.md` for the full framework.

## Command Patterns

**Never use `cd <dir> && <command>`** — use flag-based alternatives: `git -C $wt`, `make -C $wt`, `make_run({ target: "test", worktreePath: "/absolute/path/to/worktree" })`, `worktree_run({ command: "pnpm exec nx test my-app" })`, `terraform -chdir=...`.

## Subagent Tool Preferences

Subagents do **not** inherit AGENTS.md context. Always include tool preference hints when spawning subagents. See `skills/subagent-templates/SKILL.md` for copy-paste templates covering Explore agents, git operations, PR sweeps, MCP server code, work subagents, and parent-agent recovery.

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
make codegen        # GraphQL codegen

make dev            # start all dev services
make dev-storybook  # Storybook component dev
make graphiql       # GraphQL explorer
make db-migrate     # run database migrations
make db-studio      # Drizzle Studio UI

make worktree TICKET=#### DESC=description   # create sibling worktree (parallel work only)
make wt-setup WT=$wt                         # install deps and configure sibling worktree
make kill-stale                              # kill stale node processes

pnpm exec nx run <project>:<target>          # project-specific targets
pnpm exec nx affected -t <target>            # affected analysis
```

**`scratch/` directory**: use for ad-hoc output files (lint results, CI logs, debug dumps). Everything in `scratch/` is gitignored. **On Windows, avoid `node -e "..."`** for multi-line scripts — write to `scratch/<name>.js` instead.

## Architecture

**Stack**: React Native (Expo) - Next.js - AWS Lambda - GraphQL (Apollo) - PostgreSQL (Drizzle ORM) - Nx monorepo - pnpm

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

**Database**: Drizzle ORM with PostgreSQL. Schema lives in `lib/db-client`. Always run `db_migration_status` and `db_migrate` MCP tools before `make pc`.

**Logging**: Import `LOGGER` from `@legacy-sports/logging`. ESLint enforces `no-console`.

**Testing**: Unit/integration: Jest (`make test`). Web E2E: Playwright (hermetic — `route.fulfill()` only). Mobile E2E: WebdriverIO.

## Design Context

Full design brief lives in `.impeccable.md` at the project root — load it before doing any frontend design work.

## Skills

Detailed how-to docs live in `.agents/skills/<name>/SKILL.md`. The `description` frontmatter field enables skill auto-discovery; agents can also browse the directory directly. CSV reference data is in `docs/agents/*.csv`.

## MCP Servers

| Server                  | Purpose                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `worktree`              | Worktree lifecycle: list, set active, run, guard, rebase, stabilize, push                                                 |
| `legacy-sports-github`  | PR and review lifecycle (GitHub REST/GraphQL API)                                                                         |
| `legacy-sports-make`    | Makefile targets: validation, build, install, worktree setup                                                              |
| `legacy-sports-nx`      | Nx project discovery, affected analysis, target execution                                                                 |
| `legacy-sports-jira`    | Ticket CRUD, transitions, blocker checks                                                                                  |
| `legacy-sports-db`      | Database queries, migrations, schema generation                                                                           |
| `legacy-sports-ci`      | CI log queries, workflow reruns; `ci_audit_session_bash` for MCP gap audits                                               |
| `legacy-sports-aws`     | CloudWatch log tailing, AWS SSO status checks                                                                             |
| `legacy-sports-browser` | Dev server lifecycle, headless screenshots, GitHub image upload                                                           |
| `claude_ai_Stripe`      | Claude Code built-in Stripe integration                                                                                   |
| `claude_ai_Atlassian`   | Claude Code built-in Atlassian plugin (Jira + Confluence via OAuth 2.1). Cloud ID: `fb294606-6c8f-4b52-9a41-11fe45b77528` |

> **Server load order matters in native-worktree sessions**: Claude Code's worktree-spawned sessions only connect the first few servers from `.mcp.json` at session start (LS-2902). The ordering prioritizes ticket-work tools (`worktree`, `github`, `make`, `nx`). If a native session is missing a server, fall back to shell or move to a sibling worktree.

> **MCP-first principle**: always prefer MCP tools over equivalent shell commands. See `skills/mcp-first/SKILL.md` for the full per-server tool mapping.

## Cloud Agent Mode

When running as a cloud coding agent (Claude Code on the web, Copilot Coding Agent): no worktrees/twig/acli, work directly in repo root; Linux/bash; Docker PostgreSQL; no AWS access. See `skills/cloud-agent-mode/SKILL.md` for the complete cloud workflow, GitHub + Jira auth setup, token configuration tables, Jira tool mapping, review lifecycle, known quirks, and available MCP servers.

## Environment Notes

- **Local**: Windows - PowerShell (`;` to chain commands, `$env:` for vars) - twig for branch management
- **Cloud**: Ubuntu Linux - bash - no worktrees/twig - Docker PostgreSQL (no AWS access)
- Package manager: pnpm 9.12.1 (enforced via corepack — never use npm or yarn)
- Commit format: `type(scope): message` (e.g. `feat(auth): add oauth`)
- **`jq` is NOT available on Windows** — use Python with explicit UTF-8 encoding for JSON parsing. Write scripts to `scratch/<name>.py` to avoid quoting issues.
