# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

> **NEVER commit to the `main` branch.** Local sessions: use the **`worktree` checkbox** in the launcher (starts in `.claude/worktrees/<name>/`, branch tracked in UI). Parallel work: `make worktree TICKET=#### DESC=description`. Cloud agents already have an isolated checkout.

## Critical Rules

Rules are grouped by category and tiered by severity. **Tier 1** violations are catastrophic or irreversible. **Tier 2** violations are costly (wasted CI time, stuck PRs, rework cycles). **Tier 3** violations are quality issues caught in review.

### Safety (Tier 1)

- **NEVER commit to the `main` branch** — all commits must be on a feature branch; working in `D:\code\legacy-sports` with HEAD on `main` is forbidden.
- **Never embed secrets in tool calls** — never put raw secret values in `Edit`, `Write`, or `Bash` arguments. See `.agents/skills/secrets-handling/SKILL.md`.
- **One ticket = one worktree = one PR** — never add unrelated changes to an existing branch or worktree. Create a **separate Jira ticket and worktree** for unrelated work.
- **Never run `aws sso login` (or any other auth-generation command)** — `aws sso login`, `gh auth login`, `acli` interactive login, and any OAuth/device-flow command are **user-only** actions. If `auth_check_all` reports a service as not authenticated, or any tool call returns an auth/expired-token error, **stop immediately**, surface the `hint` verbatim, and prompt the user to re-authenticate in their own terminal and restart the session. Do not shell out to refresh credentials, do not retry the failing call hoping it works, do not fall back to `acli`/raw `curl` to bypass the missing token. See `.agents/skills/credentials/SKILL.md`.

### Workflow Discipline (Tier 2)

- **Drive to merge** — work is NOT complete until the PR is **merged**, Jira moves to "Done", the MCP gap audit runs, and all tracking tasks are marked completed. See [Task Completion Signal](#task-completion-signal).
- **Draft is a working state, not an ending state** — mark the PR ready (`github_mark_pr_ready`) the moment implementation and self-review are done. **Never end a turn with a PR in draft.** Draft PRs are skipped by Reviewer (W1), all CI orchestration gated on the bot's review event, and sweep agents. See `.agents/skills/pr-lifecycle/SKILL.md`.
- **Worktree-first**: every ticket runs in its own worktree. Do not rename the local branch — Claude Code caches it at session start and renaming breaks PR detection. Jira links via PR title + commit messages containing `LS-####`. See `.agents/skills/worktree-workflow/SKILL.md`.
- **Claude Code's `isolation: "worktree"` Agent parameter**: creates ephemeral worktrees for subagents. Always prefer MCP tools over raw `git -C` even in ephemeral worktrees.
- **node_modules pool** — never `pnpm install` (or `pnpm add`) straight through a worktree's `node_modules` symlink (it points to an immutable shared pool slot). Use `node scripts/modules-pool/link.mjs` / `make install` to set up or repair. **`pnpm exec nx reset` destroys the pooled symlink** (LS-5242) — always use `make clean-cache` instead. See `.agents/skills/repo-tooling/references/install-packages.md`.
- **Never manually remove worktrees**: always `twig worktree clean` — never `git worktree remove` or manual deletion (destroys symlinks).
- **Kill background servers when done** — stop all `isBackground=true` processes before workflow ends. Run `make kill-stale` to find stale node processes. Call `browser_cleanup` to close Playwright browsers.
- **Resolve PR review threads**: after fixing review comments, call `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` directly — never reach for raw GraphQL or shell without trying this tool first. See `.agents/skills/pr-lifecycle/SKILL.md`.
- **Self-review before every push (mandatory gate)** — after validation passes, run `/review` and read every changed file against `.agents/skills/pr-lifecycle/references/common-review-patterns.md` before pushing. Every Copilot review round costs 30–60 min. See the spine's [self-review-before-push gate](.agents/skills/workflow-overview/references/ticket-to-merge-spine.md) and `.agents/skills/pr-lifecycle/SKILL.md`.
- **Run migrations before `make pc` (mandatory)** — run `db_migration_status` then `db_migrate` before validating. Confirm `Applied N new migrations` or `No new migrations to apply`. Shell fallback: `pnpm --prefix lib/db-client run db:status` and `pnpm --prefix lib/db-client run db:up`. See `/database` skill.
- **Validate with seven `pc-*` chunks in order** — `pc-db-prep` → `pc-typecheck` → `pc-format` → `pc-lint` → `pc-workflows` → `pc-test` → `pc-build` (LS-7906). Update the continuation checkpoint after each chunk; never chain all seven into one call. **Cloud and timeout-prone sessions: never `make_run(target: "pc")`** — the monolithic form exceeds the ~60s transport timeout. **Local shortcut**: `make_run(target: "pc")` is valid only in non-timeout-prone local sessions. Draft PR must exist before validation starts. See `.agents/skills/workflow-overview/references/ticket-to-merge-spine.md#the-sequence`.
- **CI status and PR activity are surfaced natively** — after pushing, failures and review events arrive as push notifications; no polling needed. ⛔ **Never use `sleep` + polling loops.** See `.agents/skills/pr-lifecycle/SKILL.md` Critical Rules 9-11.
- **Compact every 35 tool calls** — a hook emits `[COMPACT REMINDER]` at every 35th tool call. Run `/compact` immediately then resume.

### Tool Usage (Tier 2)

- **MCP-first, then Make**: always prefer MCP tools over shell commands — `make_run` over `make`, `nx_run`/`nx_run_affected` over `pnpm exec nx`. See `.agents/skills/mcp-first/SKILL.md` for the full tool mapping.
- **Chip dispatch via `mcp__ccd_session__spawn_task`, never `Agent`** — `mcp__ccd_session__spawn_task` creates a real independent chip session; `Agent(...)` creates an in-context subagent that cannot own a worktree or drive a PR to merge. If `mcp__ccd_session__spawn_task` is unavailable, stop and inform the user.
- **Tool-first for file operations**: use `Glob` (not `find`/`ls`), `Grep` (not `grep`/`rg`), `Read` (not `cat`/`head`/`tail`). For git refs: use `worktree_show_file` — never `git show ref:path` on Windows. See `.agents/skills/mcp-first/SKILL.md`.
- **Jira operations** — always call `jira_auth_status` first; use `jira_*` MCP tools if `configured: true`, Atlassian plugin as fallback, `acli` as last resort. See `.agents/skills/mcp-first/SKILL.md` for tool mapping, auth routing, Atlassian plugin bug workarounds (LS-3715/LS-3771/LS-3810), and verification patterns.

### Working Approach (Tier 3)

- **Think before coding** — ask when unsure; don't silently pick one interpretation and run with it.
- **Simplicity first** — minimum code; any overengineering shows at a glance.
- **Surgical edits** — only touch what's required; don't fix up neighboring code on the way by. Unrelated cleanup belongs in a separate ticket.
- **Goal-driven** — translate fuzzy instructions into verifiable targets before starting.
- **IMPORTANT**: Prefer retrieval-led reasoning over pre-training-led reasoning — read the actual code, docs, and tool output in this repo rather than relying on memorized assumptions about how it works.

### Code Quality (Tier 3)

- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging`. Exceptions: `lib/logging/`, `apps/cli/`, `lib/db-client/src/cli/`, `lib/db-client/src/scripts/`, the top-level `scripts/` directory, migration files, and build-time scripts.
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable`. See `.agents/skills/standards/SKILL.md`.
- **E2E tests are hermetic** — never use `route.continue()` in `apps/web-e2e/src/tests/`; use `route.fulfill()` for unmatched operations. Exception: `apps/web-e2e/src/integration/tests/` is a live-backend suite where direct API calls are expected. See `.agents/skills/testing/SKILL.md`.
- **Prefer `.graphql` + codegen over inline `gql`** — define queries in `.graphql` files and import generated hooks from `graphql.generated.ts`.
- **Shared-components-first** — before building UI in `apps/web` or `apps/app`, check `lib/shared-components` first. See `.agents/skills/shared-components-first/SKILL.md`.

## Task Completion Signal

A task is complete when **all** of the following are true:

1. `github_view_pr` returns `state: "MERGED"` (or `mergedAt` is populated)
2. Jira ticket is "Done" (usually auto-transitioned by Jira Branch Sync on merge)
3. MCP gap audit has run or was skipped because the session was below the minimum threshold (see `.agents/skills/mcp-gaps/SKILL.md`)
4. All tracking tasks are marked completed (`TaskUpdate(taskId: <id>, status: "completed")`)

If any condition is false, the task is **not done** — keep working. When in doubt, check condition 1 first.

## Role Taxonomy

Each skill's `SKILL.md` frontmatter includes a `role` field (executor, analyst, or orchestrator). See `.agents/ROLES.md` for the full taxonomy and behavioral defaults per role.

## Branch Naming & Jira Linking

Jira links PRs to tickets via **PR title**, **commit messages**, and **branch name** (all scanned independently). For launcher-checkbox sessions, do not rename branches — rely on PR title + commits containing `LS-####`. See `.agents/skills/branch-naming/SKILL.md` for patterns by driver and full rules.

## PR Flow: Actors, Labels & Author Agent Contract

The canonical reference for who's who in the PR flow, the Label Ownership table, and the Author Agent Contract (`FIX:` / `JUSTIFY:` / `CANNOT-COMPLY:` reply protocol) lives in **[`.agents/skills/pr-lifecycle/SKILL.md`](.agents/skills/pr-lifecycle/SKILL.md)**. Load it whenever you create a PR, reply to review threads, or fix review comments.

**You are the Author Agent.** You write code, open the PR, reply to threads, push fixes, and apply `bot:ready-for-review` after every fix-push. You **never** apply `merge-when-ready` or any maintainer escape-hatch label (`review-bot-override`, `security-review-override`, `merge-to-parent`).

## Workflow

**Process framework**: every task funnels through one of 13 entrypoints into a 6-phase shared spine. See `.agents/skills/dev-process/SKILL.md` for the design layer — pick the entrypoint at the start of any task using `.agents/skills/dev-process/entrypoints/README.md`.

**Operational runbook**: the canonical, environment-neutral **Steps 0–16** live in `.agents/skills/workflow-overview/references/ticket-to-merge-spine.md` (with the four critical gates and the mandatory Step 1c tracking-task graph). `.agents/skills/workflow-overview/SKILL.md` is the **local** tool binding for that spine; `.agents/skills/cloud-agent-mode/SKILL.md` is the **cloud** binding. Summary:

0. Epic check → 1. Create/identify ticket → **1b. Planning** → 2. Dependency check → 3. Jira "In Progress" → 4. Worktree setup → 5. node_modules symlink → 6. Work → 7. Code & test → 8. Commit → 9. Rebase → 10. Migrations → 11. seven `pc-*` chunks + self-review → 12. Ship (draft PR → mark ready → bot review → reply threads → Jira "In Review") → 13. Watch PR to merge → 14. MCP gap audit → 15. Complete tracking tasks → 16. Cleanup

For PR creation and thread resolution details, see `.agents/skills/pr-lifecycle/SKILL.md`. For error recovery, see `.agents/skills/workflow-overview/references/error-recovery.md`.

## Risk Classification

Low (single-file, docs, tests: 2-3 min) · Medium (business logic, multi-file, schema: 5-10 min) · High (auth, payments, infra, migrations: 10-15 min) · Critical (production incidents, security, reverts: no time limit). See `.agents/skills/dev-process/gates/risk-tiers.md`; `.agents/skills/planning/SKILL.md` for assessment.

## Command Patterns

**Never use `cd <dir> && <command>`** — use flag-based alternatives: `git -C $wt`, `make -C $wt`, `make_run({ target: "test", worktreePath })`, `worktree_run({ command })`, `terraform -chdir=...`.

## Subagent Tool Preferences

Subagents do **not** inherit AGENTS.md context. Always include tool preference hints when spawning. See `.agents/skills/subagent-templates/SKILL.md` for copy-paste templates.

- **PR existence check**: use `github_pr_dashboard(state: "all", limit: 50)` and filter in-context — never `gh pr list --state all | grep "LS-####"`.
- **Worktree path in Explore prompts**: pass `path:` scoped to the worktree in Explore calls and substitute main-repo prefixes before using paths in `Edit`/`Write`. See `.agents/skills/subagent-templates/SKILL.md`.

## Commands

```bash
make pc             # full pre-commit (lint + typecheck + test + build)
make test           # test changed files
make codegen        # GraphQL codegen
```

Use `scratch/` for ad-hoc output (gitignored). On Windows, write scripts to `scratch/<name>.js` instead of `node -e`.

## Architecture

`apps/` (web, mobile, CLI) · `lambdas/` (GraphQL API, game-selection, stats, etc.) · `lib/` (19+ shared libraries) · `terraform/` · `.agents/skills/`

The codebase supports **multiple sports** (baseball, football) under a single data model with a `sport` discriminator. See **[`docs/architecture/multi-sport.md`](docs/architecture/multi-sport.md)**. UI is built once in `lib/shared-components` (Tamagui) — see **[`docs/architecture/shared-components.md`](docs/architecture/shared-components.md)**.

See `.agents/skills/architecture/SKILL.md` for system overview. Fast path lookup: **`.agents/skills/architecture/FILE-MAP.md`**.

## Design Context

The full design system lives at **https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb**. Local agents cannot fetch this URL — read the synced bundle under [`docs/design/`](docs/design/) instead.

**Design sync process**: `/sync-designs` (cloud) pulls design bundles; `/implement-design LS-####` (local) consumes them. Full process: [`docs/dev-process/design-sync.md`](docs/dev-process/design-sync.md). Operator runbook: [`.agents/skills/design-sync/SKILL.md`](.agents/skills/design-sync/SKILL.md). Brand guidelines: [`docs/design/brand.md`](docs/design/brand.md).

## Skills

Detailed how-to docs live in `.agents/skills/<name>/SKILL.md`. The `description` frontmatter field enables skill auto-discovery. CSV reference data is in `docs/agents/*.csv`.

See [`docs/dev-process/skill-routing.md`](docs/dev-process/skill-routing.md) for the routing design and prose-migration record.

**Before starting work, and again whenever your task moves into a new directory, `Read` every skill whose scope matches the files you're touching.**

| Scope                                                | Skill                                           | Load when                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `**`                                                 | `.agents/skills/architecture/`                  | understanding code layout, cross-project features, import/dependency issues                    |
| `**`                                                 | `.agents/skills/add-entitlement/`               | adding/gating a premium feature, editing entitlements.ts, requireEntitlement/PremiumGate       |
| `**`                                                 | `.agents/skills/branch-naming/`                 | creating branches, first push to remote, naming remote branches                                |
| `**`                                                 | `.agents/skills/ci-event-response/`             | CI check fails, workflow fails, review comment arrives, merge conflict detected                |
| `**`                                                 | `.agents/skills/cloud-agent-mode/`              | operating in a cloud environment, troubleshooting cloud agent auth                             |
| `**`                                                 | `.agents/skills/cloud-teleport/`                | cloud agent reaches AWS/infra/DB capability boundary                                           |
| `**`                                                 | `.agents/skills/credentials/`                   | before any workflow touching PRs, tickets, cloud resources, or CI runs                         |
| `**`                                                 | `.agents/skills/create/`                        | scaffolding a new project, library, lambda, app, MCP server, or skill                          |
| `**`                                                 | `.agents/skills/create-ticket/`                 | creating any Jira ticket — pick the archetype (task, bug, story, QA coverage, epic) + template |
| `**`                                                 | `.agents/skills/database/`                      | writing or applying migrations, running SQL, checking schema, DB connectivity                  |
| `**`                                                 | `.agents/skills/debugging/`                     | CI pipeline failure, distributed failure, bug report, dev environment issue                    |
| `**`                                                 | `.agents/skills/define/`                        | user wants to formalize a spec before implementation starts                                    |
| `**`                                                 | `.agents/skills/dev-process/`                   | starting any task — pick entrypoint, evaluate which gates apply                                |
| `**`                                                 | `.agents/skills/drive-pr/`                      | asked to drive, land, ship, or get a specific PR merged                                        |
| `**`                                                 | `.agents/skills/fix-pr/`                        | "fix PR", "clean up PR #N", multiple unresolved issues on a PR                                 |
| `**`                                                 | `.agents/skills/fix-problem/`                   | user reports a bug, unexpected behavior, or something is broken                                |
| `**`                                                 | `.agents/skills/jira-rollover/`                 | sprint close, syncing bucket epic project properties ⚠ may be unused                           |
| `**`                                                 | `.agents/skills/mcp-diagnostics/`               | MCP server fails to connect, ToolSearch returns empty for known tools                          |
| `**`                                                 | `.agents/skills/mcp-first/`                     | choosing between shell and MCP tools, any Jira/GitHub/CI/DB/AWS operation                      |
| `**`                                                 | `.agents/skills/mcp-gaps/`                      | PR merged (run audit); working through the MCP backlog                                         |
| `**`                                                 | `.agents/skills/open-prs/`                      | sweep all open PRs, rebase/review/label pass across the board                                  |
| `**`                                                 | `.agents/skills/plan-ticket/`                   | planning new work that does not yet have a Jira ticket                                         |
| `**`                                                 | `.agents/skills/planning/`                      | structured planning phase before implementation (Phase 0)                                      |
| `**`                                                 | `.agents/skills/pr-lifecycle/`                  | creating PRs, replying to reviews, fixing review comments, managing PR labels                  |
| `**`                                                 | `.agents/skills/rebase/`                        | rebasing a branch, resolving merge conflicts, updating a branch                                |
| `**`                                                 | `.agents/skills/repo-tooling/`                  | lint/typecheck/build, GraphQL codegen, package management, Make targets                        |
| `**`                                                 | `.agents/skills/secrets-handling/`              | writing, reading, or populating secret values (API keys, tokens, private keys)                 |
| `**`                                                 | `.agents/skills/skill-authoring/`               | writing or restructuring a SKILL.md file                                                       |
| `**`                                                 | `.agents/skills/slice/`                         | decomposing an epic or story into structured child tasks                                       |
| `**`                                                 | `.agents/skills/standards/`                     | writing new code, reviewing configs, handling lint errors, codegen policy                      |
| `**`                                                 | `.agents/skills/subagent-templates/`            | spawning subagents or dispatching parallel work via chips                                      |
| `**`                                                 | `.agents/skills/sweep-dependabot/`              | sweeping, triaging, or unsticking Dependabot PRs                                               |
| `**`                                                 | `.agents/skills/unblock-prs/`                   | stuck PRs, false-positive CI, Expected CI state, merge queue issues                            |
| `**`                                                 | `.agents/skills/work-ticket/`                   | given a Jira ticket key, implementing it end-to-end autonomously                               |
| `**`                                                 | `.agents/skills/workflow-overview/`             | following the step-by-step ticket-to-merge agent runbook (Steps 0-16)                          |
| `**`                                                 | `.agents/skills/worktree-workflow/`             | starting any ticket that needs an isolated branch or worktree                                  |
| `apps/web/**, apps/app/**, lib/shared-components/**` | `.agents/skills/frontend-design/`               | any UI work — components, pages, design system, visual styles                                  |
| `apps/web/**, apps/app/**, lib/shared-components/**` | `.agents/skills/ui/`                            | choosing brand colors, layout patterns, UI component standards                                 |
| `apps/web/**, apps/app/**`                           | `.agents/skills/shared-components-first/`       | building or reviewing UI in an app directory                                                   |
| `apps/web/**, apps/app/**`                           | `.agents/skills/ui-audit/`                      | full UI audit, visual regression check, design compliance sweep                                |
| `apps/web/**, apps/app/**`                           | `.agents/skills/promote-shared-components/`     | moving UI code from an app to lib/shared-components                                            |
| `apps/web-e2e/**`                                    | `.agents/skills/testing/`                       | writing, running, or debugging E2E, unit, or integration tests                                 |
| `apps/web-e2e/**`                                    | `.agents/skills/fix-integration-tests/`         | fixing a failing Playwright integration test                                                   |
| `apps/web-e2e/**`                                    | `.agents/skills/read-playwright-report/`        | reading or analyzing Playwright HTML test results                                              |
| `lib/shared-components/**`                           | `.agents/skills/storybook/`                     | adding or running Storybook stories, writing interaction tests                                 |
| `lambdas/**`                                         | `.agents/skills/cloudwatch-archaeology/`        | debugging opaque distributed or Lambda failures (test stdout is misleading)                    |
| `lambdas/**, apps/**, lib/**`                        | `.agents/skills/dev-environment/`               | spinning up local dev services, debugging the full stack                                       |
| `lambdas/**, terraform/**`                           | `.agents/skills/infrastructure/`                | AWS operations, Lambda deployment, cloud infrastructure changes                                |
| `terraform/**`                                       | `.agents/skills/terraform-permission-planning/` | adding or modifying any Terraform resource — BEFORE push                                       |
| `terraform/**`                                       | `.agents/skills/terraform-local-apply/`         | running terraform plan/apply locally against AWS dev                                           |
| `terraform/**, .github/workflows/**, lambdas/**`     | `.agents/skills/add-secret-or-env-var/`         | adding any new secret or environment variable to the project                                   |
| `lib/db-client/**, lambdas/**`                       | `.agents/skills/apply-pr-migrations/`           | "Verify All Migrations Applied" CI check failing, `CI: Migration` label                        |
| `apps/cli/**`                                        | `.agents/skills/cli-usage/`                     | running CLI commands or performing CLI-based admin tasks                                       |
| `docs/design/**`                                     | `.agents/skills/design-sync/`                   | `/sync-designs` (cloud) or `/implement-design` (local), design-to-code pipeline                |

**Writing or editing a skill**: load `.agents/skills/skill-authoring/SKILL.md` before drafting or restructuring any `SKILL.md`.

**Process framework**: `.agents/skills/dev-process/SKILL.md` is the canonical map of how work flows through this codebase. Load it at the start of any task that doesn't fit the dominant new-feature path.

**E2E/integration determinism**: `.agents/skills/testing/references/e2e-determinism.md` is the 12-lever checklist that gates every PR touching E2E or integration tests. Flake is a P1 bug.

## MCP Servers

See `.agents/skills/mcp-first/SKILL.md` for the full server list, per-server tool mapping, and load-order notes. Always prefer MCP tools over shell commands.

**Database access:** the hosted `legacy-sports-db-admin` server is the DB MCP server — it reaches the dev RDS **tunnel-free** (no SSM tunnel, no live AWS SSO) via a Cognito `mcp/db` bearer and serves `db_query` / `db_migration_status` / `db_migrate`. Local Docker Postgres is driven via shell for offline ops. See `.agents/skills/database/SKILL.md`.

**Which environment am I in?** See [`docs/dev-process/llm-environments.md`](docs/dev-process/llm-environments.md) for the agent environment matrix and auth details.

**Pre-flight auth check**: call `auth_check_all` at the start of any workflow that requires GitHub, Jira, AWS, or CI access. If `allAuthenticated: false`, surface the `hint` and stop. See `.agents/skills/credentials/SKILL.md`.

**Mid-session 401 on hosted MCP servers**: OAuth token has expired. Stop, prompt the user to re-consent via `/mcp`, and wait. Do not fall back to `gh` / `acli` / `curl`. See `.agents/skills/mcp-diagnostics/SKILL.md`.

> If a stdio MCP server is missing or timing out, check that `node_modules/.bin/tsx` exists first — servers start with `pnpm exec tsx ...` and time out silently if the symlink is broken. Run `node scripts/modules-pool/link.mjs` to repair, then restart the session. See `.agents/skills/mcp-diagnostics/SKILL.md`.

## Cloud Agent Mode

When running as a cloud coding agent (Claude Code on the web, Copilot Coding Agent): no worktrees/twig/acli, work directly in repo root; Linux/bash; Docker PostgreSQL; no AWS access. See `.agents/skills/cloud-agent-mode/SKILL.md` for the complete cloud workflow.

## Shell Resolution

Different contexts use different shells. Use the correct syntax for each:

| Context                                    | Shell                        | Syntax         | Notes                                                                              |
| ------------------------------------------ | ---------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| **Bash tool** (Claude Code, local Windows) | Git Bash                     | Unix           | Default shell for local Bash tool calls                                            |
| **`worktree_run`** (local Windows)         | Git Bash (fallback: cmd.exe) | Unix preferred | Avoid PowerShell-specific syntax; `ls` unavailable in cmd.exe fallback — use `dir` |
| **Cloud agent shell**                      | bash                         | Unix           | Cloud coding agents run on Linux; do not assume Git Bash                           |
| **User's terminal**                        | PowerShell                   | PowerShell     | `;` to chain, `$env:` for vars                                                     |
| **CI** (GitHub Actions)                    | bash                         | Unix           | Standard POSIX                                                                     |

When writing commands for the local Bash tool, always use Unix syntax. Cloud agents also use Unix `bash` syntax on Linux. When giving the user commands to run in their terminal, use PowerShell syntax.

## Environment Notes

- **Local**: Windows - PowerShell (`;` to chain commands, `$env:` for vars) - twig for branch management
- **Cloud**: Ubuntu Linux - bash - no worktrees/twig - Docker PostgreSQL (no AWS access)
- Package manager: pnpm 9.12.1 (enforced via corepack — never use npm or yarn)
- Commit format: `type(scope): message` (e.g. `feat(auth): add oauth`). Always include the ticket key in the commit message for Jira linking.
- **Always pass commit messages inline**: use `git commit -m "$(cat <<'EOF'\n...\nEOF\n)"`. Running `git commit` without `-m` opens `$EDITOR` and blocks the agent session. Prefer `worktree_commit({ message: "..." })` when available.
- **`jq` is NOT available on Windows** — use Python with explicit UTF-8 encoding for JSON parsing.
- **`make e2e-auth`** mints (or refreshes) the web-e2e OAuth JWT cached at `~/.legacy-sports/e2e-token.json`. Agents cannot complete the interactive handshake — the human user must run this when no cache exists. CI is unaffected (`E2E_AUTH_MODE=ci`).
