# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

> **NEVER commit to the `main` branch.** Local sessions: use the **`worktree` checkbox** in the launcher (starts in `.claude/worktrees/<name>/`, branch tracked in UI). Parallel work: `make worktree TICKET=#### DESC=description`. Cloud agents already have an isolated checkout.

## Critical Rules

Rules are grouped by category and tiered by severity. **Tier 1** violations are catastrophic or irreversible. **Tier 2** violations are costly (wasted CI time, stuck PRs, rework cycles). **Tier 3** violations are quality issues caught in review.

### Safety (Tier 1)

- **NEVER commit to the `main` branch** — all commits must be on a feature branch; working in `D:\code\legacy-sports` with HEAD on `main` is forbidden.
- **Never embed secrets in tool calls** — never put raw secret values in `Edit`, `Write`, or `Bash` arguments. See `.agents/skills/secrets-handling/SKILL.md`.
- **One ticket = one worktree = one PR** — never add unrelated changes to an existing branch or worktree. Create a **separate Jira ticket and worktree** for unrelated work.

### Workflow Discipline (Tier 2)

- **Drive to merge** — work is NOT complete until the PR is **merged**, Jira moves to "Done", the MCP gap audit runs, and any tracking tasks are marked completed. Stopping after `make pc`, after `github_create_pr`, or while CI/reviews are still pending are all common agent failure modes. See [Task Completion Signal](#task-completion-signal) for the mechanically checkable definition.
- **Worktree-first**: every ticket runs in its own worktree. Native ephemeral (launcher checkbox) is default — **do not rename the local branch** (Claude Code caches it at session start; renaming breaks PR detection). Push as-is; Jira links via PR title + commit messages containing `LS-####`. Sibling worktrees (`make_worktree_create`) for parallel work only. Re-attach existing branches with `worktree_attach`. See `.agents/skills/worktree-workflow/SKILL.md`.
- **Claude Code's `isolation: "worktree"` Agent parameter** (Agent tool only): creates ephemeral worktrees for subagents. MCP tools work inside them — `worktree_set(key: "<absolute .claude/worktrees/... path>")` accepts absolute paths. Always prefer MCP tools over raw `git -C` even in ephemeral worktrees.
- **Shared node_modules** — never `pnpm install` directly; never `make install` in the main repo while any worktree symlinks to its `node_modules`. Use `worktree_setup_node_modules()` (native flow) or `make_wt_setup` (sibling flow) to set up a worktree. **Never use `mklink`, `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, or any PowerShell/cmd symlink-creation command to recreate `node_modules`** — only `worktree_setup_node_modules()` and `make_wt_setup` handle `.modules.yaml` path consistency correctly; manual commands cause Nx graph failures. For broken/missing symlinks: call `worktree_setup_node_modules()` first; if MCP is unavailable, `powershell -NoProfile -Command "Remove-Item -Path node_modules -Force"` then `make install` inside the worktree for an independent installation. Pass `KEEP_SYMLINK=1` to opt out and restore the old "block and instruct" behaviour. To add packages in a worktree: remove symlink → `pnpm add -w <pkg>` → `make install`. See `.agents/skills/repo-tooling/references/install-packages.md` for the full safe procedure.
- **Never manually remove worktrees**: always `twig worktree clean` — never `git worktree remove` or manual deletion (destroys symlinks).
- **Kill background servers when done** — stop all `isBackground=true` processes before workflow ends. Run `make kill-stale` to find stale node processes. Call `browser_cleanup` to close Playwright browsers.
- **Resolve PR review threads**: after fixing review comments, call `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` directly. Never reach for raw GraphQL mutations or shell commands without first invoking this tool and receiving a connection error or tool-not-found response — assuming it is unavailable without trying is not acceptable. See `.agents/skills/pr-lifecycle/SKILL.md`.
- **Self-review before every push (mandatory gate)** — after `make pc` passes and before `worktree_push()`, run `/review` (or the self-review steps in `.agents/skills/pr-lifecycle/references/self-review.md`). Read every changed file in full, check against all patterns in `.agents/skills/pr-lifecycle/references/common-review-patterns.md`, and fix issues directly. Every Copilot review round costs 30–60 min of agent time — a thorough self-review eliminates most of them. Do NOT push until self-review is complete. See Step 11b of the [workflow](#workflow).
- **`make pc` is the validation command — never substitute individual targets** — always call `make_run(target: "pc")` to validate; never chain `format` → `lint` → `typecheck` separately. `make pc` handles formatter auto-commits internally. If it fails, read the `steps[]` JSON, fix the failing step, then re-run `make_run(target: "pc")`. See workflow Step 11.
- **CI status and PR activity are surfaced natively by Claude Code** — no wait tools needed. After pushing, Claude Code automatically surfaces CI failures and review events. `ci_list_runs`, `ci_view_run`, and `github_view_pr` are ONE-SHOT snapshots for targeted lookups — never call them in a loop (burns 1–2M tokens per session). See `.agents/skills/pr-lifecycle/SKILL.md`.
- **Compact every 35 tool calls** — a hook emits `[COMPACT REMINDER]` at every 35th tool call. When you see it, run `/compact` immediately then resume. Context bloat compounds quickly; compacting is always safe and recoverable.

### Tool Usage (Tier 2)

- **MCP-first, then Make**: always prefer MCP tools over shell commands — `make_run` over `make`, `nx_run`/`nx_run_affected` over `pnpm exec nx`. Shell equivalents are fallbacks only. See `.agents/skills/mcp-first/SKILL.md` for the full tool mapping and substitution table.
- **Tool-first for file operations**: use `Glob` (not `find`/`ls` — `ls <dir>` → `Glob(pattern: "*", path: "<dir>")`), `Grep` (not `grep`/`rg`), and `Read` (not `cat`/`head`/`tail`). To read the tail of a file, use `Read(file_path: "...", offset: <approx_line>, limit: N)` — estimate the offset from file size via `worktree_file_info`, or use a large offset for persisted output files; for small files, read in full with no offset. `Grep` works on single files and directories alike — common Bash grep patterns map directly: `grep -n "pattern" file` → `Grep(pattern: "pattern", path: "file", output_mode: "content")`; `grep -rn "pattern" dir/` → `Grep(pattern: "pattern", path: "dir", output_mode: "content")` (line numbers included by default in content mode; the `-r` and `-n` flags are implicit); `grep -i "pattern" file` → `Grep(pattern: "pattern", path: "file", "-i": true, output_mode: "content")`; multi-pattern `grep -n "pat1\|pat2" file` → `Grep(pattern: "pat1|pat2", path: "file", output_mode: "content")` (ripgrep uses `|` not `\|` for alternation). See `.agents/skills/mcp-first/SKILL.md` for the complete substitution table.
- **Jira — auth-aware routing**: call `jira_auth_status` first. If `configured: true`, use custom MCP tools (`jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`). If `configured: false` or API calls fail, fall back to the Atlassian plugin (`mcp__claude_ai_Atlassian__*`, cloud ID `fb294606-6c8f-4b52-9a41-11fe45b77528`). Only use `acli` as a **last resort** if both the Jira MCP server and the Atlassian plugin are confirmed unavailable. **The `legacy-sports-jira` MCP server is independent of the `worktree` MCP server** — never skip to `acli` just because `worktree_*` tools aren't loaded; check `jira_auth_status` first regardless of which other MCP servers are available. Fallback order: `jira_*` MCP → Atlassian plugin → `acli` CLI. See `.agents/skills/cloud-agent-mode/SKILL.md` for known quirks.
- **Jira — listing epic/story children**: always use `jira_list_children(key: "LS-####")` — never `searchJiraIssuesUsingJql` with `parent = LS-####`. Raw JQL returns verbose markdown-formatted output that overflows the MCP context limit (~192K chars for 50 results); `jira_list_children` returns compact structured JSON with pagination support and stays well under the limit. See `.agents/skills/mcp-first/SKILL.md` for the full Jira tool mapping.

### Code Quality (Tier 3)

- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging`. Exceptions: `lib/logging/`, `apps/cli/`, migration files, and build-time scripts.
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable` (see `.agents/skills/standards/SKILL.md`)
- **E2E tests are hermetic** — never use `route.continue()` in E2E tests. Use `route.fulfill()` for unmatched operations. See `.agents/skills/testing/SKILL.md`.
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

## Workflow

Follow the **Agent Workflow Checklist (Steps 0-16)** in `.agents/skills/workflow-overview/SKILL.md` — it is the single source of truth for procedure. Summary:

0. Epic check → 1. Create/identify ticket → **1b. Planning phase** → 2. Dependency check → 3. Jira "In Progress" → 4. Worktree setup → 5. node_modules symlink → 6. Work in worktree → 7. Code & test → 8. Commit → 9. Rebase → 10. Migrations → 11. `make pc` + self-review → 12. Ship (draft PR → label → mark ready → Copilot review → Jira "In Review") → 13. Watch PR to merge → 14. MCP gap audit → 15. Complete tracking tasks → 16. Cleanup

For PR creation, review fixing, and thread resolution details, see `.agents/skills/pr-lifecycle/SKILL.md`. For error recovery during any step, see `.agents/skills/workflow-overview/references/error-recovery.md`.

## Risk Classification

Low (single-file, docs, tests: 2-3 min) · Medium (business logic, multi-file, schema: 5-10 min) · High (auth, payments, infra, migrations: 10-15 min). See `.agents/skills/planning/SKILL.md`.

## Command Patterns

**Never use `cd <dir> && <command>`** — use flag-based alternatives: `git -C $wt`, `make -C $wt`, `make_run({ target: "test", worktreePath: "/absolute/path/to/worktree" })`, `worktree_run({ command: "pnpm exec nx test my-app" })`, `terraform -chdir=...`.

## Subagent Tool Preferences

Subagents do **not** inherit AGENTS.md context. Always include tool preference hints when spawning subagents. See `.agents/skills/subagent-templates/SKILL.md` for copy-paste templates covering Explore agents, git operations, PR sweeps, MCP server code, work subagents, and parent-agent recovery.

- **PR existence check**: to check whether a PR already exists for a given ticket key (e.g., while claiming a ticket or deciding whether to create a PR), use `github_pr_dashboard(state: "all", limit: 50)` and filter by ticket key in-context — never `gh pr list --state all | grep "LS-####"`. Include this hint in any subagent prompt that may need to verify PR existence before acting.

## Commands

```bash
make pc             # full pre-commit (lint + typecheck + test + build)
make test           # test changed files
make codegen        # GraphQL codegen
```

Use `scratch/` for ad-hoc output (gitignored). On Windows, write scripts to `scratch/<name>.js` instead of `node -e`.

## Architecture

`apps/` (web, mobile, CLI) · `lambdas/` (GraphQL API, game-selection, stats, etc.) · `lib/` (19+ shared libraries) · `terraform/` · `.agents/skills/`

See `.agents/skills/architecture/SKILL.md` for system overview. For a fast capability → file path lookup (use before Glob sweeps): **`.agents/skills/architecture/FILE-MAP.md`**.

## Design Context

Full design brief lives in `.impeccable.md` at the project root — load it before doing any frontend design work. Key guidelines are summarized below; they apply to all frontend code generation and review.

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

## MCP Servers

See `.agents/skills/mcp-first/SKILL.md` for the full server list, per-server tool mapping, and load-order notes. Always prefer MCP tools over equivalent shell commands.

> **All 9 MCP servers** should connect in every session. `MCP_TIMEOUT=10000` in `.claude/settings.json` ensures enough startup headroom. If a server is unexpectedly missing or timing out, **first check that the `node_modules` symlink exists** — all MCP servers start with `pnpm exec tsx ...` and will time out immediately if `node_modules/.bin/tsx` is missing. Run `powershell -File scripts/mklink-symlink.ps1 -Link <worktree>\node_modules -Target D:\code\legacy-sports\node_modules -Check` (PowerShell) to inspect the link, or check with `test -x node_modules/.bin/tsx`. If missing or broken, call `worktree_setup_node_modules()` (if MCP is connected) or `make install` inside the worktree (creates an independent `node_modules`). **Never** use `mklink`, `New-Item -ItemType SymbolicLink`, `New-Item -ItemType Junction`, or other manual symlink/junction commands — they bypass path consistency checks and cause Nx graph failures. The `SessionStart` hook attempts to create this symlink automatically but may not fire in all session types (e.g., Copilot CLI). After repairing, restart the session. Do not proceed with shell fallbacks for a persistently missing server.

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
- **`jq` is NOT available on Windows** — use Python with explicit UTF-8 encoding for JSON parsing. Write scripts to `scratch/<name>.py` to avoid quoting issues.
