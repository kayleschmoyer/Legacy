# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

> **NEVER commit to the `main` branch.** Primary local sessions: spawn Claude Code with the **`worktree` checkbox checked** in the session launcher — the session starts inside an ephemeral worktree at `.claude/worktrees/<name>/` on a new branch, and Claude Code's header, `Create PR` button, and `gitStatus` all reflect that branch natively. For parallel work (sweep, batch, chained branches): `make worktree TICKET=#### DESC=description` creates a sibling worktree. Cloud agents already have an isolated branch checkout.

## Critical Rules

- **NEVER commit to the `main` branch** — every commit must be on a feature branch. Primary local flow: spawn Claude Code with the `worktree` checkbox checked (session starts in `.claude/worktrees/<name>/` natively, header shows the ephemeral branch, `Create PR` button works). Parallel/batch flow: `make worktree TICKET=#### DESC=description` creates a sibling worktree under `D:\code\legacy-sports-worktrees\`. Working in `D:\code\legacy-sports` (the main repo directory) with HEAD on `main` is forbidden.
- **Drive to merge** — work is NOT complete until the PR is **merged**, Jira moves to "Done", the MCP gap audit runs, and any tracking tasks are marked completed. Passing `make pc` is a checkpoint, not the finish line. Creating the PR is also not the finish line. After opening a PR you **must** keep an eye on it: subscribe to PR activity, monitor CI, respond to review comments, rebase if needed, and shepherd it all the way to merge. Only after the PR is merged do you run the MCP gap audit (`skills/mcp-gaps/SKILL.md`) and mark tracking tasks completed. Stopping after `make pc`, after `github_create_pr`, or while CI/reviews are still pending are all common agent failure modes.
- **One ticket = one worktree = one PR** — never add unrelated changes to an existing branch or worktree. If a new task arises while working on a ticket (e.g., the user asks you to fix something unrelated), create a **separate Jira ticket and worktree** for it. Do not `git stash` changes into another worktree or tack extra commits onto an in-flight branch — each PR must map to exactly one Jira ticket.
- **Worktree-first**: every ticket runs in its own worktree. Two mechanisms, in priority order:
  1. **Native ephemeral (default)** — spawn Claude Code with the `worktree` checkbox checked. The session's primary working directory is `.claude/worktrees/<name>/`, Claude Code's UI tracks the branch automatically, and no `worktree_set` is needed. After `jira_create_ticket`, rename the branch: `git branch -m claude/LS-####-short-kebab-description` **before the first push**. If you're in an already-running session and didn't use the checkbox, spawn a new session — do not fall back to working in the main repo directory.
  2. **Sibling worktree (parallel work only)** — `make_worktree_create({ ticket: "####", description: "…" })` creates a worktree under `D:\code\legacy-sports-worktrees\`. Use this only for genuinely parallel work (sweep, batch, chained branches, multi-ticket orchestration from a single parent session). Call `worktree_set(key: "LS-####")` before file edits so the custom worktree MCP tools target the right tree.
     Never edit code in the main repo (`D:\code\legacy-sports`) while HEAD is `main`.
- **Claude Code's `isolation: "worktree"` Agent parameter** (Agent tool only): creates ephemeral worktrees in `.claude/worktrees/` for **subagents** — scoped to the subagent's sub-session, not the main session. Best for disposable exploration, architecture spikes, or delegated subtasks where no Jira ticket is needed. Separate from the **session launcher `worktree` checkbox**, which creates an ephemeral worktree that becomes the _primary session's_ working directory (native header + `Create PR` button). Both mechanisms use `.claude/worktrees/<name>/`. For either flavor: MCP tools work inside ephemeral worktrees (LS-1953) — `worktree_set(key: "<absolute .claude/worktrees/... path>")` accepts absolute paths and all worktree MCP tools + `github_create_pr(worktreePath: ...)` work normally. Always prefer MCP tools over raw `git -C` even in ephemeral worktrees.
- **Shared node_modules** — never `make clean`/`make install`/`pnpm install` in the main repo while worktrees exist. Broken node_modules in a junction? Check if it's a junction first, then ask the user — never fix autonomously. Always use `make install` (never raw `pnpm install`). See `skills/worktree-workflow/SKILL.md`.
- **Make first**: prefer `make <target>` over raw `pnpm exec nx` — it sets `NODE_OPTIONS` for the Windows windowsHide patch and is cross-platform safe. For project-specific targets use `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (exception: `lib/db-client` migration scripts that have no Nx target equivalent). See `skills/repo-tooling/SKILL.md` for the full target list.
- **Tool-first for file operations**: use the built-in `Glob` tool (not `find`/`ls`) for file discovery, `Grep` tool (not `grep`/`rg`/`find | xargs grep`) for content search, and `Read` tool (not `cat`/`head`/`tail`) for reading files. These built-in tools are path-scopable, permission-controlled, and avoid unnecessary shell execution. `find … | xargs grep` is never necessary — `Grep` accepts both a `pattern` and a `glob` filter in one call. Fall back to Bash only when the built-in tool genuinely cannot handle the case.
  - **Concrete substitutions** (reach for these automatically — do not use the Bash equivalents): - `grep -r "pattern" dir/` → `Grep(pattern: "pattern", path: "dir", output_mode: "content")` - `grep -rl "pattern" dir/` (files only) → `Grep(pattern: "pattern", path: "dir", output_mode: "files_with_matches")` - `grep -rl "pattern" dir/ --include="*.ts"` → `Grep(pattern: "pattern", path: "dir", glob: "**/*.ts", output_mode: "files_with_matches")` - `cat file` → `Read(file_path: "...")` - `head -N file` → `Read(file_path: "...", limit: N)` - `tail -N file` → first `Read(file_path: "...")` to determine `total_lines`, then if needed `Read(file_path: "...", offset: <total_lines - N>, limit: N)` to re-read just the tail range; if the file is small, keep the full `Read` - `find . -name "*.ts"` → `Glob(pattern: "**/*.ts")`
    <<<<<<< HEAD
    <<<<<<< HEAD - `tail ~/.claude/.../tasks/<taskId>.output` → `TaskOutput(taskId: "<taskId>")` for background agent task output (no path needed — tool resolves it automatically; returned content can be inspected for length/line counts directly) - `wc -l tasks/<taskId>.output` or `wc -c tasks/<taskId>.output` → `TaskOutput(taskId: "<taskId>")` then compute counts from the returned content using `wc` semantics (`-l`: count `\n` characters; `-c`: count UTF-8 bytes, not string `.length`)
  - # **Glob limitation on Windows worktrees**: `Glob` with `path=` set to an absolute Windows worktree path (e.g. `D:/code/legacy-sports-worktrees/LS-1234-foo`) may silently return empty results due to junction traversal issues. If Glob returns nothing unexpectedly, fall back to `worktree_ls_tree({ ref: "HEAD", path: "<dir>" })` (MCP — lists Git-tracked files only, not untracked) or `worktree_run({ command: "ls <dir>" })` for directory listing.
  - **Glob limitation on Windows worktrees**: `Glob` with `path=` set to an absolute Windows worktree path (e.g. `D:/code/legacy-sports-worktrees/LS-1234-foo`) may silently return empty results due to junction traversal issues. If Glob returns nothing unexpectedly, fall back to `worktree_ls_tree({ ref: "HEAD", path: "<dir>" })` (MCP — lists Git-tracked files only, not untracked) or `worktree_run(command: "ls <dir>")` for directory listing.
    > > > > > > > # a4d341d11 (docs(skills): fix PASSES.md bucket predicates and AGENTS.md worktree_run style)
  - **Glob limitation on Windows worktrees**: `Glob` with `path=` set to an absolute Windows worktree path (e.g. `D:/code/legacy-sports-worktrees/LS-1234-foo`) may silently return empty results due to junction traversal issues. If Glob returns nothing unexpectedly, fall back to `worktree_ls_tree({ ref: "HEAD", path: "<dir>" })` (MCP — lists Git-tracked files only, not untracked) or `worktree_run(command: "dir <dir>")` for directory listing.
    > > > > > > > c7c434c06 (docs(skills): fix PASSES.md dashboard var, sort caveat, and AGENTS.md dir fallback)
- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging` instead of `console.log/warn/error/debug`. Exceptions: `lib/logging/` (the logger itself), `apps/cli/`, migration files, and build-time scripts (`codegen.ts`, Vite plugins).
- **No suppression** — fix root causes; never use `@ts-ignore` or `eslint-disable` (see `skills/standards/SKILL.md`)
- **Never embed secrets in tool calls** — never put raw secret values (API keys, tokens, private keys) in `Edit`, `Write`, or `Bash` arguments; they end up in session history. Use file-to-file copy patterns instead. See `.agents/skills/secrets-handling/SKILL.md`.
- **E2E tests are hermetic** — never use `route.continue()` in E2E tests — there is no backend in CI. Use `route.fulfill()` for unmatched operations (return a diagnostic error so missing mocks surface immediately). When changing login/landing page UI, update E2E selectors in the same PR (see `.agents/skills/testing/SKILL.md`).
- **Prefer `.graphql` + codegen over inline `gql`** — for new code in `apps/web` and `lib/shared-components`, define queries in `.graphql` files and import generated hooks from `graphql.generated.ts`. Legacy inline `gql` usage exists in the codebase and generated files necessarily contain `gql` strings.
- **Never manually remove worktrees**: always `twig worktree clean` — never `git worktree remove` or manual deletion (destroys junctions).
- **Kill background servers when done** — stop all `isBackground=true` processes before workflow ends. Run `make kill-stale` to find stale node processes holding addon locks. Call `browser_cleanup` to close any Playwright browsers and dev servers started by the browser MCP server.
- **Jira — auth-aware routing**: call `jira_auth_status` at the start of any Jira workflow. If `configured: true`, use `jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`, `jira_set_parent` for all Jira operations. If `configured: false` or API calls fail, **stop and tell the user** before doing anything else. When you are **not** running on Claude Code on the web, explain that Jira credentials appear unconfigured or expired and direct the user to check `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, and `JIRA_CLOUD_ID` env vars (or `JIRA_EMAIL`/`JIRA_API_TOKEN` for Basic Auth). When you are confirmed to be running on Claude Code on the web, do **not** direct the user to Jira env vars; instead, explain that Jira auth is managed via the Atlassian plugin and ask whether they want to enable/use it for this session. Only use the Atlassian plugin (`mcp__claude_ai_Atlassian__*`) if: (a) the user explicitly opts in after being informed, or (b) you are running on Claude Code on the web where the plugin is the expected primary auth method and should be treated as the primary path. Use cloud ID `fb294606-6c8f-4b52-9a41-11fe45b77528` (site: `bkrupa.atlassian.net`). Last resort: `acli` CLI — never direct HTTP. **Cloud sessions also see two known quirks** — `legacy-sports-jira` may report `configured: true` but every call returns `fetch failed` (egress blocked), and the Atlassian plugin's `transitionJiraIssue` may transiently reject its `transition` parameter on cold start. Recognize the symptoms instead of declaring yourself blocked — see `.agents/skills/cloud-agent-mode/SKILL.md` ("Known cloud-environment quirks") for the workarounds.
- **Resolve PR review threads**: after fixing review comments, resolve threads via `github_resolve_threads({ threadIds: [...] })`. See `skills/pr-lifecycle/SKILL.md`.

## Branch Naming

All branches that are **pushed or used to open a PR** must contain at least one `LS-####` Jira key in the branch name itself — Jira Branch Sync's push-based "In Progress" transition reads the branch name, not the PR title or body, so pushed branches without an `LS-####` token break the automation. Local-only scratch branches in subagent `isolation: "worktree"` worktrees (per the ephemeral-worktree exception in the Critical Rules above) may omit a Jira key, but they must remain local-only and never be pushed. The convention for pushed/PR branches has three shapes depending on who is driving the branch and how the worktree was created:

| Driver                                               | Pattern                                                                                                                             | Example                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Human / `make worktree` (sibling worktree)           | `LS-####/short-kebab-description`                                                                                                   | `LS-2333/surface-resolved-worktree`                                                              |
| Claude Code launcher `worktree` checkbox (ephemeral) | Start: `claude/<random-name>` (auto) → **rename to** `claude/LS-####-short-kebab-description` via `git branch -m` before first push | `claude/romantic-ardinghelli` → `claude/LS-2400-add-foo-bar`                                     |
| Agent (Claude on the web, Copilot, bots)             | `<agent>/LS-####-short-kebab-description[-<suffix>]`                                                                                | `claude/LS-2400-add-foo-bar`, `copilot/LS-2401-fix-rollbar-init`, `bot/LS-2402-rebase-onto-main` |

Rules:

- **`<agent>` prefix** identifies the runner — `claude/`, `copilot/`, or `bot/` (for `legacy-sports-code-bot`). Humans use **no prefix** so the existing `LS-####/description` form is unchanged.
- **`LS-####` is mandatory in the branch name** — not just the PR body. If no ticket exists yet, create one first via `jira_create_ticket` (or the Atlassian plugin) before naming the branch.
- **Native-checkbox sessions must rename before pushing** — Claude Code's launcher generates random names like `claude/romantic-ardinghelli`. After `jira_create_ticket` returns the LS key, rename with `git branch -m claude/LS-####-short-kebab-description` **before any `git push`**. If the random branch is pushed first, Jira Branch Sync can still transition via PR title/body as a backstop (see final paragraph), but the remote branch name will still violate the convention and pollute sweeps.
- **Separator after `LS-####` in agent branches is `-`, not `/`** — the agent prefix is the only `/` in the branch, so directory-derived worktree names stay flat (`claude-LS-2400-add-foo-bar` rather than nested).
- **Description** is short kebab-case, ≤ 5 words, matching the existing twig convention.
- **Optional random suffix** (e.g. `-L7PTr`) is allowed for Claude-on-web auto-generated branches to disambiguate parallel sessions on the same ticket. Place it last so the `LS-####` parser still finds the key.
- **One ticket = one branch = one PR** — see Critical Rules above. PRs may reference additional `LS-####` keys in the title or body when a single change legitimately closes multiple tickets, but each branch still has exactly one primary ticket.

If you find yourself on a branch that does not match this convention (for example, an older `claude/<slug>-<suffix>` auto-generated branch with no `LS-####`), include all associated ticket keys in the PR title or body in the exact `LS-####` format so Jira Branch Sync can still transition them from PR metadata — but do not rely on push-based automation, and prefer renaming the branch to match the convention before opening the PR.

## Workflow

0.  **Epic check**: if the given ticket is an Epic, do NOT implement the epic directly. Instead, use `jira_view` to inspect the epic's child issues, identify the next unblocked To Do ticket, and begin working on that child ticket. If `jira_list_children` is available, prefer it; otherwise use `acli jira workitem search --jql "parent = LS-####"`. Repeat for each child until all are complete or blocked.
1.  Ticket: create if needed using the `jira_create_ticket` MCP tool with `sprint: "current"` to add it to the active sprint (or `acli jira workitem create --summary "..." --project LS --type Task`) — note `$key`
2.  **Dependency check**: inspect the Jira ticket for "blocked-by" linked issues. Query their status before any status transition:
    - **Blocker is not In Review or Done — STOP.** Do not proceed with the ticket. Inform the user that the blocking ticket must reach at least "In Review" before work can begin.
    - **Blocker is In Review — use its branch as the parent.** The worktree must branch from that ticket's branch, not from `main` (see `skills/worktree-workflow/SKILL.md` Step 1).
    - **Blocker is Done (or no blockers) — base off `origin/main`.**
3.  **Jira "In Progress" after blocker check passes**: use the `jira_transition` MCP tool with status "In Progress" (or `acli jira workitem transition --key LS-#### --status "In Progress"`) only after confirming blockers are In Review/Done (or absent). If the ticket is not in the current sprint, move it using `acli jira sprint list --board-id LS --state active` to find the active sprint ID, then `acli jira sprint add --sprint-id <id> --issue LS-####` to add the ticket — tickets worked on outside the active sprint are invisible to the team.
4.  Worktree — two flows:
    - **Primary flow (native checkbox)**: you should already be in an ephemeral worktree (spawned via the launcher's `worktree` checkbox at session start). Verify with `pwd` — it should return a `.claude/worktrees/<name>/` path. The session's branch is already set; skip to Step 4b. No `make_worktree_create` needed, no sibling directory, no `worktree_set`.
    - **Parallel/batch flow (sibling worktree)**: only for sweep, batch, chained branches, or multi-ticket orchestration from a single parent session. Call `make_worktree_create({ ticket: "####", description: "description" })` MCP tool (pass `parent: "LS-XXXX/branch"` for dependent tickets) — this creates the branch, worktree, **and registers the parent dependency** in one step. Then `worktree_list()` to note the path and `worktree_set(key: "LS-####")` to make it active. Shell fallback: `make worktree TICKET=#### DESC=description`. **Do NOT use `twig worktree create` directly** — it skips parent registration and creates orphaned branches.
      4b. **Rename auto-generated branch (native flow only)**: after `jira_create_ticket` in Step 1 returns the LS key, rename the ephemeral branch before the first push:

      ```bash
      git branch -m claude/LS-####-short-kebab-description
      ```

      Skip this step for sibling worktrees — those are already named correctly by `make_worktree_create`. If you forget and push first, Jira Branch Sync will fall back to parsing the PR title/body, but the remote branch name will still violate the naming convention.

5.  Setup worktree:
    - **Parallel flow (sibling worktree)**: on Windows, `make_wt_setup({ worktreePath: "$wt" })` MCP tool or shell fallback `make wt-setup WT=$wt`. On Linux/macOS (cloud agents), `make wt-setup` is not available — run `make install` in the worktree, copy `.env` from the main repo, and optionally run `make setup-hooks`.
    - **Native flow (ephemeral worktree — REQUIRED)**: `.claude/worktrees/<name>/` ships with NO `node_modules`. Before running any pnpm or make command, junction `node_modules` from the main repo (confirmed in LS-2903):

      ```bash
      worktree_run(command: "cmd //c mklink //J node_modules D:\\\\code\\\\legacy-sports\\\\node_modules")
      ```

      This is instant (no disk copy), the main repo's `node_modules` is untouched, and `pnpm exec nx`, `make typecheck`, `make pc` all work after it. Skip `make wt-setup` — that's sibling-only.

      If `worktree_run` is unavailable, use the **PowerShell fallback** (raw cmd.exe junction creation with Bash mangles backslashes):

      ```bash
      powershell -Command "New-Item -ItemType Junction -Path 'D:\code\legacy-sports\.claude\worktrees\<name>\node_modules' -Target 'D:\code\legacy-sports\node_modules'"
      ```

      > **Warning**: Never use `cmd //c mklink //J node_modules D:\\code\\...` directly in bash — bash mangles the backslashes, silently creating a junction to a non-existent path (`codelegacy-sportsnode_modules`). Always use PowerShell for junction creation when `worktree_run` is unavailable. Verify the junction after creation: `test -d node_modules/nx && echo ok || echo broken`.

    - 5b. **Agent multi-root access** (optional, parallel flow): `make sync-worktrees` then `code legacy-sports.code-workspace` — gives agents search access across all sibling worktrees in one window.

6.  **All remaining work happens in the active worktree.** For native-flow sessions, that's your current `pwd` (`.claude/worktrees/<name>/`) — no path juggling needed. For parallel-flow sessions, every file edit, terminal command, and git operation must target `$wt` (the sibling worktree path). Never edit code in `D:\code\legacy-sports` with HEAD on `main`.
7.  Code: `make <target>` (e.g. `make test`, `make build`, `make typecheck`, `make lint-fix`). For project-specific targets: `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (shell fallback for `lib/db-client` migration scripts is the sole exception — see step 10). **In sibling worktrees**, use `make_run({ target: "...", worktreePath: "$wt" })` (not `cd $wt && make/pnpm`) — this correctly sets `NODE_OPTIONS` for the Windows windowsHide patch. For Nx project-specific targets in a sibling worktree: `worktree_run({ command: "pnpm exec nx run <project>:<target>" })` (after `worktree_set`).
    - 7a. **Nx project name discovery**: the Nx project name is NOT always the directory name. If `nx_run` (or `pnpm exec nx run`) fails with "Cannot find project 'foo'", use `nx_show_projects()` (MCP) to list all project names, then match by directory name or pattern. Never read `project.json` via Bash or `cat` — `nx_show_projects` is the MCP-native alternative. Example: `nx_show_projects({ withTarget: "typecheck" })` lists all projects that have a `typecheck` target.
    - 7b. **Test new test files (MANDATORY)**: if you wrote or modified any test file (`.spec.ts`, `.spec.tsx`, `.test.ts`, `.test.tsx`, `.integration.spec.ts`), run those tests locally and confirm they pass **before committing**. For Jest: `pnpm exec nx run <project>:test --testPathPattern="SpecName"`. For Playwright E2E: `pnpm exec nx build web` then `pnpm exec nx e2e web-e2e -- --grep='test name' --config=apps/web-e2e/playwright.config.ts`. Never push untested test code. See `.agents/skills/testing/SKILL.md`.
8.  Commit: Run `make format` (or `make_run format`) **before** `worktree_commit` to pre-format code and avoid formatter noise in the validation run. Then `worktree_commit(message: "type(scope): msg")` then `worktree_push()` (shell fallback: `git commit` / `git push`)
9.  Rebase onto parent: `git fetch origin ; twig rebase` — keeps branch current with its parent (main or a stacked branch)
    - 9b. **Post-rebase stabilization (BEFORE push)**: `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen --base=origin/main` — main may have changed deps, schema, or formatting. **Do NOT push until `make pc` passes** (see `skills/rebase/SKILL.md` Step 4).
10. **Migrations (BEFORE make pc)**: run `db_migration_status(worktreePath: "$wt")` and `db_migrate(worktreePath: "$wt")` MCP tools — **always do this even if you think no migrations were added.** Confirm the MCP response contains `"applied": N` (with N >= 0) or the shell output shows `Applied N new migrations` / `No new migrations to apply`. (See `skills/repo-tooling/SKILL.md`.) Shell fallback: `pnpm --prefix lib/db-client run db:status` and `pnpm --prefix lib/db-client run db:up`.
11. Validate: `make pc` — must pass before pushing or opening PR. If the formatter rewrites uncommitted files during `make pc`, `make_run` auto-commits the formatter output and retries automatically — no manual intervention needed.
    - 11a. **Amend auto-formatter commits**: when `make_run(pc)` returns `autoFormatterCommit: true`, the commit message will be `style: apply formatting`. Amend it with the proper message: `worktree_commit(amend: true, message: "type(scope): msg")`. If new files were created (tool files, skill files) that the formatter didn't stage, run `git add <files>` first, then amend. Never use `git commit --amend` via Bash — `worktree_commit(amend: true, message: ...)` is the MCP-first path.
    - 11b. **Self-review (BEFORE first push)**: run the `/review` skill (or follow the self-review steps in `skills/pr-lifecycle/SKILL.md`) to catch project-rule violations and code quality issues that `make pc` does not check. This significantly reduces Copilot review rounds.
    - 11c. **Push only after `make pc` passes**: `worktree_push()` (shell fallback: `git push --force-with-lease origin HEAD`) — pushing before validating is the #1 cause of post-rebase CI failures.
12. **Ship (REQUIRED — do NOT stop before this step)**: Create PR as **draft** first, then mark ready after validation. This prevents sweep/review agents from racing with the creating agent.
    - 12a. **Create draft PR**: `github_create_pr(title: "LS-#### type(scope): msg", body: <markdown>, draft: true, worktreePath: <path>)`. Shell fallback (only if MCP unavailable): `gh pr create --draft --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` then `bash scripts/cleanup-pr-body.sh`. The branch name must already contain at least one `LS-####` key per the [Branch Naming](#branch-naming) section — that is what powers push-based Jira "In Progress" transitions, and PR title/body keys are only a backstop for legacy branches that pre-date the convention.
    - 12b. **Apply `agent-in-progress` label**: while the PR is still a draft, apply `github_manage_labels(number: <PR#>, add: ["agent-in-progress"])`. Applying before marking ready closes the race window — the PR becomes visible to sweeps already labeled. **Remove this label when you exit the task** — either the PR merges (label becomes moot on close) or your session ends without completion (remove so the sweep can pick it up). Shell fallback: `gh pr edit <PR#> --add-label "agent-in-progress"`.
    - 12c. **Mark ready for review**: after applying the label, `github_mark_pr_ready(number: <PR#>)`. Shell fallback: `gh pr ready <PR#>`. This signals to sweep/review agents that the PR is available.
    - 12d. **Subscribe to PR activity**: immediately after marking the PR ready, call `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: <PR#> })` so CI failures, review comments, and merge events stream back into the session. Do **not** treat opening the PR as the end of the task.
    - 12e. **Request Copilot review**: `github_request_review(number: <PR#>)` (copilot defaults to true). The repository ruleset triggers Copilot review automatically for user-authored PRs, but **not for PRs authored by GitHub Apps** (the `requestReviewers` REST API silently drops Copilot when called with installation tokens). Agents must explicitly request Copilot review using a user OAuth token. Shell fallback: `gh api repos/{owner}/{repo}/pulls/{number}/requested_reviewers --method POST -f 'reviewers[]=copilot-pull-request-reviewer[bot]'`.
    - 12f. **Jira "In Review"**: transition the ticket after marking the PR ready.
13. **Watch the PR through to merge (REQUIRED)**: keep an eye on the PR until it is merged. Investigate every CI failure, review comment, and rebase conflict that arrives. Fix issues, push updates, request re-review, and rebase against `main` as needed. Use `github_view_pr({ number: <PR#> })` to poll PR status, and `ci_list_runs(branch: "<branch>", limit: 1)` / `ci_view_run(runId: <id>, includeJobs: true)` to inspect CI when no events have arrived. Do not start unrelated work, exit, or mark anything completed while the PR is still open — shepherding it to merge is part of the task.
    - **Resuming PR work (fixing review comments, rebasing, etc.)**: when picking up an existing PR in a new session or after any context switch, call `worktree_set({ key: "LS-####" })` (sibling worktrees) or `worktree_set({ key: "<absolute .claude/worktrees/... path>" })` (ephemeral worktrees) **before any git operations**. Once active, use `worktree_diff()` (not `git -C <path> diff`), `worktree_commit(...)` (not `git -C <path> commit`), and `worktree_push()` (not `git -C <path> push`) — these MCP tools automatically target the correct worktree path and apply safety guards. Reaching for raw `git -C <path> ...` commands when a worktree MCP tool exists is an anti-pattern.
14. **After merge — MCP gap audit (REQUIRED)**: once the PR is merged, follow the audit workflow in `skills/mcp-gaps/SKILL.md` to review Bash commands from this session, classify gaps, check for existing tickets under the current bucket epic, and file new ones. Also audit MCP tool overflows. This step is mandatory — it is how we continuously improve the agentic environment, and it is the signal that the task is truly done.

    > **Bucket epic lookup**: never hardcode `LS-1455` or `LS-1322`. Call `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` or `jira_get_bucket_epic({ bucket: 'client-bugs' })` to get the current epic key. These keys roll over at sprint boundaries via a Jira Automation rule + `make jira-rollover-sync ARGS=--sync`.

15. **Complete tracking tasks**: call `TaskUpdate(taskId, status: "completed")` for every task created to track this work — only after the PR is merged and the gap audit is complete. In parent/batch mode, mark the child's task completed before starting the next child. Leaving tasks open after merge is a failure mode — the task tracker is the agent's signal to the user that work is truly done.
16. Cleanup: `twig worktree clean` then `git branch -d LS-####/description` then Jira "Done" — **NEVER use `git worktree remove` directly** (see Rules)

## Command Patterns — Avoid `cd` Compound Commands

**Never use `cd <dir> && <command>` or `cd <dir> ; <command>` patterns.** These trigger security prompts in some agents and obscure which directory a command targets. Use flag-based alternatives:

| Pattern                                         | Replacement                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cd $wt && git ...`                             | `git -C $wt ...`                                                                                                                                                                                 |
| `cd $wt && make ...`                            | `make -C $wt ...`                                                                                                                                                                                |
| `cd $wt && pnpm exec nx run <project>:<target>` | `make_run({ target: "<target>", worktreePath: "$wt" })` for make-wrapped targets; `worktree_run({ command: "pnpm exec nx run <project>:<target>" })` for Nx-specific targets not in the Makefile |
| `cd terraform/main && terraform ...`            | `terraform -chdir=terraform/main ...` (Lambda app)                                                                                                                                               |
| `cd terraform/runners && ...`                   | `terraform -chdir=terraform/runners ...` (Runners)                                                                                                                                               |

## Subagent Tool Preferences

Subagents spawned via the `Agent` tool do **not** inherit AGENTS.md context. When spawning subagents (especially `Explore` type), **always include tool preference hints in the prompt**:

```
Agent(subagent_type: "Explore", prompt: """
  <task description here>

  Tool preferences:
  - Use Glob (not find/ls) for file discovery; if Glob returns empty on an absolute Windows worktree path, fall back to worktree_ls_tree or worktree_run(command: "ls <dir>")
  - Use Grep (not grep/rg/`find | xargs grep`) for content search — Grep accepts both pattern and glob filter in one call, so `find | xargs grep` is never needed
  - Use Read (not cat/head/tail) for reading files — including uncommitted changes and untracked/new files
  - Use worktree_show_file(path: "...", ref: "HEAD") for **tracked** files at a Git ref when a worktree is active (worktree_set has been called) — it runs `git show HEAD:<path>` so it does NOT see uncommitted working-tree changes or untracked files, but avoids needing absolute paths
""")
```

These four lines eliminate the most common subagent Bash anti-patterns (`find` 56x/session, `grep` 23x, `ls` 8x, `cat` on worktree paths 4x in production audits). Without them, subagents default to shell commands because they lack the project's MCP-first context.

For subagents that perform git operations in worktrees, also include:

```
  - Use worktree_run for git commands (preferred over git -C via Bash; git -C is the shell fallback when MCP tools are unavailable)
  - Use worktree_commit/worktree_push for commits and pushes
```

For subagents running PR sweeps (open-prs skill), also include:

```
  - For scanning open PRs, use github_pr_dashboard(state: "open", limit: 100, excludeDrafts: true) instead of scan-prs.ps1 or github_pr_scan — it returns richer CI/review/label data in one MCP/tool call (the tool may make multiple underlying GitHub API requests)
```

For **work subagents** dispatched by multi-ticket orchestrators (`/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`, `/work-ticket` Parent Mode) via `Agent(isolation: "worktree")`, always include **setup steps** before the work instructions — the subagent's ephemeral worktree starts empty:

```
  Setup (REQUIRED before any pnpm/make command):
  1. git fetch origin <branch>                                      # get the target branch
  2. git checkout <branch>                                           # switch to it (for existing PRs)
     OR: git branch -m claude/LS-####-short-description              # rename (for new tickets)
  3. powershell -Command "New-Item -ItemType Junction -Path 'node_modules' -Target 'D:\code\legacy-sports\node_modules'"  # junction node_modules

  Tool preferences:
  - Use worktree_commit/worktree_push for commits and pushes
  - Use Glob (not find/ls) for file discovery
  - Use Grep (not grep/rg) for content search
  - Use Read (not cat/head/tail) for reading files
```

Work subagents inherit all MCP connections from the parent session (all 9 servers), so `github_create_pr`, `worktree_commit`, `make_run`, `jira_transition` etc. are all available without the LS-2902 first-N cap that affects session-launcher worktrees. This is why multi-ticket orchestrators should always use `Agent(isolation: "worktree")` rather than session-launcher worktrees for each ticket.

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

# Primary local flow: check the `worktree` box in Claude Code's session launcher
# (no CLI command — happens at session creation time, gives native branch detection)
#
# Parallel/batch flow only:
make worktree TICKET=#### DESC=description   # create sibling worktree (parallel work only)
make wt-setup WT=$wt                         # install deps and configure sibling worktree
make kill-stale                              # kill stale node processes

# Project-specific targets (use instead of pnpm run):
pnpm exec nx run <project>:<target>
pnpm exec nx affected -t <target>

# GraphQL codegen:
make codegen

# Self-hosted runner infrastructure (requires AWS SSO + runner secrets in terraform/runners/secrets.auto.tfvars):
# As of LS-2425, runner state lives in terraform/runners/ — physically separate from terraform/main/.
make runner-apply                                    # plan + apply terraform/runners/ (with confirmation)
make runner-apply NO_CONFIRM=1                       # non-interactive (for agent use)
make runner-init                                     # terraform init terraform/runners/
make runner-plan                                     # terraform plan terraform/runners/
make ami-build VPC_ID=vpc-xxx SUBNET_ID=subnet-xxx  # build new AMI with Packer (terraform/runners/packer/)
make ami-list                                        # list existing runner AMIs
```

**`scratch/` directory**: use `scratch/` for ad-hoc output files (lint results, CI logs, debug dumps, Playwright output). Everything in `scratch/` is gitignored. Each worktree has its own isolated `scratch/` directory. **On Windows, avoid `node -e "..."` for multi-line scripts** — complex quoting and interpolation inside `node -e` args is fragile in PowerShell (backslash escapes, embedded quotes, and `$`-expansion all behave differently than in bash). Instead, write the script to `scratch/<name>.js` and run `node scratch/<name>.js`; this avoids all quoting issues and is more debuggable.

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

**Database**: Drizzle ORM with PostgreSQL. Schema lives in `lib/db-client`. Always run `db_migration_status(worktreePath: "$wt")` and `db_migrate(worktreePath: "$wt")` (MCP tools) before `make pc`.

**Logging**: Import `LOGGER` from `@legacy-sports/logging`. ESLint enforces `no-console`.

**Testing**:

- Unit/integration: Jest (`make test`)
- Web E2E: Playwright (hermetic — mock all network with `route.fulfill()`, never `route.continue()`)
- Mobile E2E: WebdriverIO

## Skills

Detailed how-to docs live in `.agents/skills/<name>/SKILL.md`. The `description` frontmatter field enables skill auto-discovery; agents can also browse the directory directly. CSV reference data is in `docs/agents/*.csv`.

## MCP Servers

| Server                  | Purpose                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worktree`              | Worktree lifecycle: list, set active, run, guard, rebase, stabilize, push                                                                                                                       |
| `legacy-sports-github`  | PR and review lifecycle (GitHub REST/GraphQL API)                                                                                                                                               |
| `legacy-sports-make`    | Makefile targets: validation, build, install, worktree setup                                                                                                                                    |
| `legacy-sports-nx`      | Nx project discovery, affected analysis, target execution                                                                                                                                       |
| `legacy-sports-jira`    | Ticket CRUD, transitions, blocker checks                                                                                                                                                        |
| `legacy-sports-db`      | Database queries, migrations, schema generation                                                                                                                                                 |
| `legacy-sports-ci`      | CI log queries, workflow reruns                                                                                                                                                                 |
| `legacy-sports-aws`     | CloudWatch log tailing, AWS SSO status checks                                                                                                                                                   |
| `legacy-sports-browser` | Dev server lifecycle, headless screenshots, GitHub image upload                                                                                                                                 |
| `claude_ai_Stripe`      | Claude Code built-in Stripe integration (Claude Code only; not configured via this repo's `.vscode/mcp.json`)                                                                                   |
| `claude_ai_Atlassian`   | Claude Code built-in Atlassian plugin — Jira + Confluence via OAuth 2.1 (no credentials needed). Cloud ID: `fb294606-6c8f-4b52-9a41-11fe45b77528`. Preferred for Jira on Claude Code on the web |

> **Server load order matters in native-worktree sessions**: Claude Code's worktree-spawned sessions only connect the first few servers from `.mcp.json` at session start (LS-2902 — suspected startup timeout / first-N cap upstream). The `.mcp.json` ordering prioritizes ticket-work tools (`worktree`, `github`, `make`, `nx`) so those load first; `aws` and `browser` are last because they are rarely used in ticket implementation. If a native session is missing a server, fall back to shell (`gh`, `git`, `pnpm exec`) or move to a sibling worktree which has all servers available.

Call `jira_auth_status` at the start of any Jira workflow. If `configured: true` and API calls succeed, use our custom tools (`jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`). If `configured: false` or API calls fail, **stop and prompt the user first** — do not silently switch tools. Tell the user their Jira auth is broken and what to fix (see Critical Rules above for the exact env vars). Only proceed with the Atlassian plugin fallback (`mcp__claude_ai_Atlassian__*`, cloud ID `fb294606-6c8f-4b52-9a41-11fe45b77528`) after the user opts in or you are confirmed to be on Claude Code on the web where the plugin is primary.

> **MCP-first principle**: always prefer MCP tools over equivalent shell commands. See `.agents/skills/mcp-first/SKILL.md` for the full per-server tool mapping (Nx, Make, Git, GitHub PR, CI, DB, AWS, browser, and Claude built-in integrations).

## Cloud Agent Mode

When running as a cloud coding agent (Claude Code on the web, Copilot Coding Agent): no worktrees/twig/acli, work directly in repo root; Linux/bash; Docker PostgreSQL; no AWS access. See `.agents/skills/cloud-agent-mode/SKILL.md` for GitHub + Jira auth setup, token configuration tables, Jira tool mapping, and available MCP servers.

**Cloud workflow (MCP-first):**

1. **Jira**: `jira_create_ticket({ summary: "...", sprint: "current" })` → `jira_check_blockers({ key: "LS-####" })` → `jira_transition({ key: "LS-####", status: "In Progress" })`
2. **Code**: implement the changes
3. **Validate**: `make_run({ target: "typecheck" })`, `make_run({ target: "lint-fix" })`, `make_run({ target: "test" })`
4. **DB**: `db_migration_status()` → `db_migrate()`
5. **Pre-commit**: `make_run({ target: "pc" })`
6. **Ship**: `worktree_commit({ message: "type(scope): msg" })` → `worktree_push()`
7. **PR**: `github_create_pr({ title: "...", body: "...", draft: true })` → `github_manage_labels({ number: <PR#>, add: ["agent-in-progress"] })` → `github_mark_pr_ready({ number: <PR#> })` → `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: <PR#> })`
8. **Jira**: `jira_transition({ key: "LS-####", status: "In Review" })`
9. **Watch to merge**: monitor PR activity, fix CI failures and review comments, rebase as needed — do not stop until the PR is merged.
10. **MCP gap audit (after merge)**: follow `skills/mcp-gaps/SKILL.md` — run this after the PR is merged.
11. **Complete tracking tasks**: `TaskUpdate(taskId, status: "completed")` for every tracking task created for this work.
12. **Jira "Done"**: `jira_transition({ key: "LS-####", status: "Done" })` (only if Branch Sync hasn't already moved it on merge)

Shell fallbacks (only if MCP server is unavailable): `make <target>`, `git commit`, `git push`, `gh pr create`.

**Cloud-to-local teleport:** When a cloud agent hits a capability boundary (AWS operations, real DB migrations, Terraform, infrastructure), it should follow the [cloud-teleport skill](.agents/skills/cloud-teleport/SKILL.md) — commit progress, write a `.claude/teleport-handoff.md` artifact, and alert the user to continue the session locally. Do not skip or silently fail on cloud-blocked steps.

## Environment Notes

- **Local**: Windows · PowerShell (`;` to chain commands, `$env:` for vars) · twig for branch management
- **Cloud**: Ubuntu Linux · bash · no worktrees/twig · Docker PostgreSQL (no AWS access)
- Package manager: pnpm 9.12.1 (enforced via corepack — never use npm or yarn)
- Commit format: `type(scope): message` (e.g. `feat(auth): add oauth`)
- **`jq` is NOT available on Windows** — never attempt `jq` via Bash on the local dev machine. For JSON parsing, use Python with explicit UTF-8 encoding: `python -c "import json, sys; data = json.load(sys.stdin); ..."` (pipe JSON into it, e.g. `cat file.json | python -c "..."`). When reading from a file, use `open(path, encoding='utf-8')` — Windows Python defaults to cp1252 encoding so always pass `encoding='utf-8'` or `encoding='utf-8-sig'`. Alternatively write a script to `scratch/<name>.py` and run it with `python scratch/<name>.py` to avoid quoting issues with `-c` arguments.
