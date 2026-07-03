---
name: workflow-overview
description: 'Local (Windows worktree) implementation of the ticket-to-merge workflow. Load when: following the step-by-step ticket-to-merge runbook in a local session, setting up worktrees, or running local validation gates. The environment-neutral ordering lives in references/ticket-to-merge-spine.md; this skill is the local tool binding plus local-only setup and validation.'
---

# Skill: Workflow Overview (Local)

This is the **local implementation** of the ticket-to-merge workflow. The ordering, the gates, and the task-graph enforcement are environment-neutral and live in **[references/ticket-to-merge-spine.md](references/ticket-to-merge-spine.md)** — read that first. This skill provides the **local tool binding** (which worktree/Make/Jira MCP tool performs each step on Windows) plus the local-only setup and validation that the spine defers to your environment skill.

> **Do not restate the spine here.** The ordering used to be duplicated across this skill and `cloud-agent-mode`, and the copies drifted (the cloud copy lost the task-graph enforcement). There is now one source of truth. If you change the _order_ or a _gate_, change it in the spine.

## Start here

1. Read **[references/ticket-to-merge-spine.md](references/ticket-to-merge-spine.md)** for the canonical Steps 0–16, the five critical gates (draft-PR-before-validate, `make pc`-before-mark-ready, migrations-before-`make pc`, self-review-before-mark-ready, PR-Ready-before-watch-to-merge), and the **mandatory tracking-task graph** (Step 1c) that makes the ordering survive context compaction.
2. Use the **[Local tool binding](#local-tool-binding)** below for the concrete call behind each spine step.
3. Use **[Local worktree setup](#local-worktree-setup)** and **[Local validation gates](#local-validation-gates)** for the local-only mechanics.
4. For everything after mark-ready, see the machinery references: [ci-and-merge-pipeline.md](references/ci-and-merge-pipeline.md), [post-merge-and-deploy.md](references/post-merge-and-deploy.md), [roles-checks-secrets.md](references/roles-and-required-checks.md).

## Local tool binding

Concrete local calls for each spine action. Always prefer the MCP tool over raw shell.

| Spine step             | Local call                                                                                                                 | Notes                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create/claim ticket    | `jira_create_ticket({ sprint: "current" })`, `jira_transition({ keys, status: "In Progress", action: "claim", assignee })` | Resolve `assignee` from `JIRA_ASSIGNEE_EMAIL` (`echo "$JIRA_ASSIGNEE_EMAIL"`); omit if empty. Deprecated alias: `jira_claim_ticket({ key, assignee })`.                                                                                                                                                                     |
| Set active worktree    | `worktree_set({ key: "<absolute .claude/worktrees/... path>" })`                                                           | **Call before any other worktree MCP tool** — the server tracks an "active" worktree independent of CWD and defaults to a prior session's without this (LS-3459).                                                                                                                                                           |
| Fetch before branching | `git fetch origin`                                                                                                         | Required before any diff/rebase/codegen. Native-checkbox branch is cut at launch; check whether an immediate `twig rebase` onto `origin/main` is needed.                                                                                                                                                                    |
| Run a target           | `make_run({ target: "..." })`; project-specific: `nx_run` / `pnpm exec nx run <project>:<target>`                          | In sibling worktrees pass `worktreePath`. Discover Nx project names with `nx_show_projects` (not the directory name; never `cat project.json`).                                                                                                                                                                             |
| Commit                 | `worktree_commit({ message: "type(scope): LS-#### msg" })`                                                                 | Include the ticket key. Do **not** run `make format` before committing — `make pc` handles formatter rewrites and auto-commits them. Shell fallback when `worktree_commit` is unavailable: `git commit -m "$(cat <<'EOF'\n...\nEOF\n)"` — **never** run `git commit` without `-m` (opens `$EDITOR` and blocks the session). |
| Push                   | `worktree_push({ setUpstream: true })` first push; `worktree_push()` after                                                 | Shell fallback `git push -u origin HEAD`.                                                                                                                                                                                                                                                                                   |
| Open draft PR          | `github_create_pr({ title: "LS-#### type(scope): msg", body, draft: true, head: <branch> })`                               | Pass `head` = local branch name from `worktree_status().headRefName`; the tool runs on a remote Lambda and cannot resolve client paths.                                                                                                                                                                                     |
| Label / checkpoint     | `github_manage_labels({ prs: [<PR#>], add: ["agent-in-progress"] })`; `continuation_post({ pr: <PR#>, ... })`              | Apply `agent-in-progress` while still draft. Remove it when you exit without completing.                                                                                                                                                                                                                                    |
| Migrations             | `pnpm --prefix lib/db-client run db:status` then `db:up`                                                                   | Confirm `Applied N new migrations` or `No new migrations to apply`. Hosted `db_migrate` MCP tool applies to dev RDS over HTTPS.                                                                                                                                                                                             |
| Validate               | `make_run({ target: "pc" })` — run in the foreground; do not background validation                                         | On formatter auto-commit (`autoFormatterCommit: true`), amend with `worktree_commit({ amend: true, message: "type(scope): msg" })` — never `git commit --amend`.                                                                                                                                                            |
| Rebase / stabilize     | `git fetch origin ; twig rebase`, then `make stabilize-after-rebase`                                                       | Do **not** push until stabilize passes. See [rebase sub-reference](../worktree-workflow/references/rebase.md).                                                                                                                                                                                                              |
| Mark ready             | `github_mark_pr_ready({ number: <PR#> })`                                                                                  | Applies `bot:ready-for-review`. Then `jira_transition({ key, status: "In Review" })`.                                                                                                                                                                                                                                       |
| Watch to merge         | `github_merge_pr({ number })` (merge queue); `strategy: "direct"` for admin bypass                                         | PR events surface natively — never `sleep`-poll. Snapshot reads (`ci_list_runs`, `github_view_pr`) only in response to an event.                                                                                                                                                                                            |

### Local-only step nuances

- **Worktree-first; never edit code in `D:\code\legacy-sports` with HEAD on `main`.** All work happens in the active worktree.
- **Resuming PR work** (new session / after a context switch): call `worktree_set` before any git op, then use `worktree_diff` / `worktree_commit` / `worktree_push` — not raw `git -C <path> ...`.
- **Pre-push hook fails with `nx` not found / `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`**: `node_modules/.bin` is empty. Use `worktree_push({ skipLint: true })` as a temporary workaround — note `SKIP_PREPUSH_LINT=1` also skips the conflict-marker and Terraform checks, so run Prettier manually first (`node node_modules/prettier/bin/prettier.cjs --write <files>`) and check for conflict markers. Root cause: main-repo `node_modules/.bin` corruption; ask the user to repair it.
- **Check Runs vs Commit Statuses**: `github_retrigger_check` only operates on Check Runs. `bot-review` and similar bot statuses use the Statuses API — find them with `github_list_commit_statuses({ prNumber })`; clear a stale one by pushing a commit or dispatching the workflow, not `github_retrigger_check`.
- **Stepwise validation (timeout-prone sessions)**: run the seven `pc-*` chunks (`pc-db-prep` → `pc-typecheck` → `pc-format` → `pc-lint` → `pc-workflows` → `pc-test` → `pc-build`) **in order** — equivalent to `make pc` only if all seven run. Update the continuation checkpoint after each. Locally each chunk is `make_run({ target: "pc-<chunk>" })`. Cloud sessions bind the same chunks differently (`nx_run_pc_chunk` when present — mandatory; degraded CC web falls back to background Bash chunks): see the [spine's binding table](references/ticket-to-merge-spine.md#tool-binding-by-environment) and [cloud-agent-mode](../cloud-agent-mode/SKILL.md) — monolithic `make pc` is never valid in cloud.

## Local worktree setup

Two flows. Pick based on whether you need multiple worktrees active at once.

- **Native ephemeral (primary / default for single-ticket work)** — the launcher `worktree` checkbox spawns the session in `.claude/worktrees/<name>/` on an auto-generated `claude/<random>` branch. **Do not rename the local branch** — Claude Code caches it at session start and renaming breaks PR detection (anthropics/claude-code#18690). Jira links via PR title + commit messages containing `LS-####`. Verify with `pwd` → a `.claude/worktrees/<name>/` path.
  - **node_modules symlink (required before any pnpm/make command)** — the ephemeral worktree ships with no `node_modules`. Run from the worktree root:
    ```
    node scripts/modules-pool/link.mjs
    ```
    It links `node_modules` to the content-addressable pool slot for the worktree's lockfile and symlinks `.env`/`.env.local` from the main repo. Idempotent; auto-repairs broken links. Then verify the slot is populated:
    ```
    test -d node_modules/nx && echo ok || echo EMPTY
    ```
    If `EMPTY`, re-run the script and read its output for a `pnpm install` or Developer-Mode symlink error. **Never** create the link by hand (`mklink`, `New-Item -ItemType SymbolicLink/Junction`, `cmd //c mklink`) — those bypass path checks and break the Nx graph. The script is the only supported way.
- **Sibling worktree (parallel / batch only)** — for sweeps, batch workers, chained branches, or multi-ticket orchestration. `git fetch origin` in the main repo first, then `make_worktree_create({ ticket: "####", description: "...", parent: "LS-XXXX/branch" })` (registers the parent dependency), then `worktree_list()` + `worktree_set({ key: "LS-####" })`. Setup: `make_wt_setup({ worktreePath: "$wt" })`. Do **not** use `twig worktree create` directly (skips parent registration). In sibling worktrees, always pass `worktreePath` to `make_run` / use `worktree_run` (sets the Windows `windowsHide` `NODE_OPTIONS` patch).

> **Cleanup (after merge)**: remove all worktree symlinks first, then `twig worktree clean` — never `git worktree remove` or manual deletion (git follows NTFS links during recursive deletion and can wipe the main repo). See [post-merge-and-deploy.md](references/post-merge-and-deploy.md#cleanup) and [worktree-workflow/SKILL.md](../worktree-workflow/SKILL.md).

## Local validation gates

Three local gates run before code reaches CI.

### Pre-Commit Hook (5 checks)

Installed via `pnpm security:install-hooks` (copies `scripts/git-hooks/pre-commit` into `.git/hooks/pre-commit`). Runs on `git commit`:

| #   | Check                               | Purpose                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Secret validation                   | Scans staged files for accidentally committed secrets                                |
| 2   | YAML linting                        | Validates syntax of staged `.yml`/`.yaml` files (via `yamllint`)                     |
| 3   | JSON linting                        | Validates syntax of staged `.json` files (via `jsonlint`)                            |
| 4   | Migration immutability              | Ensures previously-landed migrations are not modified or deleted                     |
| 5   | `@legacy-sports` package validation | Prevents npm-installing workspace packages that should use pnpm workspace references |

### `make pc` (pre-commit pipeline)

The full pre-commit validation pipeline backed by the `pre-commit` Makefile target. **Must pass before a PR is marked ready** (a draft PR may be opened earlier as a durability checkpoint without `make pc` having passed — see the [spine's draft-PR-before-validate gate](references/ticket-to-merge-spine.md#critical-gates-preconditions)).

1. Migration immutability check (ensures previously-landed migrations are not modified or deleted)
2. Schema generation for database changes (`nx run db:print-schema`)
3. DB code generation for database changes (`nx affected -t codegen`)
4. `nx affected -t typecheck` -- TypeScript type checking on affected projects
5. `nx format:write` -- auto-formats code; if the working tree was clean, it formats and auto-amends the commit, otherwise you must commit the formatted files and re-run
6. `nx affected -t lint --fix` -- ESLint on affected projects with auto-fix where possible
7. Workflow validation (`scripts/validate-workflows.js`)
8. `nx affected -t test` -- Jest unit/integration tests on affected projects
9. `nx affected -t build` -- build validation on affected projects

Some steps are conditionally skipped (e.g., steps 1-3 for non-database changes, steps 4/6/8/9 for docs-only changes).

### Pre-Push Hook (format & safety checks)

Installed via `make setup-hooks` (copies `.github/hooks/pre-push` into your Git hooks dir). Runs on `git push`:

| #   | Check / Behavior                            | Purpose                                                                      |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Stray lockfile scan                         | Rejects tracked `package-lock.json` / `yarn.lock` (this repo is pnpm-only)   |
| 2   | Conflict marker scan \*                     | Prevents pushing files that still contain unresolved merge conflict markers  |
| 3   | Conditional `terraform validate` \*         | Validates Terraform when Terraform files are part of the push                |
| 4   | `nx format:write` \*                        | Auto-formats code before push                                                |
| 5   | Auto-amend + abort on formatting changes \* | Amends the last commit with formatting changes and aborts the push to review |

\* Checks 2--5 only run when `node_modules` is present (i.e., a non-docs-only worktree). In docs-only worktrees without dependencies, the pre-push hook exits after the lockfile scan. Can be bypassed with `--no-verify`.

### Self-review gate (local)

The [spine's self-review gate](references/ticket-to-merge-spine.md#critical-gates-preconditions) is mandatory before the first push. Locally: run `make lint-review-patterns` to auto-check the mechanical patterns, fix any violations, then run the `/review` skill for the judgment-requiring patterns. Read every changed file **in full** (not just diff hunks); check patterns #3, #4, #7, #8, #9, #19, #20 from [common-review-patterns.md](../pr-lifecycle/references/common-review-patterns.md); and produce a brief Self-Review Summary before pushing. `make pc` passing is necessary but not sufficient — it does not run Playwright tests at all.

### Local spec gate (integration tests)

If **any** of these is true, running the integration spec locally is a **mandatory gate before pushing**: the ticket has a "failing test" / "run the spec locally" / "DO NOT SUBMIT" block; the ticket names a specific spec as a verification gate; or **you modified any `.integration.spec.ts` file**. Before running, verify `node_modules/.bin/playwright` exists (run `node scripts/modules-pool/link.mjs` if not — it is missing in freshly set up worktrees), then run the specific spec against the live backend and confirm it passes. The following are **not** valid reasons to skip — treat each as a stop condition requiring user input:

- **⛔ "Requires real infrastructure"** — integration specs run against the live backend with test-user credentials auto-linked from the main repo's `.env`; no extra setup is needed in a standard worktree. If credentials are genuinely absent, ask the user.
- **⛔ "CI passed anyway"** — integration tests are **not run in CI for PRs**; the CI E2E suite only covers hermetic mocked specs. A CI green gives zero signal for integration correctness. Local execution is the only gate that exists.
- **⛔ "Running locally races CI on shared accounts"** — integration tests are not run in CI on PRs, so there is no concurrent run to race. The premise is false.
- **⛔ "Fix is structurally identical to a verified fix / analogous to LS-####"** — structural similarity is not evidence of correctness in a different runtime context; code analysis is not a substitute for the observation the ticket required.
- **⛔ "make pc passed"** — `make pc` does not run Playwright tests. Necessary, not sufficient.

## What happens after mark-ready

Everything downstream of the ready PR is environment-neutral — see the machinery references rather than restating it here:

- **[ci-and-merge-pipeline.md](references/ci-and-merge-pipeline.md)** — CI orchestrator + pipeline stages, manual Playwright dispatch, CI failure labels, Copilot review flow, Jira branch sync, merge queue.
- **[post-merge-and-deploy.md](references/post-merge-and-deploy.md)** — deploy workflows, the lambda-upload CI guard, the NX_BASE race, PR previews, the web deploy pipeline, cleanup.
- **[roles-checks-secrets.md](references/roles-and-required-checks.md)** — GitHub App separation of duties, required vs advisory checks (incl. the aggregate `CI Gate`, LS-7991), secrets reference.

## Related Skills

- [ticket-to-merge-spine](references/ticket-to-merge-spine.md) -- the canonical environment-neutral ordering + enforcement (read first).
- [cloud-agent-mode](../cloud-agent-mode/SKILL.md) -- the cloud implementation of the same spine.
- [pr-lifecycle](../pr-lifecycle/SKILL.md) -- PR creation, self-review, Copilot fix workflow.
- [rebase](../worktree-workflow/references/rebase.md) -- rebase branches and resolve conflicts.
- [debugging](../debugging/SKILL.md) -- investigate and fix CI failures and code defects.
- [worktree-workflow](../worktree-workflow/SKILL.md) -- worktree creation and management.
- [repo-tooling](../repo-tooling/SKILL.md) -- Make targets, Nx commands, migration scripts.
- [error-recovery](references/error-recovery.md) -- decision trees for the top 10 failure scenarios.
