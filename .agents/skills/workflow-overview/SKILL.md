---
name: workflow-overview
description: Complete ticket-to-merge workflow documentation covering all phases, validation gates, CI pipelines, and automation. Includes the agent step-by-step checklist (steps 0-16) and detailed CI/deploy pipeline reference.
---

# Skill: Workflow Overview

Complete reference for the Legacy Sports ticket-to-merge pipeline. Covers every phase from Jira ticket creation through post-merge deployment, including validation gates, CI automation, and separation of duties.

## Agent Workflow Checklist (Steps 0–16)

This is the step-by-step checklist agents follow for every ticket. See the detailed phase sections below for CI pipelines, validation gates, and automation specifics.

0.  **Epic check**: if the given ticket is an Epic, do NOT implement the epic directly. Instead, use `jira_view` to inspect the epic's child issues, identify the next unblocked To Do ticket, and begin working on that child ticket. If `jira_list_children` is available, prefer it; otherwise use `acli jira workitem search --jql "parent = LS-####"`. Repeat for each child until all are complete or blocked.
1.  Ticket — choose one flow:
    - **Complex or ambiguous work**: run `/define` first. It elicits a structured spec (Problem, Goals, Acceptance Criteria, Out of Scope, Technical Approach) through dialogue, then creates the Jira ticket with the description already populated. For large work spanning multiple PRs, follow up with `/slice LS-####` to decompose into child tasks.
    - **Well-understood work**: create directly via `jira_create_ticket({ summary, sprint: "current" })` (or `acli jira workitem create --summary "..." --project LS --type Task`) — note `$key`. Use the optional `context`, `risk`, and `planningNotes` fields to capture planning output (see [planning skill](skills/planning/SKILL.md) and Risk Classification in AGENTS.md).
      1b. **Planning phase**: after inspecting the ticket, run the [planning skill](skills/planning/SKILL.md) to assess scope, read relevant code, identify constraints, and classify risk. Skip for trivial tasks (typos, doc-only, single-line changes). The planning output informs implementation approach and time budget.
2.  **Dependency check**: inspect the Jira ticket for "blocked-by" linked issues. Query their status before any status transition:
    - **Blocker is not In Review or Done — STOP.** Do not proceed with the ticket. Inform the user that the blocking ticket must reach at least "In Review" before work can begin.
    - **Blocker is In Review — use its branch as the parent.** The worktree must branch from that ticket's branch, not from `main` (see `skills/worktree-workflow/SKILL.md` Step 1).
    - **Blocker is Done (or no blockers) — base off `origin/main`.**
    - **Fetch before branching (REQUIRED)**: run `git fetch origin` in the main repo immediately after the dependency decision and before Step 4 (Worktree creation). For the **sibling worktree** flow this ensures the new branch forks from the latest `origin/main` (or parent branch) rather than a stale local ref — skipping it causes the branch to silently trail main from day one. For the **native checkbox** flow the branch was already cut at session launch; fetch early and check whether an immediate `twig rebase` onto `origin/main` is needed before starting work.
3.  **Jira "In Progress" after blocker check passes**: use the `jira_transition` MCP tool with status "In Progress" (or `acli jira workitem transition --key LS-#### --status "In Progress"`) only after confirming blockers are In Review/Done (or absent). If the ticket is not in the current sprint, move it using `acli jira sprint list --board-id LS --state active` to find the active sprint ID, then `acli jira sprint add --sprint-id <id> --issue LS-####` to add the ticket — tickets worked on outside the active sprint are invisible to the team.
4.  Worktree — two flows:
    - **Primary flow (native checkbox)**: you should already be in an ephemeral worktree (spawned via the launcher's `worktree` checkbox at session start). Verify with `pwd` — it should return a `.claude/worktrees/<name>/` path. The session's branch was cut at launch time; run `git fetch origin` early in the session (before any diff, rebase, or codegen step) so local remote-tracking refs are current. No `make_worktree_create` needed, no sibling directory, no `worktree_set`.
    - **Parallel/batch flow (sibling worktree)**: only for sweep, batch, chained branches, or multi-ticket orchestration from a single parent session. **Before calling `make_worktree_create`, run `git fetch origin` in the main repo** so the new branch forks from the latest `origin/main` (or parent branch) rather than a stale local ref. Then call `make_worktree_create({ ticket: "####", description: "description" })` MCP tool (pass `parent: "LS-XXXX/branch"` for dependent tickets) — this creates the branch, worktree, **and registers the parent dependency** in one step. Then `worktree_list()` to note the path and `worktree_set(key: "LS-####")` to make it active. Shell fallback: `make worktree TICKET=#### DESC=description`. **Do NOT use `twig worktree create` directly** — it skips parent registration and creates orphaned branches.
      4b. **Jira linking (native flow)**: do **not** rename the local branch or use `remoteBranch` override — Claude Code caches the branch name at session start and never refreshes it; renaming breaks PR detection (anthropics/claude-code#18690). Instead, Jira links via **PR title** and **commit messages** containing `LS-####`. Ensure both include the ticket key. See `.agents/skills/branch-naming/SKILL.md`.

5.  Setup worktree:
    - **Parallel flow (sibling worktree)**: on Windows, `make_wt_setup({ worktreePath: "$wt" })` MCP tool or shell fallback `make wt-setup WT=$wt`. On Linux/macOS (cloud agents), `make wt-setup` is not available — run `make install` in the worktree, copy `.env` from the main repo, and optionally run `make setup-hooks`.
    - **Native flow (ephemeral worktree — REQUIRED)**: `.claude/worktrees/<name>/` ships with NO `node_modules`. Before running any pnpm or make command, junction `node_modules` from the main repo using the MCP tool (LS-3003):

      ```
      worktree_setup_node_modules()
      ```

      This is instant (no disk copy), the main repo's `node_modules` is untouched, and `pnpm exec nx`, `make typecheck`, `make pc` all work after it. The tool is idempotent — safe to call even if the junction already exists, and will auto-repair a broken junction (empty `.bin`). Skip `make wt-setup` — that's sibling-only.

      > **Note**: The `setup-worktree-junction.sh` SessionStart hook automatically validates and recreates the junction at session start. Call `worktree_setup_node_modules()` explicitly if you suspect the junction became stale mid-session (e.g. after a concurrent agent ran `make install` in the main repo).

      If `worktree_setup_node_modules` is unavailable (MCP server not loaded), use the **PowerShell fallback** (raw cmd.exe junction creation with Bash mangles backslashes):

      ```bash
      powershell -Command "New-Item -ItemType Junction -Path 'D:\code\legacy-sports\.claude\worktrees\<name>\node_modules' -Target 'D:\code\legacy-sports\node_modules'"
      ```

      > **Warning**: Never use `worktree_run(command: "cmd //c mklink //J ...")` or `cmd //c mklink //J node_modules D:\\code\\...` directly in bash — both approaches require fragile backslash escaping that silently creates junctions to wrong paths. Use `worktree_setup_node_modules()` (MCP) or the PowerShell fallback above. Verify the junction after creation: `test -d node_modules/nx && echo ok || echo broken`.

    - 5b. **Agent multi-root access** (optional, parallel flow): `make sync-worktrees` then `code legacy-sports.code-workspace` — gives agents search access across all sibling worktrees in one window.

6.  **All remaining work happens in the active worktree.** For native-flow sessions, that's your current `pwd` (`.claude/worktrees/<name>/`) — no path juggling needed. For parallel-flow sessions, every file edit, terminal command, and git operation must target `$wt` (the sibling worktree path). Never edit code in `D:\code\legacy-sports` with HEAD on `main`.
7.  Code: `make <target>` (e.g. `make test`, `make build`, `make typecheck`, `make lint-fix`). For project-specific targets: `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (shell fallback for `lib/db-client` migration scripts is the sole exception — see step 10). **In sibling worktrees**, use `make_run({ target: "...", worktreePath: "$wt" })` (not `cd $wt && make/pnpm`) — this correctly sets `NODE_OPTIONS` for the Windows windowsHide patch. For Nx project-specific targets in a sibling worktree: `worktree_run({ command: "pnpm exec nx run <project>:<target>" })` (after `worktree_set`).
    - 7a. **Nx project name discovery**: the Nx project name is NOT always the directory name. If `nx_run` (or `pnpm exec nx run`) fails with "Cannot find project 'foo'", use `nx_show_projects()` (MCP) to list all project names, then match by directory name or pattern. Never read `project.json` via Bash or `cat` — `nx_show_projects` is the MCP-native alternative. Example: `nx_show_projects({ withTarget: "typecheck" })` lists all projects that have a `typecheck` target.
    - 7b. **Test new test files (MANDATORY)**: if you wrote or modified any test file (`.spec.ts`, `.spec.tsx`, `.test.ts`, `.test.tsx`, `.integration.spec.ts`), run those tests locally and confirm they pass **before committing**. For Jest: `pnpm exec nx run <project>:test --testPathPattern="SpecName"`. For Playwright E2E: `pnpm exec nx build web` then `pnpm exec nx e2e web-e2e -- --grep='test name' --config=apps/web-e2e/playwright.config.ts`. Never push untested test code. See `skills/testing/SKILL.md`.
8.  Commit: Run `make format` (or `make_run format`) **before** `worktree_commit` to pre-format code and avoid formatter noise in the validation run. Then `worktree_commit(message: "type(scope): LS-#### msg")` — include the ticket key in the commit message for Jira linking. First push: `worktree_push({ setUpstream: true })`. Subsequent pushes: `worktree_push()`. Shell fallback: `git commit` / `git push -u origin HEAD`.
9.  Rebase onto parent: `git fetch origin ; twig rebase` — keeps branch current with its parent (main or a stacked branch)
    - 9b. **Post-rebase stabilization (BEFORE push)**: `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen --base=origin/main` — main may have changed deps, schema, or formatting. **Do NOT push until `make pc` passes** (see `skills/rebase/SKILL.md` Step 4).
10. **Migrations (BEFORE make pc)**: run `db_migration_status(worktreePath: "$wt")` and `db_migrate(worktreePath: "$wt")` MCP tools — **always do this even if you think no migrations were added.** Confirm the MCP response contains `"applied": N` (with N >= 0) or the shell output shows `Applied N new migrations` / `No new migrations to apply`. (See `skills/repo-tooling/SKILL.md`.) Shell fallback: `pnpm --prefix lib/db-client run db:status` and `pnpm --prefix lib/db-client run db:up`.
11. Validate: `make pc` — must pass before pushing or opening PR. If the formatter rewrites uncommitted files during `make pc`, `make_run` auto-commits the formatter output and retries automatically — no manual intervention needed.
    - 11a. **Amend auto-formatter commits**: when `make_run(pc)` returns `autoFormatterCommit: true`, the commit message will be `style: apply formatting`. Amend it with the proper message: `worktree_commit(amend: true, message: "type(scope): msg")`. If new files were created (tool files, skill files) that the formatter didn't stage, run `git add <files>` first, then amend. Never use `git commit --amend` via Bash — `worktree_commit(amend: true, message: ...)` is the MCP-first path.
    - 11b. **Self-review (BEFORE first push)**: run the `/review` skill (or follow the self-review steps in `skills/pr-lifecycle/SKILL.md`) to catch project-rule violations and code quality issues that `make pc` does not check. This significantly reduces Copilot review rounds.
    - 11c. **Push only after `make pc` passes**: `worktree_push()` (shell fallback: `git push --force-with-lease origin HEAD`) — pushing before validating is the #1 cause of post-rebase CI failures.
    - 11d. **Pre-push hook fails with `nx` not found or `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`**: `node_modules/.bin` is empty or missing (where the pnpm shims live). Use `worktree_push({ skipLint: true })` as a temporary workaround — **note: `SKIP_PREPUSH_LINT=1` exits the hook before conflict-marker and Terraform checks run, not just the formatter.** Do **not** use `SKIP_PREPUSH_LINT=1 git push` directly — `worktree_push` is the MCP-first path. Before pushing with `skipLint`, run Prettier manually and check for conflict markers: `node node_modules/prettier/bin/prettier.cjs --write <files>`. (Root cause: main repo `node_modules/.bin` corruption; `make install` is blocked when run from a worktree where `node_modules` is a junction. Ask the user to repair `node_modules` in the main repo by following the repo's install-guard guidance.)
12. **Ship (REQUIRED — do NOT stop before this step)**: Create PR as **draft** first, then mark ready after validation. This prevents sweep/review agents from racing with the creating agent.
    - 12a. **Create draft PR**: `github_create_pr(title: "LS-#### type(scope): msg", body: <markdown>, draft: true, worktreePath: <path>)`. Shell fallback (only if MCP unavailable): `gh pr create --draft --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` then `bash scripts/cleanup-pr-body.sh`. The branch name must already contain at least one `LS-####` key per the Branch Naming convention — that is what powers push-based Jira "In Progress" transitions, and PR title/body keys are only a backstop for legacy branches that pre-date the convention.
    - 12b. **Apply `agent-in-progress` label**: while the PR is still a draft, apply `github_manage_labels(number: <PR#>, add: ["agent-in-progress"])`. Applying before marking ready closes the race window — the PR becomes visible to sweeps already labeled. **Remove this label when you exit the task** — either the PR merges (label becomes moot on close) or your session ends without completion (remove so the sweep can pick it up). Shell fallback: `gh pr edit <PR#> --add-label "agent-in-progress"`.
    - 12c. **Mark ready for review**: after applying the label, `github_mark_pr_ready(number: <PR#>)`. Shell fallback: `gh pr ready <PR#>`. This signals to sweep/review agents that the PR is available.
    - 12d. **Prepare to watch PR activity**: immediately after marking the PR ready, continue into Step 13 so CI failures, review comments, and merge events stream back into the session. Do **not** treat opening the PR as the end of the task.
      - **Local agents**: proceed directly to Step 13's `github_wait_for_pr_event({ number: <PR#> })` loop — it blocks until an agent-actionable event fires and returns `{ event, pr, ... }`. No separate subscription call is needed; the blocking call is the single watch mechanism.
      - **Cloud agents (Claude Code on the web)**: call `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: <PR#> })` to receive real-time `<github-webhook-activity>` messages, then react to incoming messages as they arrive. Do not also call `github_wait_for_pr_event` — the webhook subscription replaces the polling loop.
    - 12e. **Request Copilot review**: `github_request_review(number: <PR#>)` (copilot defaults to true). The repository ruleset triggers Copilot review automatically for user-authored PRs, but **not for PRs authored by GitHub Apps** (the `requestReviewers` REST API silently drops Copilot when called with installation tokens). Agents must explicitly request Copilot review using a user OAuth token. Shell fallback: `gh api repos/{owner}/{repo}/pulls/{number}/requested_reviewers --method POST -f 'reviewers[]=copilot-pull-request-reviewer[bot]'`.
    - 12f. **Jira "In Review"**: transition the ticket after marking the PR ready.
13. **Watch the PR through to merge (REQUIRED)**: after marking the PR ready, call `github_wait_for_pr_event({ number: <PR#> })` — it blocks until an agent-actionable event fires (CI fail/pass, new review thread from Copilot or a human, review decision, conflicts, merged, closed) and returns `{ event, pr, ... }`. Handle the event, then call it again. This covers both Check Runs (Actions jobs) and Commit Statuses (bot/external CI like `bot-review`) without any polling loop. When you have a specific run ID (e.g. after `ci_rerun`), use `ci_wait_for_run({ runId: "<runId>" })` for that run, then return to the `github_wait_for_pr_event` loop. Do not start unrelated work, exit, or mark anything completed while the PR is still open — shepherding it to merge is part of the task.
    - **Resuming PR work (fixing review comments, rebasing, etc.)**: when picking up an existing PR in a new session or after any context switch, call `worktree_set({ key: "LS-####" })` (sibling worktrees) or `worktree_set({ key: "<absolute .claude/worktrees/... path>" })` (ephemeral worktrees) **before any git operations**. Once active, use `worktree_diff()` (not `git -C <path> diff`), `worktree_commit(...)` (not `git -C <path> commit`), and `worktree_push()` (not `git -C <path> push`) — these MCP tools automatically target the correct worktree path and apply safety guards. Reaching for raw `git -C <path> ...` commands when a worktree MCP tool exists is an anti-pattern.
    - **Check Runs vs. Commit Statuses**: GitHub has two distinct status APIs. `github_retrigger_check` only operates on **Check Runs** (Checks API). `bot-review` and similar statuses created by GitHub Apps/bots use the **Statuses API** — they will NOT be found by `github_retrigger_check`. If you see "No check run named 'X' found", use `github_list_commit_statuses({ number: <PR#> })` to see all commit statuses on the HEAD commit. To clear a stale commit status: (a) push a new commit (the workflow that sets the status will re-run), or (b) dispatch the relevant workflow via `ci_dispatch_workflow`. Do NOT use `github_retrigger_check` for commit statuses — it will always fail with "check not found". Note: `github_merge_pr(strategy: "direct")` does NOT bypass required status checks — it uses the standard merge API which still honors branch protection rules.
14. **After merge — MCP gap audit (REQUIRED)**: once the PR is merged, follow the audit workflow in `skills/mcp-gaps/SKILL.md` to review Bash commands from this session, classify gaps, check for existing tickets under the current bucket epic, and file new ones. Also audit MCP tool overflows. This step is mandatory — it is how we continuously improve the agentic environment, and it is the signal that the task is truly done.

    > **Bucket epic lookup**: never hardcode `LS-1455` or `LS-1322`. Call `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` or `jira_get_bucket_epic({ bucket: 'client-bugs' })` to get the current epic key. These keys roll over at sprint boundaries via a Jira Automation rule + `make jira-rollover-sync ARGS=--sync`.

15. **Complete tracking tasks**: call `TaskUpdate(taskId, status: "completed")` for every task created to track this work — only after the PR is merged and the gap audit is complete. In parent/batch mode, mark the child's task completed before starting the next child. Leaving tasks open after merge is a failure mode — the task tracker is the agent's signal to the user that work is truly done.
16. Cleanup: **remove all worktree junctions first** — `make wt-setup` creates junctions for `node_modules`, `.twig`, `certs/`, and `.github/skills`. Remove each with `worktree_run(command: "cmd //c rmdir <name>")` (or `worktree_unjunction()` for `node_modules`). Only once **every** junction is gone should you run `twig worktree clean`, then `git branch -d LS-####/description`, then Jira "Done". **NEVER use `git worktree remove` directly** (see Rules). Removing junctions first is critical on Windows — git and twig both follow NTFS junctions during recursive directory deletion, which can wipe the main repo's files through any remaining junction.

---

## Phase 0: Ticket & Worktree Setup

1. **Create or identify the Jira ticket** (e.g. `LS-####`). Use `jira_create_ticket` with `sprint: "current"` to add it to the active sprint.
2. **Blocker check** -- inspect the ticket for "blocked-by" links:
   - Blocker not In Review or Done -- **STOP**. Do not proceed.
   - Blocker In Review -- branch off the blocker's branch (use `PARENT=LS-XXXX/branch`).
   - Blocker Done or no blockers -- branch off `origin/main`.
3. **Transition to In Progress** -- only after blockers pass.
4. **Worktree — two flows:**
   - **Native ephemeral (primary / default for single-ticket work)** — spawn Claude Code with the launcher `worktree` checkbox checked. The session starts in `.claude/worktrees/<name>/` on an auto-generated `claude/<random>` branch. **Do not rename the local branch** — Claude Code caches it at session start; renaming breaks PR detection. Push as-is with `worktree_push()`. Jira linking works via PR title and commit messages containing `LS-####` (branch name is not required). See `.agents/skills/branch-naming/SKILL.md`.
   - **Sibling worktree (parallel / batch work only)** — `make_worktree_create({ ticket: "####", description: "..." })` MCP tool, or shell fallback `make worktree TICKET=#### DESC=description` on Windows. Use only for sweep, batch workers, chained branches, or multi-ticket orchestrators that need multiple worktrees active simultaneously. On macOS/Linux (cloud agents), the sibling flow is not available — cloud agents work directly on the branch.
5. **Setup worktree** -- Sibling flow: `make_wt_setup({ worktreePath: "$wt" })` MCP tool or shell fallback `make wt-setup WT=$wt` on Windows. Native-flow: junction `node_modules` before any pnpm/make command using `worktree_setup_node_modules()` (LS-2903/LS-3003). On macOS/Linux, run the equivalent install steps manually.
6. **Working directory** -- All subsequent work happens inside the active worktree path. For native-flow sessions, that's the current `pwd` (`.claude/worktrees/<name>/`). For sibling-flow sessions, that's `$wt` under `D:\code\legacy-sports-worktrees\`. Never edit code in `D:\code\legacy-sports` with HEAD on `main`.

## Phase 1: Local Validation

Three local validation gates run before code reaches CI.

### Pre-Commit Hook (5 checks)

Installed via `pnpm security:install-hooks` (copies `scripts/git-hooks/pre-commit` into `.git/hooks/pre-commit`). Runs automatically on `git commit`:

| #   | Check                               | Purpose                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Secret validation                   | Scans staged files for accidentally committed secrets                                |
| 2   | YAML linting                        | Validates syntax of staged `.yml`/`.yaml` files (via `yamllint`)                     |
| 3   | JSON linting                        | Validates syntax of staged `.json` files (via `jsonlint`)                            |
| 4   | Migration immutability              | Ensures previously-landed migrations are not modified or deleted                     |
| 5   | `@legacy-sports` package validation | Prevents npm-installing workspace packages that should use pnpm workspace references |

### `make pc` (pre-commit pipeline)

The full pre-commit validation pipeline backed by the `pre-commit` Makefile target. **Must pass before pushing or opening a PR.**

1. Migration immutability check (ensures previously-landed migrations are not modified or deleted)
2. Schema generation for database changes (`nx run db:print-schema`)
3. DB code generation for database changes (`nx affected -t codegen`)
4. `nx affected -t typecheck` -- TypeScript type checking on affected projects
5. `nx format:write` -- auto-formats code; if the working tree was clean, it will format and auto-amend the commit, otherwise you must commit the formatted files and re-run
6. `nx affected -t lint --fix` -- ESLint on affected projects with auto-fix where possible
7. Workflow validation (`scripts/validate-workflows.js`)
8. `nx affected -t test` -- Jest unit/integration tests on affected projects
9. `nx affected -t build` -- build validation on affected projects

Some steps are conditionally skipped (e.g., steps 1-3 for non-database changes, steps 4/6/8/9 for docs-only changes).

### Pre-Push Hook (format & safety checks)

Installed via `make setup-hooks`, which copies `.github/hooks/pre-push` (shell) into your Git hooks directory as `pre-push`. Runs automatically on `git push`:

| #   | Check / Behavior                            | Purpose                                                                      |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | git-lfs integration                         | Ensures large files are handled via Git LFS where required                   |
| 2   | Conflict marker scan \*                     | Prevents pushing files that still contain unresolved merge conflict markers  |
| 3   | Conditional `terraform validate` \*         | Validates Terraform when Terraform files are part of the push                |
| 4   | `nx format:write` \*                        | Auto-formats code before push                                                |
| 5   | Auto-amend + abort on formatting changes \* | Amends the last commit with formatting changes and aborts the push to review |

\* Checks 2--5 only run when `node_modules` is present (i.e., a non-docs-only worktree). In docs-only worktrees without dependencies, the pre-push hook exits after the git-lfs integration step and skips checks 2--5.

Can be bypassed with `--no-verify`.

## Phase 2: PR Creation

1. **Self-review** -- run the `/review` skill to catch project-rule violations before pushing.
2. **Push** -- `worktree_push(setUpstream: true)`.
3. **Create draft PR** -- `github_create_pr(draft: true)`. Draft-first prevents sweep/review agents from racing with the creating agent.
4. **Apply `agent-in-progress` label** -- `github_manage_labels(number: <PR#>, add: ["agent-in-progress"])` while still a draft, before marking ready. This closes the race window.
5. **Mark ready for review** -- `github_mark_pr_ready(number: <PR#>)`.
6. **Copilot review** -- For user-authored PRs, the repository ruleset automatically requests Copilot review; no explicit call is needed. For GitHub App-authored PRs, agents should call `github_request_review(number: <PR#>)` with a user OAuth token. Note: the REST `requestReviewers` API silently drops Copilot when called with `GITHUB_TOKEN` or installation tokens.
7. **Transition Jira to In Review** -- `jira_transition(key: "LS-####", status: "In Review")`.

## Phase 3: CI Pipeline

### Orchestrator Flow (`ci-orchestrator.yml`)

The orchestrator is the entry point for all PR CI. It dispatches reusable workflows:

```
pull_request (opened/synchronize/reopened)
        |
  determine-scope
    |            |
ci-pipeline   security-scanning (conditional)
    |
  label-pr (on failure)
  remove-merge-label-on-failure (on failure)
```

**Triggers:** `pull_request`, `push` (develop), `merge_group`, `schedule` (weekly security + nightly E2E), `workflow_dispatch`.

**Concurrency:** `orchestrator-{PR#}` with `cancel-in-progress: true` -- new pushes cancel in-flight runs.

### CI Pipeline Stages (`ci-pipeline.yml`)

```
detect-changes (~30s)
       |
  +----+----+
  |         |
quality   build         (PARALLEL - saves 5-15 min)
gates     validation
  |         |
  +----+----+
       |
     e2e              (sharded, after both pass)
       |
   summarize          (always runs - PR comments, badges, labels)
```

**Stage 1 -- Detect Changes:** Uses `dorny/paths-filter` and Nx affected analysis to determine which components changed (web, mobile, lambdas, terraform, e2e).

**Stage 2a -- Quality Gates:** Runs in parallel with build validation.

- Agent skill lint (`node scripts/lint-skills.js`)
- Migration immutability check
- Prettier formatting check (`pnpm exec prettier --check --ignore-unknown ...`)
- `nx affected -t lint`
- `nx affected -t typecheck`
- `nx affected -t test`

**Stage 2b -- Build Validation:** Runs in parallel with quality gates.

- Web build (if web/e2e changed)
- Mobile build (if mobile changed)
- Lambda build (if lambdas changed)
- Terraform validate (if terraform changed)
- Uploads web build artifact for e2e consumption

**Stage 3 -- E2E Tests:** Playwright, sharded (2 shards for PRs, 3 for nightly).

- PRs: `@critical` tests only, excludes `@slow`
- Nightly: all tests, 3 shards
- Downloads web build artifact from Stage 2b
- Uploads blob reports for merged Playwright report

**Stage 3b -- Deploy Playwright Report:** Merges shard reports and deploys to GitHub Pages (`bkrupa/legacy-sports-deploys`).

**Stage 4 -- Summarize & Report:** Always runs (unless cancelled).

- Collects results from all stages
- Posts PR comment with status table
- Updates CI status badges (on main)
- Labels PR with failure reasons
- Discord notification on main branch failures

### Parallel Checks (Separate Workflows)

These run independently from the orchestrator, triggered directly by PR events:

| Workflow                       | Trigger                     | Purpose                                              |
| ------------------------------ | --------------------------- | ---------------------------------------------------- |
| `check-schema.yml`             | PR (GraphQL file changes)   | Schema drift detection + codegen compatibility       |
| `check-migrations-applied.yml` | PR (migration file changes) | Verifies all migrations are applied to production DB |
| `security-scanning.yml`        | Dispatched by orchestrator  | Dependency audit, SAST, secret scanning              |

### CI Failure Labels

The CI pipeline automatically labels PRs with failure reasons. Labels are added on failure and removed when the check passes:

| Label                        | Source                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| `CI: Migration Immutability` | Quality gates -- migration files modified                                   |
| `CI: Formatting`             | Quality gates -- Prettier formatting check failed                           |
| `CI: Lint Failure`           | Quality gates -- ESLint errors                                              |
| `CI: Type Error`             | Quality gates -- TypeScript errors                                          |
| `CI: Test Failure`           | Quality gates -- Jest test failures                                         |
| `CI: Build Failure`          | Build validation failed                                                     |
| `CI: E2E Failure`            | Playwright E2E tests failed                                                 |
| `CI: Quality Gates`          | Fallback label when quality gates job fails but subsection outputs are lost |
| `CI: Security`               | Security scanning failed                                                    |
| `CI: Schema Drift`           | `schema.graphql` out of sync with Pothos implementation                     |
| `CI: Migration`              | Migrations not applied to production DB                                     |

## Phase 4: Copilot Review

### Flow

1. **PR opened/synchronized** -- `copilot-auto-approve.yml` `request-review` job sets `bot-review` commit status to **pending**.
2. **Copilot reviews** -- the built-in "Copilot code review" workflow runs automatically (triggered by repository ruleset with `review_on_push: true`).
3. **Review completes** -- `auto-approve` job fires via `workflow_run` trigger:
   - If no unresolved threads: sets `bot-review` to **success**, approves PR, adds `merge-when-ready` label.
   - If unresolved threads: sets `bot-review` to **failure**.
4. **Threads resolved** -- `review-check` job fires on `pull_request_review` events, re-checks thread state, and approves + labels if all clean.

### Carry-Forward on Rebase

On `synchronize` (rebase/force-push), the `request-review` job checks if Copilot already has a clean review with no unresolved threads. If so, it:

- Carries forward `bot-review` success status to the new SHA
- Re-approves the PR (if not already approved)
- Ensures `merge-when-ready` label is present

This prevents `bot-review` from getting stuck at pending forever when the Copilot workflow does not re-trigger after a force-push.

### Dependabot PRs

Dependabot PRs automatically get `bot-review` set to **success** (Copilot review skipped).

### 2-Round Fix Cap

Agents follow a 2-round cap on fixing Copilot review comments:

- **Round 1:** Fix security, bugs, and type safety issues.
- **Round 2:** Fix remaining actionable comments.
- **After round 2:** Resolve remaining threads as "acknowledged" and proceed.

### Manual Recheck

The `recheck` job can be triggered via `workflow_dispatch` with a `pr_number` input to re-evaluate Copilot thread state without pushing code. Useful after an agent resolves review threads without code changes.

## Phase 5: Jira Branch Sync (`jira-branch-sync.yml`)

Automatically keeps Jira ticket statuses in sync with branch/PR activity.

### Transition Table

| Event                               | Action | Jira Transition |
| ----------------------------------- | ------ | --------------- |
| `push` to `LS-*/...` branch         | --     | In Progress     |
| `pull_request` opened               | --     | In Review       |
| `pull_request` reopened             | --     | In Review       |
| `pull_request` closed + merged      | --     | Done            |
| `pull_request` closed without merge | --     | In Progress     |

### Epic Sync

After transitioning the child ticket, the workflow also syncs the parent epic status based on the aggregate state of all its children:

| Children State                       | Epic Transition |
| ------------------------------------ | --------------- |
| Any child In Progress/In Review/Done | In Progress     |
| All children In Review or Done       | In Review       |
| All children Done                    | Done            |

Epics with the Jira label `pinned-status` are excluded from automatic transitions.

**Authentication:** Atlassian OAuth 2.0 (client credentials grant) via `JIRA_CREDENTIALS` secret.

## Phase 6: Merge Queue (`merge-queue.yml`)

### Trigger Events

- `pull_request` labeled/unlabeled (`merge-when-ready` or `merge-to-parent`)
- `pull_request_review` submitted
- `workflow_run` completed (CI Orchestrator for PR branches)
- `workflow_dispatch` (manual)

### Concurrency

- Group: `merge-queue` with `cancel-in-progress: false` (serialized processing).
- 30-second debounce on `workflow_run` and `pull_request_review` triggers to let concurrent triggers settle.

### 6 Validation Checks

Before merging, each PR must pass all of these:

| #   | Check                                      | Behavior                                                             |
| --- | ------------------------------------------ | -------------------------------------------------------------------- |
| 1   | Not draft                                  | Draft PRs are skipped                                                |
| 2   | `merge-to-parent` label (non-main targets) | Required when PR targets a branch other than `main`                  |
| 3   | Mergeable state                            | Polls up to 60s if `mergeable=null`; rejects if conflicts            |
| 4   | No unresolved review threads               | Checks via GraphQL; outdated threads do not block                    |
| 5   | Status checks passing                      | All check runs must be completed with success; skipped checks are OK |
| 6   | No pending checks                          | Waits for in-progress checks silently (no blocker comment)           |

### SHA Pinning

The merge API call includes `sha: pr.head.sha` -- if the branch has advanced since validation, GitHub rejects the merge with a 409, preventing merging an unvalidated commit.

### Merge Method

Squash merge with sanitized commit messages (null bytes and control characters removed to prevent HTTP 500).

### Dependent PR Retargeting

After a successful merge, the queue automatically:

1. Finds all open PRs whose base branch is the merged branch.
2. Re-targets them to the merged PR's base (typically `main`).
3. Removes the `Waiting on Parent` label if present.
4. Posts a notification comment with rebase instructions.

### Post-Merge Branch Deletion

The source branch is deleted after merge (protected branches `main`, `master`, `develop` are never deleted).

### Debounce

When multiple CI runs complete within seconds, multiple `workflow_run` triggers fire. The concurrency group serializes them: one executes while one queues, and further arrivals replace the queued run. The 30-second sleep works with this behavior -- while the running job sleeps, new triggers replace the single queued slot, so only the most recent trigger remains.

## Phase 7: Post-Merge

### Deploy Workflows

| Workflow                     | Trigger                                             | Targets                                   |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `deploy-web.yml`             | Push to `main` (web/shared-components paths)        | GitHub Pages (legacy-fantasy.com)         |
| `upload-lambdas.yml`         | Push to `main` (lambda paths)                       | S3 artifact upload for Lambda deployment  |
| `lambda-terraform-apply.yml` | workflow_run: "Upload Lambdas" (on main) + dispatch | Terraform apply + Lambda function updates |
| `deploy-storybook.yml`       | Push to `main` (component paths)                    | GitHub Pages (Storybook)                  |
| `deploy-pr-preview.yml`      | PR events                                           | Preview deployments for PRs               |

### PR Preview Deployments

`deploy-pr-preview.yml` deploys web builds for open PRs to the `gh-pages` branch of `bkrupa/legacy-sports-deploys`. Previews live at **subdirectory paths**, not separate branches:

```
https://bkrupa.github.io/legacy-sports-deploys/pr-<N>/
```

where `<N>` is the numeric PR number (e.g. `pr-2317/`).

**Agents: do not list branches of `legacy-sports-deploys` to check for a preview.** There is no `pr-<N>` branch — previews are paths inside `gh-pages`. The correct way to reference or verify a preview:

- **Construct the URL directly** — if the preview deploy job ran and succeeded, the preview is there: `https://bkrupa.github.io/legacy-sports-deploys/pr-<N>/` (replace `<N>` with the PR number). Note: the preview only exists if `apps/web`, `lib/shared-components`, or `lib/ui-abstractions` were changed — CI can pass without the preview job running.
- **Verify deployment via the gh-pages tree** (if you must confirm a path exists; replace `<N>` with the PR number):
  ```bash
  PR=2317  # replace with actual PR number
  gh api "repos/bkrupa/legacy-sports-deploys/git/trees/gh-pages?recursive=1" \
    --jq ".tree[] | select(.path | startswith(\"pr-${PR}/\")) | .path" | head -5
  ```
- **Playwright reports** for a PR use the analogous `gh-pages` subdirectory: `playwright-report/pr-<N>/` (e.g. `https://bkrupa.github.io/legacy-sports-deploys/playwright-report/pr-2317/`). See [read-playwright-report skill](../read-playwright-report/SKILL.md) for how to download and parse reports.

Preview deployments are kicked off by the deploy workflow after successful PR CI; changes to `apps/web`, `lib/shared-components`, or `lib/ui-abstractions` affect whether the `web-build` artifact is present, but the deploy can still proceed via its fallback build path when that artifact is absent.

### Web Deploy Pipeline

1. Extract version info from `apps/web/package.json`
2. Build with production env vars (GraphQL host, OAuth, analytics, etc.)
3. Add CNAME for `legacy-fantasy.com`
4. Deploy to GitHub Pages
5. Upload sourcemaps to Rollbar
6. Create GitHub Release (`web-v{version}-{build_number}`)
7. Discord notifications (deploy + release)
8. Update deployment badge

### Cleanup

After merge, the merge queue deletes the source branch. Locally:

1. `twig worktree clean` (never `git worktree remove` directly)
2. `git branch -d LS-####/description`
3. Jira "Done" (if not already transitioned by Jira Branch Sync)

## Separation of Duties

Three GitHub Apps handle distinct roles to ensure no single identity both authors and approves code:

| App                                   | ID                                | Role                                                                      | Permissions                                                              |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Agent Author                          | 3158619                           | Pushes code, creates PRs                                                  | Contents (rw), Pull requests (rw)                                        |
| Review Bot (legacy-sports-review-bot) | 3142924                           | Approves PRs after Copilot review passes, manages `bot-review` status     | Pull requests (rw), Statuses (rw)                                        |
| Merge Queue Bot                       | (via `MERGE_QUEUE_APP_ID` secret) | Processes merge queue, merges PRs, retargets dependents, deletes branches | Contents (rw), Pull requests (rw), Issues (rw), Checks (r), Statuses (r) |

**Key constraint:** The Agent Author app never approves PRs. The Review Bot never pushes code. This ensures separation between code authoring and code approval.

## Required vs Advisory Checks

### Required (Blocking) Checks

These must pass for the merge queue to process a PR:

| Check                                     | Source Workflow                                              |
| ----------------------------------------- | ------------------------------------------------------------ |
| CI Pipeline (quality-gates + build + e2e) | `ci-pipeline.yml` via `ci-orchestrator.yml`                  |
| `bot-review` commit status                | `copilot-auto-approve.yml`                                   |
| GraphQL Schema & Codegen                  | `check-schema.yml` (when GraphQL files change)               |
| Verify All Migrations Applied             | `check-migrations-applied.yml` (when migration files change) |

### Advisory Checks (Not Required by Branch Protection)

These checks are not configured as _required_ branch protection rules, but they still produce GitHub check runs/commit statuses. The merge queue (`merge-queue.yml`) waits for all checks to complete and will block on any failing or pending check unless explicitly configured to ignore it, so failures here can still delay a queued merge.

| Check                    | Source Workflow              | Notes                                         |
| ------------------------ | ---------------------------- | --------------------------------------------- |
| Security Scanning        | `security-scanning.yml`      | Labels PR on failure but does not block merge |
| Deploy PR Preview        | `deploy-pr-preview.yml`      | Preview deployment for UI review              |
| Deploy Playwright Report | `ci-pipeline.yml` (sub-job)  | Report published to GitHub Pages              |
| Jira Branch Sync         | `jira-branch-sync.yml`       | Best-effort Jira transitions                  |
| Update Migration Badge   | `update-migration-badge.yml` | Badge cosmetics only                          |

## Secrets Reference

### CI & Deployment

| Secret                        | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `GITHUB_TOKEN`                | Auto-provided; PR comments, labels, check status |
| `GIST_TOKEN`                  | CI badge updates (GitHub Gist)                   |
| `CI_BADGES_GIST_ID`           | Target Gist for badge JSON files                 |
| `DISCORD_CI_WEBHOOK_URL`      | CI failure notifications                         |
| `DISCORD_DEPLOY_WEBHOOK_URL`  | Deploy success/failure notifications             |
| `DISCORD_RELEASE_WEBHOOK_URL` | Release summary notifications                    |

### GitHub Apps

| Secret                         | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `BOT_APP_PRIVATE_KEY`          | Review Bot (ID 3142924) -- Copilot auto-approve      |
| `MERGE_QUEUE_APP_ID`           | Merge Queue Bot app ID                               |
| `MERGE_QUEUE_APP_PRIVATE_KEY`  | Merge Queue Bot private key                          |
| `PREVIEW_APP_ID`               | PR preview/Playwright report deploy app ID           |
| `PREVIEW_APP_PRIVATE_KEY`      | PR preview/Playwright report deploy private key      |
| `AGENT_AUTHOR_APP_PRIVATE_KEY` | Agent Author (ID 3158619) -- code push + PR creation |

### Web App (Vite Build)

| Secret                      | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `VITE_OAUTH_PROXY_URL`      | OAuth proxy endpoint                    |
| `VITE_GOOGLE_CLIENT_ID`     | Google OAuth client ID                  |
| `VITE_GRAPHQL_HOST`         | GraphQL API endpoint                    |
| `VITE_WEBSOCKET_URL`        | WebSocket endpoint                      |
| `VITE_GA_MEASUREMENT_ID`    | Google Analytics                        |
| `VITE_GIPHY_API_KEY`        | Giphy integration                       |
| `VITE_ROLLBAR_ACCESS_TOKEN` | Client-side Rollbar (error tracking)    |
| `ROLLBAR_ACCESS_TOKEN`      | Server-side Rollbar (sourcemap uploads) |

### Jira

| Secret             | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `JIRA_CREDENTIALS` | JSON object: `{client_id, client_secret, cloud_id}` for OAuth 2.0 |

### AWS

| Secret                                                                            | Purpose                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AWS OIDC role (`arn:aws:iam::176661590736:role/legacy-sports-dev-github-actions`) | Assumed via `aws-actions/configure-aws-credentials` for RDS access, Lambda deployment, Terraform |

## Related Skills

- [pr-lifecycle](../pr-lifecycle/SKILL.md) -- PR creation, self-review, Copilot fix workflow
- [rebase](../rebase/SKILL.md) -- Rebase branches and resolve conflicts
- [debug-ci-failure](../debug-ci-failure/SKILL.md) -- Investigate and fix CI failures
- [worktree-workflow](../worktree-workflow/SKILL.md) -- Worktree creation and management
- [repo-tooling](../repo-tooling/SKILL.md) -- Make targets, Nx commands, migration scripts
