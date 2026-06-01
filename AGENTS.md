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

- **Drive to merge** — work is NOT complete until the PR is **merged**, Jira moves to "Done", the MCP gap audit runs, and any tracking tasks are marked completed. Stopping after `make pc`, after `github_create_pr`, or while CI/reviews are still pending are all common agent failure modes. See [Task Completion Signal](#task-completion-signal) for the mechanically checkable definition.
- **Draft is a working state, not an ending state** — `draft: true` is for in-progress work (push commits freely, run CI, iterate). The moment implementation and self-review are done, call `github_mark_pr_ready(number: <PR#>)`. **Never end a turn, end a task, or hand off with a PR still in draft.** Draft PRs are skipped by Reviewer (W1) (which checks `draft == false`), skipped by all CI orchestration gated on the bot's review event, and skipped by sweep agents — a forgotten draft sits forever and nobody picks it up. If you genuinely cannot mark it ready (e.g. blocked on a question for the user), say so explicitly and surface the blocker; do not silently leave the PR in draft.
- **Worktree-first**: every ticket runs in its own worktree. Native ephemeral (launcher checkbox) is default — **do not rename the local branch** (Claude Code caches it at session start; renaming breaks PR detection). Push as-is; Jira links via PR title + commit messages containing `LS-####`. Sibling worktrees (`make_worktree_create`) for parallel work only. Re-attach existing branches with `worktree_attach`. See `.agents/skills/worktree-workflow/SKILL.md`.
- **Claude Code's `isolation: "worktree"` Agent parameter** (Agent tool only): creates ephemeral worktrees for subagents. MCP tools work inside them — `worktree_set(key: "<absolute .claude/worktrees/... path>")` accepts absolute paths. Always prefer MCP tools over raw `git -C` even in ephemeral worktrees.
- **node_modules pool** — never `pnpm install` (or `pnpm add`) straight through a worktree's `node_modules`: it is a directory symlink into an **immutable** content-addressable pool slot (`<main>/.modules-pool/<sha256(pnpm-lock.yaml)>/node_modules`), and writing through it would mutate a slot other worktrees may be running. Set up or repair a worktree with `node scripts/modules-pool/link.mjs` (native flow), `make modules-link WT=<path>`, or `make_wt_setup` (sibling flow) — these hash the lockfile, materialise the slot on a miss (`pnpm install --frozen-lockfile` → atomic publish), and create the directory symlink. **Never use `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, raw `mklink /J`, or any manual junction command to recreate `node_modules`** — only the resolver handles `.modules.yaml` path consistency and junction→symlink conversion; manual commands cause Nx graph failures. For a broken/missing slot: re-run `node scripts/modules-pool/link.mjs` from the worktree root, then verify with `test -d node_modules/nx && echo ok || echo EMPTY`. Because each consumer links to the slot matching _its own_ lockfile and slots are immutable, `make install` can no longer EPERM-fail or change packages out from under another worktree — but directory symlinks now require Windows Developer Mode (no independent-install fallback). To add packages in a worktree: remove symlink → `pnpm add -w <pkg>` → `make install` (materialises and links the new slot). See `.agents/skills/repo-tooling/references/install-packages.md` for the full procedure.
- **Never manually remove worktrees**: always `twig worktree clean` — never `git worktree remove` or manual deletion (destroys symlinks).
- **Kill background servers when done** — stop all `isBackground=true` processes before workflow ends. Run `make kill-stale` to find stale node processes. Call `browser_cleanup` to close Playwright browsers.
- **Resolve PR review threads**: after fixing review comments, call `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` directly. Never reach for raw GraphQL mutations or shell commands without first invoking this tool and receiving a connection error or tool-not-found response — assuming it is unavailable without trying is not acceptable. See `.agents/skills/pr-lifecycle/SKILL.md`.
- **Self-review before every push (mandatory gate)** — after `make pc` passes and before `worktree_push()`, run `/review` (or the self-review steps in `.agents/skills/pr-lifecycle/references/self-review.md`). Read every changed file in full, check against all patterns in `.agents/skills/pr-lifecycle/references/common-review-patterns.md` (the "CI / Reviewer Infrastructure Recovery Recipes" section at the bottom also covers `SHA Sanity Check` loops and `Verify All Migrations Applied` failures), and fix issues directly. Every Copilot review round costs 30–60 min of agent time — a thorough self-review eliminates most of them. Do NOT push until self-review is complete. See Step 11b of the [workflow](#workflow).
- **Run migrations before `make pc` (mandatory)** — always run `db_migration_status(worktreePath: "<wt>")` then `db_migrate(worktreePath: "<wt>")` before validating, even if you believe no migrations were added. Confirm the response shows `"applied": N` or `Applied N new migrations` / `No new migrations to apply`. **⛔ Never claim you cannot run migrations** — if a tool fails, diagnose the root cause (Docker not running, `DATABASE_URL` unset) and retry. Shell fallback: `pnpm --prefix lib/db-client run db:status` and `pnpm --prefix lib/db-client run db:up`. See `/database` skill for troubleshooting.
- **`make pc` is the validation command — never substitute individual targets** — always call `make_run(target: "pc")` to validate; never chain `format` → `lint` → `typecheck` separately. `make pc` handles formatter auto-commits internally. If it fails, read the `steps[]` JSON, fix the failing step, then re-run `make_run(target: "pc")`. See workflow Step 11.
- **CI status and PR activity are surfaced natively by Claude Code** — no wait tools needed. After pushing, Claude Code automatically surfaces CI failures and review events **as push notifications** — no polling is ever needed. After marking a PR ready, simply continue into the watch step and handle events as they arrive.
  - **⛔ Never use `sleep` + polling loops** — not `sleep N && gh pr view --json statusCheckRollup`, not `sleep N && gh run view`, not repeated `ci_view_run` calls. This pattern was observed burning 1–2M tokens in a single session for a one-line change. Claude Code's native event streaming works regardless of which MCP servers are connected — polling never provides earlier signal than the push notification.
  - `ci_list_runs`, `ci_view_run`, and `github_view_pr` are ONE-SHOT snapshots for targeted lookups (e.g. fetching a `runId` after a failure event arrives). Never call them in a loop.
  - See `.agents/skills/pr-lifecycle/SKILL.md` Critical Rule #9 and #11 for the full antipattern list.
- **Compact every 35 tool calls** — a hook emits `[COMPACT REMINDER]` at every 35th tool call. When you see it, run `/compact` immediately then resume. Context bloat compounds quickly; compacting is always safe and recoverable.

### Tool Usage (Tier 2)

- **MCP-first, then Make**: always prefer MCP tools over shell commands — `make_run` over `make`, `nx_run`/`nx_run_affected` over `pnpm exec nx`. Shell equivalents are fallbacks only. See `.agents/skills/mcp-first/SKILL.md` for the full tool mapping and substitution table.
- **Chip dispatch via `mcp__ccd_session__spawn_task`, never `Agent`** — when any skill (work-ticket, sweep-prs, sweep-dependabot, etc.) needs to spawn an independent agent session for a child ticket or follow-up, `mcp__ccd_session__spawn_task` is the **only** correct tool. The `Agent(...)` tool creates an **in-context subagent** that shares the parent's context window; it cannot create its own worktree, cannot drive a PR to merge independently, and does not produce a visible chip in the UI. Using `Agent(...)` instead of `mcp__ccd_session__spawn_task(...)` is not a fallback — it is a categorically different operation that will not produce the correct result. If `mcp__ccd_session__spawn_task` is unavailable (ToolSearch returns no result), stop and inform the user rather than substituting the `Agent` tool.
- **Tool-first for file operations**: use `Glob` (not `find`/`ls` — `ls <dir>` → `Glob(pattern: "*", path: "<dir>")`), `Grep` (not `grep`/`rg`), and `Read` (not `cat`/`head`/`tail`). To read the tail of a file, use `Read(file_path: "...", offset: <approx_line>, limit: N)` — estimate the offset from file size via `worktree_file_info`, or use a large offset for persisted output files; for small files, read in full with no offset. `Grep` works on single files and directories alike — common Bash grep patterns map directly: `grep -n "pattern" file` → `Grep(pattern: "pattern", path: "file", output_mode: "content")`; `grep -rn "pattern" dir/` → `Grep(pattern: "pattern", path: "dir", output_mode: "content")` (line numbers included by default in content mode; the `-r` and `-n` flags are implicit); `grep -i "pattern" file` → `Grep(pattern: "pattern", path: "file", "-i": true, output_mode: "content")`; multi-pattern `grep -n "pat1\|pat2" file` → `Grep(pattern: "pat1|pat2", path: "file", output_mode: "content")` (ripgrep uses `|` not `\|` for alternation). For reading files at git refs: use `worktree_show_file` for any locally-available ref (HEAD, SHA, local branch names, tags, remote-tracking branches like `origin/main`, and special refs `FETCH_HEAD`/`ORIG_HEAD`/`REBASE_HEAD`) and `worktree_show_remote` when you need to auto-fetch a remote branch first. **Never use `git show ref:path` shell commands on Windows** — colon-separator quoting fails in bash; `worktree_show_file` uses `execFileSync` and works cross-platform. During rebase conflict resolution, use `worktree_show_file({ ref: "origin/main", path: "..." })` to read the base branch version before deciding which side to keep. See `.agents/skills/mcp-first/SKILL.md` for the complete substitution table.
- **Jira — auth-aware routing**: call `jira_auth_status` first. If `configured: true`, use custom MCP tools (`jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`). If `configured: false` or API calls fail, fall back to the Atlassian plugin (`mcp__claude_ai_Atlassian__*`, cloud ID `fb294606-6c8f-4b52-9a41-11fe45b77528`). Only use `acli` as a **last resort** if both the Jira MCP server and the Atlassian plugin are confirmed unavailable or unusable for the specific operation (e.g. a known plugin bug that persists after retrying). **The `legacy-sports-jira` MCP server is independent of the `worktree` MCP server** — never skip to `acli` just because `worktree_*` tools aren't loaded; check `jira_auth_status` first regardless of which other MCP servers are available. Fallback order: `jira_*` MCP → Atlassian plugin → `acli` CLI. **Exception — native ephemeral worktree sessions** (`.claude/worktrees/<name>/`): `legacy-sports-jira` is registered in `.mcp.json` but requires the `MCP_JIRA_URL` environment variable to connect (supplied via the main worktree's `.env` file — worktrees symlink back to it, but freshly-created worktrees may not yet have it in scope). When `MCP_JIRA_URL` is unset the server won't connect and `jira_auth_status` will not be available as a tool. If `jira_auth_status` is not in scope, use the Atlassian plugin (`mcp__claude_ai_Atlassian__*`). Caution: the Atlassian plugin has known encoding bugs for `transitionJiraIssue` and `createJiraIssue` — see the **`transitionJiraIssue`/`createJiraIssue` Atlassian plugin bug** bullet below.
- **Jira — listing epic/story children**: always use `jira_list_children(key: "LS-####")` — never `searchJiraIssuesUsingJql` with `parent = LS-####`. Raw JQL returns verbose markdown-formatted output that overflows the MCP context limit (~192K chars for 50 results); `jira_list_children` returns compact structured JSON with pagination support and stays well under the limit. See `.agents/skills/mcp-first/SKILL.md` for the full Jira tool mapping.
- **Jira — JQL search**: use `jira_search` instead of `searchJiraIssuesUsingJql` for any JQL query. The Atlassian plugin's search tool returns ~3.8 KB per issue (~190 KB for 50 results) due to metadata envelope overhead (expand URLs, self links, avatar URLs, statusCategory objects). **The `fields` filtering parameter does NOT reduce payload size** — the Atlassian plugin ignores field selection server-side and always returns full issue metadata (LS-3569). `jira_search` returns compact structured JSON with only the fields agents need; use `compact: true` for large result sets to get `{ issues: [{key, summary, status}], nextPageToken? }` (typically under 2 KB for 50 issues). When the response includes `nextPageToken`, pass it as `pageToken` in the next call to fetch the next page. **If you must fall back to `searchJiraIssuesUsingJql`** (e.g. the custom Jira server is unavailable), cap `maxResults` at 5 — the `fields` param provides no relief, so 50 results will always overflow.
- **Jira — workflow transitions**: use `jira_get_transitions(key: "LS-####")` to list available transitions — never `mcp__*__getTransitionsForJiraIssue` (the Atlassian plugin version has a known bug where it can return full issue data for a different issue instead of the transitions array). `jira_get_transitions` calls the Jira REST API directly and returns `[{id, name, to: {name, statusCategory}}]`.
- **Jira — `getJiraIssue` Atlassian plugin bug**: the Atlassian plugin's `getJiraIssue` tool is known to return the parent epic's children list instead of the requested single issue (LS-3715, related: LS-3710). **Never use `mcp__*__getJiraIssue` to fetch a single ticket.** When the Atlassian plugin is your active Jira interface (worktree sessions where `jira_auth_status` is unavailable, or cloud sessions), use `searchJiraIssuesUsingJql` with `jql: "key = LS-XXXX"` and `maxResults: 1` instead. The custom `jira_view` MCP tool is unaffected by this bug.
- **Jira — `transitionJiraIssue`/`createJiraIssue` Atlassian plugin bug**: both tools reject nested object parameters (`transition: { id }` and `additional_fields`) with "expected object, received string" during a cold-start window (LS-3771). **Mitigation for transitions**: retry once after any other successful plugin call; if that retry still fails — in a **local session** fall through to `acli jira workitem transition --key LS-#### --status "<Status>" --yes`; in a **cloud session** use `jira_transition` from the custom MCP server if available, otherwise transition manually in the Jira UI. **Mitigation for creates with parent**: use `jira_create_ticket({ summary: "...", parent: "LS-####" })` (custom server) when available — it accepts `parent` natively and is unaffected by this bug. If the custom server is unavailable, create the ticket without parent then set it via `editJiraIssue({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", issueIdOrKey: "LS-CHILD", fields: { parent: { key: "LS-PARENT" } } })` — the Atlassian plugin's `editJiraIssue` uses `fields: { additionalProperties: {} }` and is not affected by the cold-start encoding bug. See `.agents/skills/cloud-agent-mode/SKILL.md` Quirk 2 for the full diagnosis.
- **Jira — `transitionJiraIssue` Atlassian plugin response body bug**: the Atlassian plugin's `transitionJiraIssue` tool is known to return data for a different issue in its response body — the returned `key`/`id` will not match the requested issue key (sometimes off-by-one in the key sequence) (LS-3810). **The transition itself succeeds**, but the response body cannot be trusted. **Always re-verify** by calling `searchJiraIssuesUsingJql` with `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"`, `jql: "key = LS-XXXX"`, `maxResults: 1`, and `fields: ["status"]` after calling `transitionJiraIssue` via the Atlassian plugin; confirm `issues[0].key` matches the requested key and check `issues[0].fields.status.name` to verify the transition succeeded. The custom `jira_transition` MCP tool returns reliable JSON including `success`, `key`, and `status`, plus optional fields such as `warnings` or `cascadedSubtasks`, and is not affected by this bug.

### Working Approach (Tier 3)

- **Think before coding** — ask when unsure; don't silently pick one interpretation and run with it.
- **Simplicity first** — minimum code; any overengineering shows at a glance.
- **Surgical edits** — only touch what's required; don't fix up neighboring code on the way by. Unrelated cleanup belongs in a separate ticket (see "One ticket = one worktree = one PR").
- **Goal-driven** — translate fuzzy instructions into verifiable targets before starting.

### Code Quality (Tier 3)

- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging`. Exceptions: `lib/logging/`, `apps/cli/`, `lib/db-client/src/cli/`, `lib/db-client/src/scripts/`, the top-level `scripts/` directory, migration files, and build-time scripts. (The `db-client` CLI/script exceptions match the `no-console: off` override already configured in `lib/db-client/.eslintrc.json`; those tools print user-facing output that must be copy-paste-clean without log prefixes. Top-level `scripts/` are exempt because many run before `node_modules` exists or outside the workspace dependency graph and therefore cannot import `@legacy-sports/*` — see [`scripts/README.md`](scripts/README.md) for when an operational task should be an `apps/cli` command instead of a script.)
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable` (see `.agents/skills/standards/SKILL.md`)
- **E2E tests are hermetic** — never use `route.continue()` in `apps/web-e2e/src/tests/`. Use `route.fulfill()` for unmatched operations. **Exception**: `apps/web-e2e/src/integration/tests/` is a live-backend integration suite (config: `playwright.integration.config.ts`, `baseURL: api.legacy-fantasy.com`) — direct API calls via `page.request` are expected there and are not hermeticity violations. See `.agents/skills/testing/SKILL.md`.
- **Prefer `.graphql` + codegen over inline `gql`** — for new code in `apps/web` and `lib/shared-components`, define queries in `.graphql` files and import generated hooks from `graphql.generated.ts`.

## Task Completion Signal

A task is complete when **all** of the following are true:

1. `github_view_pr` returns `state: "MERGED"` (or `mergedAt` is populated)
2. Jira ticket is "Done" (usually auto-transitioned by Jira Branch Sync on merge)
3. MCP gap audit has run or was skipped because the session was below the minimum threshold (see `.agents/skills/mcp-gaps/SKILL.md`)
4. All tracking tasks are marked completed (`TaskUpdate(taskId: <id>, status: "completed")`)

If any condition is false, the task is **not done** — keep working. When in doubt, check condition 1 first.

## Role Taxonomy

Each skill's `SKILL.md` frontmatter includes a `role` field (executor, analyst, or orchestrator) that defines its behavioral profile — error handling, output style, and creativity level. See `.agents/ROLES.md` for the full taxonomy and behavioral defaults per role.

## Branch Naming & Jira Linking

Jira's GitHub integration links PRs to tickets via **PR title**, **commit messages**, and **branch name** (all scanned independently). For Claude Code launcher-checkbox sessions, do **not** rename branches or use `remoteBranch` overrides — rely on PR title + commits containing `LS-####`. See `.agents/skills/branch-naming/SKILL.md` for patterns by driver and full rules.

## PR Flow: Actors, Labels & Author Agent Contract

The canonical reference for **who's who in the PR flow** (Author Agent vs. Reviewer Bot vs. Copilot vs. Merge Queue vs. CI Orchestrator vs. Maintainer), the **Label Ownership** table (which actor applies which label), and the **Author Agent Contract** — the cycle-by-cycle `FIX:` / `JUSTIFY:` / `CANNOT-COMPLY:` reply protocol the Reviewer Bot enforces — now lives in **[`.agents/skills/pr-lifecycle/SKILL.md`](.agents/skills/pr-lifecycle/SKILL.md)** (sections "Who's Who in the PR Flow" and "Author Agent Contract (Bot-PR Flow)"). **Load that skill whenever you create a PR, reply to review threads, or fix review comments** — it is the source of truth for the bot-reply format, and a malformed reply costs a full review cycle.

The one fact to keep in working memory without loading the skill: **you are the Author Agent.** You write code, open the PR, reply to threads, push fixes, and apply `bot:ready-for-review` after every fix-push. You **never** apply `merge-when-ready` (Reviewer Bot owns it) or any maintainer escape-hatch label (`review-bot-override`, `security-review-override`, `merge-to-parent`).

## Workflow

**Process framework**: every task funnels through one of 13 entrypoints into a 6-phase shared spine. See `.agents/skills/dev-process/SKILL.md` for the design layer — _which_ entrypoint applies, _which_ gates apply, _which_ artifacts (RFC, ADR, postmortem, continuation, test-plan, repro) are required. Pick the entrypoint at the start of any task using `.agents/skills/dev-process/entrypoints/README.md`.

**Operational runbook (new-feature entrypoint, the dominant path)**: follow the **Agent Workflow Checklist (Steps 0-16)** in `.agents/skills/workflow-overview/SKILL.md` — single source of truth for procedure. Summary:

0. Epic check (Parent Dispatch Mode — **bucket epics auto-batch-dispatch chips for all unblocked To Do descendants; other epics ask user before claiming any child**) → 1. Create/identify ticket → **1b. Planning phase** → 2. Dependency check → 3. Jira "In Progress" → 4. Worktree setup → 5. node_modules symlink → 6. Work in worktree → 7. Code & test → 8. Commit → 9. Rebase → 10. Migrations → 11. `make pc` + self-review → 12. Ship (draft PR → mark ready → bot review → reply threads → Jira "In Review") → 13. Watch PR to merge → 14. MCP gap audit → 15. Complete tracking tasks → 16. Cleanup

For PR creation, review fixing, and thread resolution details, see `.agents/skills/pr-lifecycle/SKILL.md`. For error recovery during any step, see `.agents/skills/workflow-overview/references/error-recovery.md`.

**Other entrypoints** (incident, security, bug-investigation, refactor, dependency-upgrade, migration, docs-only, inherited-pr, spike, experimentation, revert, CI flake): see `.agents/skills/dev-process/entrypoints/`. Each has its own per-phase notes layered on top of the workflow-overview substrate.

## Risk Classification

Low (single-file, docs, tests: 2-3 min) · Medium (business logic, multi-file, schema: 5-10 min) · High (auth, payments, infra, migrations: 10-15 min) · Critical (production incidents, security, reverts: no time limit). See `.agents/skills/dev-process/gates/risk-tiers.md` for the full decision tree and per-tier requirements; `.agents/skills/planning/SKILL.md` for assessment in practice.

## Command Patterns

**Never use `cd <dir> && <command>`** — use flag-based alternatives: `git -C $wt`, `make -C $wt`, `make_run({ target: "test", worktreePath: "/absolute/path/to/worktree" })`, `worktree_run({ command: "pnpm exec nx test my-app" })`, `terraform -chdir=...`.

## Subagent Tool Preferences

Subagents do **not** inherit AGENTS.md context. Always include tool preference hints when spawning subagents. See `.agents/skills/subagent-templates/SKILL.md` for copy-paste templates covering Explore agents, git operations, PR sweeps, MCP server code, work subagents, and parent-agent recovery.

- **PR existence check**: to check whether a PR already exists for a given ticket key (e.g., while claiming a ticket or deciding whether to create a PR), use `github_pr_dashboard(state: "all", limit: 50)` and filter by ticket key in-context — never `gh pr list --state all | grep "LS-####"`. Include this hint in any subagent prompt that may need to verify PR existence before acting.

- **Worktree path in Explore prompts (mandatory when in a worktree session)**: Explore subagents default to scanning from the main repo root (`D:\code\legacy-sports`) and return main-repo absolute paths (e.g. `/d/code/legacy-sports/tools/mcp/worktree-server/src/index.ts`). If the parent agent then passes those paths to `Edit`/`Write`, changes land in the **main repo**, not the active worktree — and `git status` on the worktree shows clean. To prevent this:
  1. **Pass `path:` scoped to the worktree** in Explore prompts: `Glob(pattern: "**/*.ts", path: "<worktree-path>")` and `Read(file_path: "<worktree-path>/...")`. Include the worktree path in the prompt so the subagent uses it as the search root.
  2. **Substitute paths** received from any Explore subagent before using them in `Edit`/`Write`: replace the main-repo prefix (`D:\code\legacy-sports\` / `/d/code/legacy-sports/`) with the worktree path (e.g. `D:\code\legacy-sports\.claude\worktrees\<name>\`). Never pass raw Explore-returned paths to `Edit`/`Write` without verifying which working tree they belong to.

## Commands

```bash
make pc             # full pre-commit (lint + typecheck + test + build)
make test           # test changed files
make codegen        # GraphQL codegen
```

Use `scratch/` for ad-hoc output (gitignored). On Windows, write scripts to `scratch/<name>.js` instead of `node -e`.

## Architecture

`apps/` (web, mobile, CLI) · `lambdas/` (GraphQL API, game-selection, stats, etc.) · `lib/` (19+ shared libraries) · `terraform/` · `.agents/skills/`

The codebase supports **multiple sports** (baseball, football) under a single data model. Every league and player carries a `sport` discriminator (`'baseball' | 'football'`). Sport-specific stat tables, scoring rules, and position configs are gated on this field. See **[`docs/architecture/multi-sport.md`](docs/architecture/multi-sport.md)** for the full multi-sport design and [how to add a third sport](docs/architecture/multi-sport.md#how-to-add-a-third-sport).

See `.agents/skills/architecture/SKILL.md` for system overview. For a fast capability → file path lookup (use before Glob sweeps): **`.agents/skills/architecture/FILE-MAP.md`**.

## Design Context

The full design system lives at **https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb**. **Local agents cannot fetch this URL** (returns 403); only cloud Claude Code Web sessions can. For local work, read the synced bundle under [`docs/design/`](docs/design/) — it's the same content version-controlled in the repo.

**Design sync process**: synced bundles are pulled in by the `/sync-designs` cloud agent (one Jira ticket per changed design) and consumed by `/implement-design LS-####` locally. Full process: [`docs/dev-process/design-sync.md`](docs/dev-process/design-sync.md). Operator runbook: [`.agents/skills/design-sync/SKILL.md`](.agents/skills/design-sync/SKILL.md).

Key brand guidelines are summarized below for reference.

### Users

Fantasy sports players (25–45) who are league commissioners and active participants in baseball and football leagues. They use the app nights and evenings — often while watching live games. This is a passion and ritual, not a utility. They are competitive, data-obsessive, and have deep league loyalty.

**Emotional goal**: anticipation and excitement — the feeling right before draft picks start, when everything feels possible.

### Brand Personality

**Nostalgic, sporty, professional.** The confident voice of a seasoned beat reporter who still gets excited every Opening Day. Not flashy, not corporate, not casual. Heritage details (aged gold, deep navy) are earned — they appear at meaningful moments, not as wallpaper.

**Anti-reference**: Yahoo Sports — blocky, no craft, information dumped in uniform card grids. Every screen should have an editorial point of view.

### Typography

- **Display / Headings**: Big Shoulders Display (condensed grotesque — scoreboard, pennant, vintage baseball program energy)
- **Body / UI**: Literata (reading-optimized, editorial warmth — not a tech tool font)
- **Data**: tabular figures (`font-variant-numeric: tabular-nums`) for all statistics; numbers in columns must align on the decimal
- **Scale**: fixed `rem` steps for app/dashboard UI; fluid `clamp()` only for marketing/landing pages
- **Never use**: Inter, Playfair Display, Syne, or any font from the standard AI design reflex list

### Color Application Rules

- **Backgrounds**: layer `#0A0F1A` → `#0D1526` → `#111B2F` → `#16223A` (page → subtle → panel → elevated)
- **Accents** (use sparingly — these are earned moments, not decoration):
  - Heritage gold `#C5A55A` — match results, wins, trophy states
  - Seam red `#C41E3A` — critical alerts, losing states, action required
  - Deep navy `#1B3A5C` — primary interactive (buttons, selected states)
- **Banned patterns**:
  - No `border-left` / `border-right` accent stripes wider than 1px on cards or callouts
  - No gradient text (`background-clip: text` with a gradient)
  - No cyan/purple/neon glow accents

### Navigation & Motion

- **Route transitions must have directional meaning**: drill-down slides in from right; back slides out to left; tab switches crossfade (parallel, not hierarchical)
- **Timing**: navigation 280–320ms ease-out-quart; micro-interactions 120–150ms
- **Animate only transform and opacity** — never width, height, padding, or margin
- **Honor `prefers-reduced-motion`**: crossfades only, no positional movement

### Layout Principles

- **Progressive disclosure**: surface what matters now; hide secondary navigation behind deliberate action
- **Editorial hierarchy**: not everything is equal weight — a standings table and a player card are different, treat them differently
- **No generic card grids**: not every piece of content belongs in the same card template
- **Data is the product**: statistics tables should feel as designed as headlines — crisp, legible, visually weighted

## Skills

Detailed how-to docs live in `.agents/skills/<name>/SKILL.md`. The `description` frontmatter field enables skill auto-discovery; agents can also browse the directory directly. CSV reference data is in `docs/agents/*.csv`.

**Writing or editing a skill**: load **`skill-authoring`** (`.agents/skills/skill-authoring/SKILL.md`) before drafting or restructuring any `SKILL.md`. It encodes the **precondition + TaskCreate pattern** that replaces prevention-style "never X" prohibitions — positive imperatives ("Before X, do Y") and explicit TaskCreate checklist items survive context compaction and are mechanically checkable, while bare "never X" bullets are read as background warnings.

**Process framework**: `.agents/skills/dev-process/SKILL.md` is the canonical map of how work flows through this codebase. Load it at the start of any task that doesn't fit the dominant new-feature path — it covers incidents, bugs, security, refactors, migrations, spikes, experiments, reverts, inherited PRs, and documentation-only changes.

**E2E/integration determinism**: `.agents/skills/testing/references/e2e-determinism.md` is the 12-lever checklist that gates every PR touching E2E or integration tests. Flake is a P1 bug.

Debugging distributed system failures where test stdout is opaque (e.g. `n/a`, "stuck", "timeout") — use **`cloudwatch-archaeology`** to query CloudWatch logs and the live RDS before chasing client-side hypotheses. See `.agents/skills/cloudwatch-archaeology/SKILL.md`.

**Terraform changes**: any edit under `terraform/**/*.tf` that adds or modifies a resource or data source must load **`terraform-permission-planning`** before pushing. `terraform plan` does not validate IAM; the skill enforces the predict → diff → patch → local-plan-as-CI-role loop so the apply lands in one PR instead of cycling on CI AccessDenied failures. See `.agents/skills/terraform-permission-planning/SKILL.md`.

## MCP Servers

See `.agents/skills/mcp-first/SKILL.md` for the full server list, per-server tool mapping, and load-order notes. Always prefer MCP tools over equivalent shell commands.

**Pre-flight auth check**: call `auth_check_all` (worktree MCP server) at the start of any workflow that requires GitHub, Jira, AWS, or CI access. If `allAuthenticated: false`, surface the `hint` for each failing service and stop — never attempt to generate tokens or initiate OAuth flows. See `.agents/skills/credentials/SKILL.md`.

**Rotating / revoking the long-lived MCP machine credential** (the Cognito `client_credentials` secret from epic LS-5089, Track A): see the runbook [`docs/authentication/mcp-machine-credential-lifecycle.md`](docs/authentication/mcp-machine-credential-lifecycle.md) — rotation (auto + manual) with local/Copilot propagation, fast-revocation including per-server (`mcp/jira|github|ci`) scope revocation, and the blast-radius reasoning (the secret stays off the wire; only short-lived per-server-scoped tokens transit).

**MCP server auth model (epic LS-5089)**: locally and on Copilot, `.mcp.json` authenticates the 3 URL servers with a `headersHelper` command (`node scripts/mcp-mint-token.mjs`) that Claude Code runs at **every (re)connect** — it mints a fresh, short-lived, per-server-scoped (`mcp/jira|github|ci`) Cognito `client_credentials` token locally, so the long-lived machine secret never transits the wire and the classic mid-session token death no longer occurs (the legacy static `${MCP_AUTH_TOKEN}` ID-token header is still dual-accepted server-side during migration; removal tracked in LS-5094). **Claude Code on the web** reaches the same servers via OAuth custom remote connectors registered in claude.ai by an Org Owner (auto-syncing into Claude Code); a CC-web session that outlives its OAuth access token must re-consent via `/mcp` ([claude-code#58607](https://github.com/anthropics/claude-code/issues/58607) — no mid-session auto-refresh). See `.agents/skills/cloud-agent-mode/SKILL.md` (Claude Code web custom remote connectors).

**Mid-session 401 on `legacy-sports-github` / `legacy-sports-jira` / `legacy-sports-ci`** (legacy static-header path only): when those URL-based servers begin returning HTTP 401 mid-session with `ZodError: expected string, received undefined`, the diagnosis is `MCP_AUTH_TOKEN` expiry. Agents cannot recover this — writing a fresh token to `.env.local` does not propagate to the already-spawned transports. Stop, surface the recovery prompt (`node scripts/mcp-auth.mjs` then **restart the session**), and wait for the user. Do not fall back to `gh` / `acli` / `curl`. See `.agents/skills/mcp-diagnostics/SKILL.md` (Mid-Session 401 / Token Expiry).

> **All 10 MCP servers** should connect in every session. For the full SessionStart hook chain (symlink setup → MCP precondition check → server spawn) and where the `[MCP WARNING]` output comes from, see [`docs/dev-process/session-startup.md`](docs/dev-process/session-startup.md). `MCP_TIMEOUT=10000` in `.claude/settings.json` ensures enough startup headroom. If a server is unexpectedly missing or timing out, **first check that the `node_modules` symlink exists** — the 7 stdio servers start with `pnpm exec tsx ...` and will time out immediately if `node_modules/.bin/tsx` is missing. The 3 URL servers (jira, github, ci) connect via HTTPS to the MCP HTTP API Gateways at `${MCP_JIRA_URL}`, `${MCP_GITHUB_URL}`, `${MCP_CI_URL}`, presenting a short-lived bearer minted per-connect by the `headersHelper` (`node scripts/mcp-mint-token.mjs`) — if those time out, confirm `.env.local` contains non-placeholder `MCP_*_URL` values and a valid machine credential (run `node scripts/mcp-auth.mjs` to provision/refresh, or `--setup` to re-auth). Check with `test -x node_modules/.bin/tsx`. If missing or broken, run `node scripts/modules-pool/link.mjs` from the worktree root (requires Windows Developer Mode — it links `node_modules` to the content-addressable pool slot for the worktree's lockfile, materialising it on a miss). **Never** use `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, raw `mklink /J`, or other manual junction commands — they bypass path consistency checks and cause Nx graph failures. The `SessionStart` hook (`setup-worktree-symlink.sh`) creates the symlinks and chains `check-mcp-servers.sh` immediately afterward, emitting a visible `[MCP WARNING]` when any precondition fails. After repairing, restart the session. Do not proceed with shell fallbacks for a persistently missing server. See `.agents/skills/mcp-diagnostics/SKILL.md` for the full diagnostic checklist.

## Cloud Agent Mode

When running as a cloud coding agent (Claude Code on the web, Copilot Coding Agent): no worktrees/twig/acli, work directly in repo root; Linux/bash; Docker PostgreSQL; no AWS access. See `.agents/skills/cloud-agent-mode/SKILL.md` for the complete cloud workflow, GitHub + Jira auth setup, token configuration tables, Jira tool mapping, review lifecycle, known quirks, and available MCP servers.

## Shell Resolution

Different contexts use different shells. Use the correct syntax for each:

| Context                                    | Shell                        | Syntax         | Notes                                                                              |
| ------------------------------------------ | ---------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| **Bash tool** (Claude Code, local Windows) | Git Bash                     | Unix           | Default shell for local Bash tool calls                                            |
| **`worktree_run`** (local Windows)         | Git Bash (fallback: cmd.exe) | Unix preferred | Avoid PowerShell-specific syntax; `ls` unavailable in cmd.exe fallback — use `dir` |
| **Cloud agent shell**                      | bash                         | Unix           | Cloud coding agents run on Linux; do not assume Git Bash                           |
| **User's terminal**                        | PowerShell                   | PowerShell     | `;` to chain, `$env:` for vars                                                     |
| **CI** (GitHub Actions)                    | bash                         | Unix           | Standard POSIX                                                                     |

When writing commands for the local Bash tool, always use Unix syntax (forward slashes, `&&`, `/dev/null`). Cloud agents also use Unix `bash` syntax on Linux. When giving the user commands to run in their terminal, use PowerShell syntax.

## Environment Notes

- **Local**: Windows - PowerShell (`;` to chain commands, `$env:` for vars) - twig for branch management
- **Cloud**: Ubuntu Linux - bash - no worktrees/twig - Docker PostgreSQL (no AWS access)
- Package manager: pnpm 9.12.1 (enforced via corepack — never use npm or yarn)
- Commit format: `type(scope): message` (e.g. `feat(auth): add oauth`). Always include the ticket key somewhere in the commit message for Jira linking (e.g. `feat(auth): add oauth (LS-1234)` or `LS-1234 feat(auth): add oauth` when a tool requires a prefixed key).
- **Always pass commit messages inline — never open the interactive editor**: always use `git commit -m "$(cat <<'EOF'\n...\nEOF\n)"` (heredoc handles multi-line messages without quoting issues). Running `git commit` without `-m` opens `$EDITOR` and blocks the agent session. Prefer `worktree_commit({ message: "..." })` (MCP tool) when available — it is equivalent and never opens an editor.
- **`jq` is NOT available on Windows** — use Python with explicit UTF-8 encoding for JSON parsing. Write scripts to `scratch/<name>.py` to avoid quoting issues.
- **`make e2e-auth`** mints (or refreshes) the web-e2e OAuth JWT and caches it machine-wide at `~/.legacy-sports/e2e-token.json` (Windows: `%USERPROFILE%\.legacy-sports\e2e-token.json`). Every worktree on the same machine reuses one cached token until expiry, so fresh worktrees do **not** need to repeat the device handshake. Run it once before `nx run web-e2e:e2e` in a new worktree; if the cache is already valid it prints `already authenticated as <email>` and exits 0. Agents cannot complete the interactive browser handshake — the human user must run this when no cache exists. CI is unaffected (`E2E_AUTH_MODE=ci` path unchanged).
