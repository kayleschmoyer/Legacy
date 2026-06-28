# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

> **NEVER commit to the `main` branch.** Use the **`worktree` checkbox** in the launcher or `make worktree TICKET=#### DESC=description`. Cloud agents already have an isolated checkout.

## Critical Rules

Rules are grouped by category and tiered by severity. **Tier 1** violations are catastrophic or irreversible. **Tier 2** violations are costly (wasted CI time, stuck PRs, rework cycles). **Tier 3** violations are quality issues caught in review.

### Safety (Tier 1)

- **NEVER commit to the `main` branch** — all commits must be on a feature branch; working in `D:\code\legacy-sports` with HEAD on `main` is forbidden.
- **Never embed secrets in tool calls** — never put raw secret values in `Edit`, `Write`, or `Bash` arguments. See `.agents/skills/secrets-handling/SKILL.md`.
- **Never run `aws sso login` (or any other auth-generation command)** — these are **user-only** actions. If any tool call returns an auth/expired-token error, **stop immediately**, surface the `hint` verbatim, and prompt the user to re-authenticate. See `.agents/skills/credentials/SKILL.md`.

### Workflow Discipline (Tier 2)

- **Drive to merge** — work is NOT complete until the PR is **merged**, Jira moves to "Done", the MCP gap audit runs, and all tracking tasks are marked completed. See [Task Completion Signal](#task-completion-signal).
- **Draft is a working state, not an ending state** — mark the PR ready (`github_mark_pr_ready`) the moment implementation and self-review are done. **Never end a turn with a PR in draft.** See `.agents/skills/pr-lifecycle/SKILL.md`.
- **Worktree discipline** — every ticket runs in its own worktree:
  - **One ticket = one worktree = one PR** — never add unrelated changes to a branch; create a separate ticket for unrelated work.
  - **Do not rename the local branch** — Claude Code caches it at session start; renaming breaks PR detection. Jira links via PR title + commit messages containing `LS-####`.
  - **Subagent isolation** — `Agent(isolation: "worktree")` creates ephemeral worktrees; always prefer MCP tools over raw `git -C` in them.
  - **node_modules pool** — never `pnpm install`/`pnpm add` straight through a worktree symlink. Use `node scripts/modules-pool/link.mjs` / `make install`. Never `pnpm exec nx reset` — use `make clean-cache`.
  - **Never manually remove worktrees** — always `twig worktree clean`; never `git worktree remove` or manual deletion (destroys symlinks).
- **Kill background servers when done** — stop all `isBackground=true` processes. Run `make kill-stale`; call `browser_cleanup`.
- **Self-review before every push (mandatory gate)** — run `/review` and read every changed file against `.agents/skills/pr-lifecycle/references/common-review-patterns.md` before pushing.
- **Run migrations before `make pc` (mandatory)** — run `db_migration_status` then `db_migrate`. Shell fallback: `pnpm --prefix lib/db-client run db:status` and `db:up`.
- **Validate with seven `pc-*` chunks in order** — `pc-db-prep` → `pc-typecheck` → `pc-format` → `pc-lint` → `pc-workflows` → `pc-test` → `pc-build`. **Cloud and timeout-prone sessions: never `make_run(target: "pc")`** — use `nx_run_pc_chunk` MCP tool instead. See `.agents/skills/workflow-overview/SKILL.md`.
- **CI status and PR activity are surfaced natively** — after pushing, failures and review events arrive as push notifications. ⛔ **Never use `sleep` + polling loops.**
- **Compact every 35 tool calls** — a hook emits `[COMPACT REMINDER]` at every 35th tool call. Run `/compact` immediately then resume.
- **Resolve PR review threads** — call `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` directly.

### Tool Usage (Tier 2)

- **MCP-first, then Make**: always prefer MCP tools over shell commands — `make_run` over `make`, `nx_run`/`nx_run_affected` over `pnpm exec nx`. See `.agents/skills/mcp-first/SKILL.md`.
- **Chip dispatch via `mcp__ccd_session__spawn_task`, never `Agent`** — `mcp__ccd_session__spawn_task` creates a real independent chip session. If unavailable, stop and inform the user.
- **Tool-first for file operations**: use `Glob` (not `find`/`ls`), `Grep` (not `grep`/`rg`), `Read` (not `cat`/`head`/`tail`). For git refs: use `worktree_show_file`.
- **Jira operations** — always call `jira_auth_status` first; use `jira_*` MCP tools if `configured: true`. See `.agents/skills/mcp-first/SKILL.md`.

### Working Approach (Tier 3)

- **Think before coding** — ask when unsure; don't silently pick one interpretation and run with it.
- **Simplicity first** — minimum code; any overengineering shows at a glance.
- **Surgical edits** — only touch what's required; unrelated cleanup belongs in a separate ticket.
- **Goal-driven** — translate fuzzy instructions into verifiable targets before starting.
- **IMPORTANT**: Prefer retrieval-led reasoning — read the actual code, docs, and tool output rather than relying on memorized assumptions.

### Code Quality (Tier 3)

- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging`. Exceptions: `lib/logging/`, `apps/cli/`, `lib/db-client/src/cli/`, `lib/db-client/src/scripts/`, the top-level `scripts/` directory, migration files, and build-time scripts.
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable`. See `.agents/skills/standards/SKILL.md`.
- **E2E tests are hermetic** — never use `route.continue()` in `apps/web-e2e/src/tests/`; use `route.fulfill()`. Exception: `apps/web-e2e/src/integration/tests/` is a live-backend suite.
- **Prefer `.graphql` + codegen over inline `gql`** — define queries in `.graphql` files and import generated hooks from `graphql.generated.ts`.
- **Shared-components-first** — before building UI in `apps/web` or `apps/app`, check `lib/shared-components`; build shared cross-platform components and adapt by viewport — see `.agents/skills/shared-components-first/SKILL.md`.

## Task Completion Signal

A task is complete when **all** of the following are true:

1. `github_view_pr` returns `state: "MERGED"` (or `mergedAt` is populated)
2. Jira ticket is "Done" (usually auto-transitioned by Jira Branch Sync on merge)
3. MCP gap audit has run or was skipped (see `.agents/skills/mcp-first/references/gaps.md`)
4. All tracking tasks are marked completed (`TaskUpdate(taskId: <id>, status: "completed")`)

## PR Flow: Actors, Labels & Author Agent Contract

The canonical reference for who's who in the PR flow, the Label Ownership table, and the Author Agent Contract (`FIX:` / `JUSTIFY:` / `CANNOT-COMPLY:` reply protocol) lives in **[`.agents/skills/pr-lifecycle/SKILL.md`](.agents/skills/pr-lifecycle/SKILL.md)**. Load it whenever you create a PR, reply to review threads, or fix review comments.

**You are the Author Agent.** You write code, open the PR, reply to threads, push fixes, and apply `bot:ready-for-review` after every fix-push. You **never** apply `merge-when-ready` or any maintainer escape-hatch label (`review-bot-override`, `security-review-override`, `merge-to-parent`).

## Workflow

**Process framework**: see `.agents/skills/dev-process/SKILL.md` — pick the entrypoint via `.agents/skills/dev-process/entrypoints/README.md`.

**Operational runbook (Steps 0–16)**: `.agents/skills/workflow-overview/references/ticket-to-merge-spine.md` (environment-neutral ordering + five critical gates + mandatory tracking-task graph). Local binding: `.agents/skills/workflow-overview/SKILL.md`. Cloud binding: `.agents/skills/cloud-agent-mode/SKILL.md`.

## Command Patterns

**Never use `cd <dir> && <command>`** — use flag-based alternatives: `git -C $wt`, `make -C $wt`, `make_run({ target: "test", worktreePath })`, `terraform -chdir=...`. **Subagents** do **not** inherit AGENTS.md context — include tool preference hints when spawning. See `.agents/skills/subagent-templates/SKILL.md`. PR existence check: `github_pr_dashboard(state: "all", limit: 50)` filtered in-context.

## Commands

```bash
make pc             # full pre-commit (lint + typecheck + test + build)
make test           # test changed files
make codegen        # GraphQL codegen
```

Use `scratch/` for ad-hoc output (gitignored). On Windows, write scripts to `scratch/<name>.js` instead of `node -e`.

## Architecture

`apps/` (web, mobile, CLI) · `lambdas/` (GraphQL API, game-selection, stats, etc.) · `lib/` (19+ shared libraries) · `terraform/` · `.agents/skills/`

Multi-sport data model with `sport` discriminator: [`docs/architecture/multi-sport.md`](docs/architecture/multi-sport.md). UI built once in `lib/shared-components` (Tamagui): [`docs/architecture/shared-components.md`](docs/architecture/shared-components.md). Fast path: **`.agents/skills/architecture/FILE-MAP.md`**.

Design system at **https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb** — local agents read the synced bundle under [`docs/design/`](docs/design/) instead. `/sync-designs` (cloud) pulls bundles; `/implement-design LS-####` (local) consumes them. Brand: [`docs/design/brand.md`](docs/design/brand.md). When working in `docs/design/`, load `.agents/skills/design-sync/SKILL.md`.

## Skills

Detailed how-to docs live in `.agents/skills/<name>/SKILL.md`. **Before starting work and whenever your task moves into a new directory, `Read` every skill whose scope matches the files you're touching.**

| Scope                                                | Skill                                     | Load when                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**`                                                 | `.agents/skills/architecture/`            | understanding code layout, cross-project features, import/dependency issues                                                                                                                                                                                                                                               |
| `**`                                                 | `.agents/skills/add-entitlement/`         | adding/gating a premium feature, editing entitlements.ts, requireEntitlement/PremiumGate                                                                                                                                                                                                                                  |
| `**`                                                 | `.agents/skills/cloud-agent-mode/`        | operating in a cloud environment, troubleshooting cloud agent auth                                                                                                                                                                                                                                                        |
| `**`                                                 | `.agents/skills/cloud-teleport/`          | cloud agent reaches AWS/infra/DB capability boundary                                                                                                                                                                                                                                                                      |
| `**`                                                 | `.agents/skills/credentials/`             | before any workflow touching PRs, tickets, cloud resources, or CI runs                                                                                                                                                                                                                                                    |
| `**`                                                 | `.agents/skills/create/`                  | scaffolding a new project, library, lambda, app, MCP server, or skill                                                                                                                                                                                                                                                     |
| `**`                                                 | `.agents/skills/database/`                | writing or applying migrations, running SQL, checking schema, DB connectivity; also load `apply-pr-migrations` when "Verify All Migrations Applied" CI check fails                                                                                                                                                        |
| `**`                                                 | `.agents/skills/debugging/`               | CI pipeline failure, distributed failure, bug report, dev environment issue                                                                                                                                                                                                                                               |
| `**`                                                 | `.agents/skills/dev-process/`             | starting any task — pick entrypoint, evaluate which gates apply                                                                                                                                                                                                                                                           |
| `**`                                                 | `.agents/skills/fix-problem/`             | user reports a bug, unexpected behavior, or something is broken                                                                                                                                                                                                                                                           |
| `**`                                                 | `.agents/skills/jira-rollover/`           | sprint close, syncing bucket epic project properties                                                                                                                                                                                                                                                                      |
| `**`                                                 | `.agents/skills/mcp-first/`               | choosing between shell and MCP tools, MCP server fails to connect, filing/working MCP-gap tickets                                                                                                                                                                                                                         |
| `**`                                                 | `.agents/skills/plan-ticket/`             | scoping new work, eliciting a spec, picking a ticket archetype, Phase 0 recon before implementation; also load `slice` to decompose an epic into child tasks                                                                                                                                                              |
| `**`                                                 | `.agents/skills/pr-lifecycle/`            | creating PRs, self-review, replying to bot reviews, fixing review/CI/conflicts, driving/landing a PR, unblocking stuck PRs, sweeping all open PRs, responding to CI events; also load `sweep-dependabot` for Dependabot PR sweeps                                                                                         |
| `**`                                                 | `.agents/skills/repo-tooling/`            | lint/typecheck/build, GraphQL codegen, package management, Make targets                                                                                                                                                                                                                                                   |
| `**`                                                 | `.agents/skills/secrets-handling/`        | writing, reading, or populating secret values (API keys, tokens, private keys)                                                                                                                                                                                                                                            |
| `**`                                                 | `.agents/skills/skill-authoring/`         | writing or restructuring a SKILL.md file                                                                                                                                                                                                                                                                                  |
| `**`                                                 | `.agents/skills/standards/`               | writing new code, reviewing configs, handling lint errors, codegen policy                                                                                                                                                                                                                                                 |
| `**`                                                 | `.agents/skills/subagent-templates/`      | spawning subagents or dispatching parallel work via chips                                                                                                                                                                                                                                                                 |
| `**`                                                 | `.agents/skills/work-ticket/`             | given a Jira ticket key, implementing it end-to-end autonomously                                                                                                                                                                                                                                                          |
| `**`                                                 | `.agents/skills/workflow-overview/`       | following the step-by-step ticket-to-merge agent runbook (Steps 0-16)                                                                                                                                                                                                                                                     |
| `**`                                                 | `.agents/skills/worktree-workflow/`       | starting any ticket that needs an isolated branch or worktree; branch naming and rebase live as sub-references                                                                                                                                                                                                            |
| `apps/web/**, apps/app/**, lib/shared-components/**` | `.agents/skills/frontend-design/`         | any UI work — components, pages, design system, visual styles                                                                                                                                                                                                                                                             |
| `apps/web/**, apps/app/**, lib/shared-components/**` | `.agents/skills/ui/`                      | choosing brand colors, layout patterns, UI component standards; also load `ui-audit` for a full visual regression check                                                                                                                                                                                                   |
| `apps/web/**, apps/app/**`                           | `.agents/skills/shared-components-first/` | building or reviewing UI in an app directory; also load `promote-shared-components` when moving UI code to lib/shared-components                                                                                                                                                                                          |
| `apps/web-e2e/**, lib/shared-components/**`          | `.agents/skills/testing/`                 | writing, running, or debugging E2E, unit, or integration tests; also load `fix-integration-tests` for failing Playwright integration tests, `read-playwright-report` to analyze HTML test results, `storybook` for Storybook stories; `references/e2e-determinism.md` is the 12-lever checklist for every PR touching E2E |
| `lambdas/**, apps/**, lib/**`                        | `.agents/skills/dev-environment/`         | spinning up local dev services, debugging the full stack; also load `cloudwatch-archaeology` for opaque Lambda failures                                                                                                                                                                                                   |
| `lambdas/**, terraform/**`                           | `.agents/skills/infrastructure/`          | AWS operations, Lambda deployment, cloud infrastructure changes                                                                                                                                                                                                                                                           |
| `terraform/**, .github/workflows/**, lambdas/**`     | `.agents/skills/terraform/`               | adding or modifying any Terraform resource (BEFORE push), running plan/apply locally, or adding a new secret/env var                                                                                                                                                                                                      |
| `apps/cli/**`                                        | `.agents/skills/cli-usage/`               | running CLI commands or performing CLI-based admin tasks                                                                                                                                                                                                                                                                  |

## MCP Servers

See `.agents/skills/mcp-first/SKILL.md` for the full server list, per-server tool mapping, and load-order notes. Always prefer MCP tools over shell commands.
**Database access:** the hosted `legacy-sports-db-admin` server reaches the dev RDS **tunnel-free** via a Cognito bearer and serves `db_query` / `db_migration_status` / `db_migrate`. See `.agents/skills/database/SKILL.md`.
**Pre-flight auth check**: call `auth_check_all` at the start of any workflow requiring GitHub, Jira, AWS, or CI access. If `allAuthenticated: false`, surface the `hint` and stop.
**Mid-session 401 on hosted MCP servers**: OAuth token has expired — prompt the user to re-consent via `/mcp`. Do not fall back to `gh` / `acli` / `curl`. See `.agents/skills/mcp-first/references/diagnostics.md`.

> If a stdio MCP server is missing or timing out, verify `node_modules/.bin/tsx` exists — servers start with `pnpm exec tsx ...` and time out silently if broken. Run `node scripts/modules-pool/link.mjs` then restart.

## Environment

| Context                            | Shell                        | Syntax                                       |
| ---------------------------------- | ---------------------------- | -------------------------------------------- |
| **Bash tool** / CI / cloud agent   | Git Bash / bash              | Unix                                         |
| **`worktree_run`** (local Windows) | Git Bash (fallback: cmd.exe) | Unix preferred (`ls` unavailable in cmd.exe) |
| **User's terminal**                | PowerShell                   | `;` chains, `$env:` vars                     |

- **Local**: Windows — PowerShell — twig for branch management. **Cloud agent**: Ubuntu Linux — bash — no worktrees/twig — Docker PostgreSQL; no AWS. See `.agents/skills/cloud-agent-mode/SKILL.md`.
- Package manager: pnpm 9.12.1 (corepack-enforced — never use npm or yarn)
- Commit format: `type(scope): message` (e.g. `feat(auth): add oauth`). Always include the ticket key in the commit message for Jira linking.
- **`make e2e-auth`** mints (or refreshes) the web-e2e OAuth JWT cached at `~/.legacy-sports/e2e-token.json`. Agents cannot complete the interactive handshake — the human user must run this when no cache exists.
